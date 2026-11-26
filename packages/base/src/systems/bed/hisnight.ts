// The small hours and her night alone, watched or not (27.11: moved out of registerMarriage, unchanged; registered at its end, as before).
// The night at home: him and her. Goes through the same consent formula as any guest,
// and through the same body rules, so a husband who does little for her shows up in the numbers.
import type { Ctx, ModApi, SceneDesc } from "@tc/core";
import { actOf, content } from "../../content";
import { bs, clamp, HUSBAND, WIFE } from "../../state";
import { fitOf, useBody } from "../body";
import { resolveSized } from "../taking";
import { think } from "../mind";
import { actById } from "../encounters";
import { changeHeroine } from "../heroine";

import { himOf, onNightMinute, passNight } from "../rhythm";
import { glance } from "../glance";
import { BEDROOM, FIN_LAYOUTS, R0, WATCH } from "./acts";

export function registerHisNight(api: ModApi) {
  // The small hours. If the evening left her wanting, she does not just fall asleep. It happens at a minute of the night
  // (so that a husband who sleeps an hour at a time can wake to it), or, if he slept straight through, as the night ends.
  onNightMinute((ctx) => {
    const n = bs(ctx.state).night;
    if (!n || n.smallDone || n.smallAt === undefined || (n.minute ?? 0) < n.smallAt || n.herAsleep === undefined || n.sex || n.up) return;
    smallHours(ctx);
  });
  api.events.on("phase:exit", (ctx, e) => void (e.payload!.phase === "night" && !bs(ctx.state).night?.smallDone && smallHours(ctx, true)), 10); // before sleep takes the edge off
  api.events.on("phase:enter", (ctx, e) => {
    const n = bs(ctx.state).night;
    if (e.payload!.phase === "night" && n) n.smallAt = R0.herBedtime + ctx.rng.int(30, 200);
  }, -6);
  /** What her night session comes to: the same bookkeeping whether anyone watched or not. `cut`: she stopped before she got there. */
  const selfDone = (ctx: Ctx, toyId: string | undefined, noticed: boolean, cut = false) => {
    const b = bs(ctx.state);
    const h = b.heroine;
    const S = content.day.shop;
    const toy = S.toys.find((t) => t.id === toyId);
    if (cut) {
      h.frustration = clamp(h.frustration + 3);
      return;
    }
    if (toy) {
      useBody(ctx, actById("sex"), toy.size);
      h.satisfied = S.toySatisfied;
      h.frustration = clamp(h.frustration - 20);
      h.orgasms += 1;
      h.arousal = clamp(h.arousal * 0.2);
      h.sizeTaste = clamp(h.sizeTaste + Math.max(0, toy.size - b.husband.size) * 0.5);
      ctx.emit("night:self", { noticed, toy: toy.id });
      return;
    }
    h.satisfied = 60;
    h.arousal = clamp(h.arousal * 0.4);
    ctx.emit("night:self", { noticed });
  };
  const watchEnd = (ctx: Ctx, how: "end" | "leave" | "quiet") => {
    const n = bs(ctx.state).night;
    const w = n?.watch;
    if (!n || !w) return;
    n.watch = undefined;
    if (how !== "quiet") ctx.log(`log.night.watch.${how}${w.toy ? ".toy" : ""}`, w.toy ? { toy: `toy.${w.toy}` } : undefined);
    selfDone(ctx, w.toy, w.awake);
    // what he lay there watching stays with him
    if (w.step > 0) himOf(ctx.state).arousal = clamp(himOf(ctx.state).arousal + 6 * w.step);
  };
  api.actions.register({
    id: WATCH,
    labelKey: "action.watch",
    describe: (a) => ({ key: `action.watch.${a.payload!.do}` }),
    enumerate(state) {
      const w = bs(state).night?.watch;
      if (state.time.phase !== "night" || !w) return [];
      return [...(w.step < 3 ? ["look"] : []), ...(w.awake ? ["join"] : []), "leave"].map((d) => ({ type: WATCH, payload: { do: d } }));
    },
    apply(ctx, action) {
      const b = bs(ctx.state);
      const h = b.heroine;
      const w = b.night!.watch!;
      const what = action.payload!.do as string;
      if (what === "look") {
        w.step += 1;
        ctx.log(`log.night.watch.look.${w.step}${w.toy ? ".toy" : ""}`, w.toy ? { toy: `toy.${w.toy}` } : undefined);
        if (w.step === 2) think(ctx, (h.seenSize ?? 0) > b.husband.size + 6 ? "thought.solo.fantasy.seen" : "thought.solo.fantasy", true);
        passNight(ctx, 5);
        if (w.step >= 3 && bs(ctx.state).night?.watch) watchEnd(ctx, "end");
        return;
      }
      if (what === "join") {
        // he lets her know he is awake and reaches for her: caught, she either pulls him in or goes cold
        const takes = h.marriage.desire >= content.body.night.wants.desire && h.marriage.resent < content.manners.talk.complainAt;
        b.night!.watch = undefined;
        if (takes) {
          b.night!.wants = true;
          b.night!.scene = "wants_him";
          changeHeroine(ctx, "arousal", 8, "caught");
          ctx.log("log.night.watch.join.yes");
        } else {
          selfDone(ctx, w.toy, true, true);
          b.night!.scene = "cold_back";
          ctx.log("log.night.watch.join.no");
        }
        return;
      }
      watchEnd(ctx, "leave");
    },
  });
  // whatever else he does, she finishes what she started
  api.events.on("bed:started", (ctx) => watchEnd(ctx, "quiet"), 5);
  api.events.on("phase:exit", (ctx, e) => void (e.payload!.phase === "night" && watchEnd(ctx, "quiet")), 5);
  api.events.on("watch:skip", (ctx) => watchEnd(ctx, "leave"));

  const smallHours = (ctx: Ctx, late = false) => {
      const b = bs(ctx.state);
      if (b.night) b.night.smallDone = true;
      const h = b.heroine;
      const N = content.body.night;
      if (h.satisfied >= 50 || h.arousal < N.restlessArousal) return;
      const open = b.mode === "open";
      // lying awake next to her he cannot miss it; asleep, it is a matter of luck
      const awake = ctx.state.time.phase === "night" && !b.night?.himAsleep && ctx.state.where[HUSBAND] === BEDROOM;
      const wakes = awake || ctx.rng.chance(N.husbandWakesChance);
      const tags = open || wakes ? undefined : ["unseen"];
      const factor = content.secrecy.styleFactor[b.husband.style];
      // a lover: someone she has gone all the way with and can text
      const upstairs = (id: string) => Object.values(b.lodgers).some((l) => l.patron === id);
      const lovers = Object.values(b.patrons)
        .filter((p) => (p.memory.hasNumber && p.memory.tier >= 7) || (upstairs(p.id) && p.memory.tier >= content.balance.hotel.nightVisitTier))
        .sort((x, y) => y.memory.affinity - x.memory.affinity || x.id.localeCompare(y.id));
      // worn out she sleeps: "I am wrung out" to him and then up the stairs to another would be a lie the game tells, not she
      const worn = (h.spent ?? 0) >= content.intimacy.fatigue.enoughAt;
      if (lovers.length > 0 && !worn && h.traits.fidelity < N.slipOutFidelityBelow && ctx.rng.chance(N.slipOutChance)) {
        const p = lovers[0]!;
        const out = resolveSized(ctx, actById("sex"), { size: p.size, minutes: 30 }, p.name);
        p.memory.acts.sex = (p.memory.acts.sex ?? 0) + 1;
        p.memory.interest = clamp(p.memory.interest + 6);
        p.memory.affinity = clamp(p.memory.affinity + (out.came ? 8 : 3), -100, 100);
        if (out.came) p.memory.orgasms += 1;
        h.marriage.desire = clamp(h.marriage.desire - 2);
        if (!open) {
          b.secretActsToday += 1;
          if (wakes) b.suspicion = clamp(b.suspicion + N.wakesSuspicion * factor);
        } else b.power = clamp(b.power + content.secrecy.powerPerTold * 2);
        const up = upstairs(p.id) ? ".upstairs" : "";
        ctx.log((open ? "log.night.slips_out.open" : wakes ? "log.night.empty_bed" : "log.night.slips_out") + up, { name: `@name:${p.name}` }, tags);
        ctx.emit("night:slipped_out", { patron: p.id, came: out.came, noticed: open || wakes });
        return;
      }
      if (ctx.rng.chance(N.selfChance)) {
        // with a toy in the drawer it is more than her fingers: the biggest one she can take
        const S = content.day.shop;
        const toy = S.toys
          .filter((t) => b.toys.includes(t.id) && t.size <= fitOf(ctx.state, "vagina") + S.toyStretchAbove)
          .sort((x, y) => y.size - x.size)[0];
        // While the night is still going it is a scene the player watches, whether the husband is awake (he can join, or turn over)
        // or asleep (then only the player sees it: playtest 26, "sleep until something happens" slept through all of it).
        if (!late && ctx.state.time.phase === "night" && b.night && ctx.state.where[HUSBAND] === BEDROOM) {
          const aware = open || wakes;
          b.night.watch = { ...(toy ? { toy: toy.id } : {}), step: 0, awake: aware };
          ctx.log(`log.night.watch.start.${aware ? "awake" : "asleep"}`);
          return;
        }
        if (toy) {
          ctx.log(open || wakes ? "log.night.toy.heard" : "log.night.toy", { toy: `toy.${toy.id}` }, tags);
          glance(ctx, "her_solo", BEDROOM, [{ id: WIFE, role: "wife" }], { toy: "vagina" });
          return void selfDone(ctx, toy.id, open || wakes);
        }
        ctx.log(open || wakes ? "log.night.self.heard" : "log.night.self", undefined, tags);
        selfDone(ctx, undefined, open || wakes);
      }
  };

  // Once she is used to more than he has, wanting him fades a little every day.
  api.events.on("day:end", (ctx) => {
    const b = bs(ctx.state);
    const gap = fitOf(ctx.state, "vagina") - b.husband.size;
    const Dr = content.consent.drift;
    // what counts is how much she has come to want more than he has, not the stretch itself
    if (gap > 1) b.heroine.marriage.desire = clamp(b.heroine.marriage.desire - Math.min(gap, Dr.husbandSizeGap) * Dr.husbandSize * (b.heroine.sizeTaste / 50));
    // a day on which she went far with another man takes a little of her wanting her husband with it
    const today = b.diary?.find((d) => d.day === ctx.state.time.day);
    const far = Object.entries(today?.with ?? {}).some(([who, acts]) => who !== HUSBAND && Object.keys(acts).some((a) => (actOf(a)?.tier ?? 0) >= 5));
    if (far) b.heroine.marriage.desire = clamp(b.heroine.marriage.desire - Dr.husbandOthers);
  });

  api.scenes.register({
    id: "base.night",
    priority: 20,
    match(state): SceneDesc | null {
      const b = bs(state);
      if (!b.night || (state.time.phase !== "night" && !b.night.sex) || state.where[HUSBAND] !== state.where[WIFE]) return null;
      if (b.night.watch) return { type: "her_solo", location: state.where[HUSBAND]!, participants: [{ id: WIFE, role: "wife" }], ...(b.night.watch.toy ? { tags: { toy: "vagina" } } : {}) };
      const fin = b.night.fin && !b.night.sex ? `fin_${b.night.fin}` : "";
      // once she is asleep the night is a sleeping picture, whatever came before it
      const type = b.night.herAsleep !== undefined && !b.night.sex ? "sleeping" : FIN_LAYOUTS.has(fin) ? fin : b.night.scene;
      // a scene of three has the guest in it: he is in the key too, or a pack cannot tell it from the two of them
      const third = b.night.third && content.scenes.find((l) => l.id === type)?.figures.some((f) => f.role === "patron") ? [{ id: b.night.third, role: "patron" }] : [];
      return {
        type,
        location: state.where[HUSBAND]!,
        participants: [
          { id: WIFE, role: "wife" },
          ...third,
          { id: HUSBAND, role: "husband" },
        ],
        ...(b.night.fin && !b.night.sex ? { tags: { fin: b.night.fin, ...(b.night.lock && b.night.fin === "inside" ? { lock: "1" } : {}) } } : {}),
      };
    },
  });

  api.invariants.add("night-consistent", (s) => {
    const night = bs(s).night;
    if (s.time.phase === "night") return night ? null : "no night state at night";
    // outside the night it exists only while he has her to himself, in the afternoon or in the middle of a shift
    if (!night) return null;
    if ((s.time.phase !== "shift" && s.time.phase !== "prep") || !night.sex) return "night state does not match the phase";
    return s.where[HUSBAND] === s.where[WIFE] ? null : "a scene is running but they are in different rooms";
  });
}
