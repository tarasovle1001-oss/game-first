// The night at home: him and her. Goes through the same consent formula as any guest,
// and through the same body rules, so a husband who does little for her shows up in the numbers.
import type { ModApi } from "@tc/core";
import { content } from "../content";
import { bs, clamp, HUSBAND, WIFE } from "../state";
import { fitOf, resolveBody } from "./body";
import { actById, CONSENT_FORMULA, verdictOf } from "./encounters";
import type { ConsentInput } from "./encounters";
import { changeHeroine } from "./heroine";

export const NIGHT_ACT = "base/night-act";
/** What the husband can ask for in the bedroom. */
export const NIGHT_ACTS = ["kiss", "cunnilingus", "sex", "anal"];
const BEDROOM = "home.bedroom";

export function registerMarriage(api: ModApi) {
  api.events.on("phase:enter", (ctx, e) => {
    const b = bs(ctx.state);
    const phase = e.payload!.phase;
    if (phase === "night") {
      ctx.state.where[HUSBAND] = BEDROOM;
      ctx.state.where[WIFE] = BEDROOM;
      b.night = { scene: "sleeping", asked: false };
    }
    if (phase === "prep" && ctx.state.time.day > 1) {
      ctx.state.where[HUSBAND] = "cafe.hall";
      ctx.state.where[WIFE] = "cafe.bar";
    }
  });
  api.events.on("phase:exit", (ctx, e) => {
    if (e.payload!.phase === "night") bs(ctx.state).night = null;
  });

  api.actions.register({
    id: NIGHT_ACT,
    labelKey: "action.night",
    describe: (a) => ({ key: `action.night.${a.payload!.act}` }),
    enumerate(state) {
      const b = bs(state);
      if (state.time.phase !== "night" || !b.night || b.night.asked) return [];
      if (state.where[HUSBAND] !== BEDROOM || state.where[WIFE] !== BEDROOM) return [];
      return NIGHT_ACTS.map((act) => ({ type: NIGHT_ACT, payload: { act } }));
    },
    apply(ctx, action) {
      const b = bs(ctx.state);
      const h = b.heroine;
      const act = actById(action.payload!.act as string);
      const input: ConsentInput = { act: act.id, partner: HUSBAND, loc: BEDROOM, offer: 0, pressure: 0 };
      const res = ctx.engine.evaluate<ConsentInput>(CONSENT_FORMULA, ctx.state, input);
      const verdict = verdictOf(res.total);
      b.night!.asked = true;
      b.proposals.push({ day: ctx.state.time.day, tick: -1, patron: HUSBAND, act: act.id, loc: BEDROOM, verdict, seen: true, total: res.total, rows: res.rows });
      if (b.proposals.length > 12) b.proposals.shift();

      const feel = (desire: number, resent: number) => {
        // the closer to the top, the less a good night adds
        h.marriage.desire = clamp(h.marriage.desire + (desire > 0 ? (desire * (100 - h.marriage.desire)) / 50 : desire));
        h.marriage.resent = clamp(h.marriage.resent + resent);
      };
      if (verdict === "refuse") {
        b.night!.scene = "cold_back";
        feel(0, 1);
        ctx.log("log.husband.refuse", { act: `action.night.${act.id}` });
        ctx.emit("husband:refused", { act: act.id });
        return;
      }
      if (act.id === "kiss") {
        feel(1, -1);
        changeHeroine(ctx, "mood", 2, "husband");
        ctx.log("log.husband.kiss");
        return;
      }
      // being wanted by the man she wants does part of the work
      changeHeroine(ctx, "arousal", h.marriage.desire * content.body.husband.foreplay, "husband");
      const oral = act.id === "cunnilingus";
      // how long he lasts tonight: less after days without, less the better she has become at this
      const H = content.body.husband;
      const skill = h.skills[act.id] ?? 0;
      const lasts = oral ? 15 : b.husband.minutes * Math.max(0.15, 1 - Math.max(0, b.denied) * H.shorterPerDeniedNight) * (1 - skill / H.skillHalvesAt / 2);
      changeHeroine(ctx, "energy", act.effects.energy, "husband");

      if (!oral && lasts < H.tooSoonBelow) {
        // over before it began: nothing for her at all
        b.night!.scene = "came_too_soon_foreplay";
        feel(-2, 2.5);
        changeHeroine(ctx, "arousal", 12, "left wanting");
        changeHeroine(ctx, "mood", -4, "left wanting");
        ctx.log("log.husband.too_soon");
        ctx.emit("husband:act", { act: act.id, came: false, pleasure: 0, outcome: "too_soon" });
        return;
      }
      const out = resolveBody(ctx, act, { size: b.husband.size, minutes: lasts });
      let outcome: string;
      if (out.came) {
        outcome = "came";
        b.night!.scene = oral ? "cunnilingus" : "sex";
        feel(oral ? 2 : 3, -3);
        ctx.log(`log.husband.${oral ? "oral" : "sex"}.came`);
      } else {
        // he is done, she is not. What she does about it depends on who she is
        const premature = !oral && lasts < H.prematureBelow;
        feel(premature ? -1.5 : -1, premature ? 2 : 1.5);
        changeHeroine(ctx, "mood", -3, "left wanting");
        if (h.traits.honesty < H.fakesBelowHonesty && h.marriage.desire >= 40) {
          // she puts on a show for him: he believes it, the debug log knows better
          outcome = "faked";
          b.night!.scene = "faking_it";
          h.traits.honesty = clamp(h.traits.honesty - 1);
          changeHeroine(ctx, "arousal", 10, "left wanting");
          ctx.log("log.husband.sex.came");
          ctx.log("log.husband.faked", undefined, ["unseen"]);
        } else if (h.traits.libido >= H.finishesHerselfAtLibido || h.arousal >= 60) {
          outcome = "finished_herself";
          b.night!.scene = "finishing_herself";
          h.satisfied = 60;
          changeHeroine(ctx, "arousal", -h.arousal * 0.6, "finished herself");
          ctx.log(premature ? "log.husband.premature.finishes_herself" : "log.husband.finishes_herself");
        } else {
          outcome = premature ? "premature" : "left_wanting";
          b.night!.scene = premature ? "premature_finish" : "left_wanting";
          changeHeroine(ctx, "arousal", 10, "left wanting");
          ctx.log(premature ? `log.husband.premature.${act.id === "anal" ? "anal" : "sex"}` : "log.husband.left_wanting");
        }
      }
      ctx.emit("husband:act", { act: act.id, came: out.came, pleasure: out.pleasure, outcome });
    },
  });

  // Once she is used to more than he has, wanting him fades a little every day.
  api.events.on("day:end", (ctx) => {
    const b = bs(ctx.state);
    const gap = fitOf(ctx.state, "vagina") - b.husband.size;
    if (gap > 1) b.heroine.marriage.desire = clamp(b.heroine.marriage.desire - gap * content.consent.drift.fidelity * 2);
  });

  api.scenes.register({
    id: "base.night",
    priority: 20,
    match(state) {
      const b = bs(state);
      if (state.time.phase !== "night" || !b.night || state.where[HUSBAND] !== BEDROOM) return null;
      return {
        type: b.night.scene,
        location: BEDROOM,
        participants: [
          { id: WIFE, role: "wife" },
          { id: HUSBAND, role: "husband" },
        ],
      };
    },
  });

  api.invariants.add("night-consistent", (s) => ((s.time.phase === "night") === (bs(s).night !== null) ? null : "night state does not match the phase"));
}
