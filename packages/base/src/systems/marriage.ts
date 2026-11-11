// The night at home: him and her. Goes through the same consent formula as any guest,
// and through the same body rules, so a husband who does little for her shows up in the numbers.
import type { Ctx, GameState, ModApi } from "@tc/core";
import { content } from "../content";
import { bs, clamp, HUSBAND, WIFE } from "../state";
import { fitOf, orgasm, resolveBody, useBody } from "./body";
import { actById, CONSENT_FORMULA, verdictOf } from "./encounters";
import type { ConsentInput } from "./encounters";
import { changeHeroine } from "./heroine";
import { HALL, TICKS_PER_SHIFT } from "./places";
import { runUnattended } from "./shift";

export const NIGHT_ACT = "base/night-act";
/** What the husband can ask for in the bedroom. */
export const NIGHT_ACTS = ["kiss", "grinding", "mutual_touching", "cunnilingus", "sex", "anal", "prostate", "pegging"];
export const BED = "base/bed";
export const NIGHT_DECLINE = "base/night-decline";
export const UPSTAIRS = "base/upstairs";
/** What he can pull her away from work for. */
export const UPSTAIRS_ACTS = ["mutual_touching", "blowjob", "cunnilingus", "sex"];
/** What a bedroom scene can turn into once it is going. */
export const BED_ACTS = ["grinding", "mutual_touching", "breast_play", "fingering", "handjob", "blowjob", "cunnilingus", "sixty_nine", "rimming_her", "sex", "riding", "anal", "prostate", "pegging"];
/** Where he can finish, by what they are doing. "inside" is the plain ending. */
const FINISH: Record<string, string[]> = { blowjob: ["mouth", "face"], sixty_nine: ["mouth"], handjob: ["on_her"], sex: ["inside", "on_her", "face"], riding: ["inside"], anal: ["inside", "on_her"] };
/** The toy she would use on him: the biggest one he can take, or the smallest one there is. */
const toyForHim = (state: GameState) => {
  const b = bs(state);
  const K = content.body.his;
  const fit = K.fitBase + b.husband.stretch * K.fitPerStretch;
  const owned = content.day.shop.toys.filter((t) => b.toys.includes(t.id)).sort((x, y) => x.size - y.size);
  return { fit, toy: [...owned].reverse().find((t) => t.size <= fit + K.tooBig) ?? owned[0] ?? null };
};
const BEDROOM = "home.bedroom";

export function registerMarriage(api: ModApi) {
  api.events.on("phase:enter", (ctx, e) => {
    const b = bs(ctx.state);
    const phase = e.payload!.phase;
    if (phase === "night") {
      ctx.state.where[HUSBAND] = BEDROOM;
      ctx.state.where[WIFE] = BEDROOM;
      b.night = { scene: "sleeping", asked: false, sex: null };
      // some nights she is the one who reaches for him
      const h = b.heroine;
      const W = content.body.night.wants;
      if (h.arousal >= W.arousal && h.marriage.desire >= W.desire && h.energy >= W.energy && h.satisfied < 50 && h.marriage.resent < content.manners.talk.complainAt) {
        b.night.wants = true;
        b.night.scene = "wants_him";
        ctx.log("log.night.wants");
      }
    }
    if (phase === "prep" && ctx.state.time.day > 1) {
      ctx.state.where[HUSBAND] = "cafe.hall";
      ctx.state.where[WIFE] = "cafe.bar";
    }
  });
  api.events.on("phase:exit", (ctx, e) => {
    if (e.payload!.phase === "night") bs(ctx.state).night = null;
  });

  const B = content.body.bed;
  const H = content.body.husband;
  const feel = (ctx: Ctx, desire: number, resent: number) => {
    const m = bs(ctx.state).heroine.marriage;
    // the closer to the top, the less a good night adds
    m.desire = clamp(m.desire + (desire > 0 ? (desire * (100 - m.desire)) / 50 : desire));
    m.resent = clamp(m.resent + resent);
  };
  const ask = (ctx: Ctx, actId: string, bonus = 0, why = "going") => {
    const b = bs(ctx.state);
    const input: ConsentInput = { act: actId, partner: HUSBAND, loc: BEDROOM, offer: 0, pressure: 0 };
    const res = ctx.engine.evaluate<ConsentInput>(CONSENT_FORMULA, ctx.state, input);
    const total = res.total + bonus;
    const verdict = verdictOf(total);
    b.proposals.push({ day: ctx.state.time.day, tick: -1, patron: HUSBAND, act: actId, loc: BEDROOM, verdict, seen: true, total, rows: bonus ? [...res.rows, { id: `consent.${why}`, labelKey: `factor.consent.${why}`, value: bonus }] : res.rows });
    if (b.proposals.length > 12) b.proposals.shift();
    return verdict;
  };
  /** Starts or changes what they are doing: her body takes it, the scene picture follows. */
  const setAct = (ctx: Ctx, actId: string) => {
    const b = bs(ctx.state);
    const sex = b.night!.sex!;
    sex.act = actId;
    sex.pleasure = useBody(ctx, actById(actId), b.husband.size);
    if (actId === "rimming_her") sex.pleasure = 65;
    if (actId === "pegging") {
      // his body learns the same way hers does; for her it is about who is holding whom
      const K = content.body.his;
      const { fit, toy } = toyForHim(ctx.state);
      const over = (toy?.size ?? fit) - fit;
      if (over > 0) b.husband.stretch = clamp(b.husband.stretch + over * content.body.stretchPerCm);
      b.power = clamp(b.power + K.powerPerPegging);
      sex.pleasure = clamp(K.peggingHerBase + b.power * K.peggingHerPerPower + (b.heroine.latents.cruel_streak ? 20 : 0));
    }
    b.night!.scene = actId === "sex" ? "sex" : actId;
  };

  // He reaches for her. If she is willing, the scene begins and runs turn by turn.
  api.actions.register({
    id: NIGHT_ACT,
    labelKey: "action.night",
    describe: (a) => ({ key: `action.night.${a.payload!.act}` }),
    enumerate(state) {
      const b = bs(state);
      if (state.time.phase !== "night" || !b.night || b.night.asked || b.night.sex) return [];
      if (state.where[HUSBAND] !== BEDROOM || state.where[WIFE] !== BEDROOM) return [];
      return NIGHT_ACTS.filter((act) => act !== "pegging" || b.toys.length > 0).map((act) => ({ type: NIGHT_ACT, payload: { act } }));
    },
    apply(ctx, action) {
      const b = bs(ctx.state);
      const h = b.heroine;
      const act = actById(action.payload!.act as string);
      b.night!.asked = true;
      const wanted = b.night!.wants === true;
      b.night!.wants = false;
      const verdict = ask(ctx, act.id, wanted ? content.body.night.wants.consent : 0, "wants");
      if (verdict === "refuse") {
        b.night!.scene = "cold_back";
        feel(ctx, 0, 1);
        ctx.log("log.husband.refuse", { act: `action.night.${act.id}` });
        ctx.emit("husband:refused", { act: act.id });
        return;
      }
      if (act.id === "kiss") {
        feel(ctx, 1, -1);
        changeHeroine(ctx, "mood", 2, "husband");
        ctx.log("log.husband.kiss");
        return;
      }
      // being wanted by the man she wants does part of the work
      changeHeroine(ctx, "arousal", h.marriage.desire * H.foreplay, "husband");
      const unlucky = ctx.rng.chance(H.prematureChance + Math.max(0, b.denied) * H.prematureChancePerDeniedNight);
      b.night!.sex = {
        act: act.id,
        his: clamp(B.startHis + Math.max(0, b.denied) * B.deniedStart + (unlucky ? B.unluckyStart : 0)),
        hers: clamp(h.arousal * 0.4),
        came: 0,
        turns: 0,
        top: false,
        skirt: false,
        pleasure: 0,
      };
      setAct(ctx, act.id);
      ctx.log("log.bed.start", { act: `act.${act.id}` });
      ctx.emit("bed:started", { act: act.id });
    },
  });

  // In the middle of the evening: "come upstairs for a minute" (or right here, if the place is empty).
  api.actions.register({
    id: UPSTAIRS,
    labelKey: "action.upstairs",
    describe: (a) => ({ key: `action.upstairs.${a.payload!.here ? "here" : "up"}`, params: { act: `act.${a.payload!.act}` } }),
    enumerate(state) {
      const b = bs(state);
      const sh = b.shift;
      if (state.time.phase !== "shift" || !sh || sh.upstairs || sh.tick >= TICKS_PER_SHIFT || b.encounter || b.caught || b.reaction || b.night) return [];
      if (state.where[HUSBAND] !== state.where[WIFE]) return [];
      const here = sh.visits.length === 0 ? 1 : 0;
      return UPSTAIRS_ACTS.map((act) => ({ type: UPSTAIRS, payload: { act, here } }));
    },
    apply(ctx, action) {
      const b = bs(ctx.state);
      const h = b.heroine;
      const act = actById(action.payload!.act as string);
      const guests = b.shift!.visits.length;
      b.shift!.upstairs = true;
      // leaving a full room to itself is not nothing for her
      const verdict = ask(ctx, act.id, guests > 0 ? -content.body.night.work : 0, "work");
      if (verdict === "refuse") {
        feel(ctx, 0, 0.5);
        ctx.log("log.upstairs.no");
        return;
      }
      if (guests > 0) {
        ctx.state.where[HUSBAND] = BEDROOM;
        ctx.state.where[WIFE] = BEDROOM;
      }
      changeHeroine(ctx, "arousal", h.marriage.desire * H.foreplay, "husband");
      b.night = { scene: act.id, asked: true, sex: { act: act.id, his: clamp(B.startHis + Math.max(0, b.denied) * B.deniedStart), hers: clamp(h.arousal * 0.4), came: 0, turns: 0, top: false, skirt: false, pleasure: 0 } };
      setAct(ctx, act.id);
      ctx.log(guests > 0 ? "log.upstairs.up" : "log.upstairs.here", { act: `act.${act.id}` });
      ctx.emit("bed:started", { act: act.id, shift: true });
    },
  });
  // Walking away in the middle of it ends it.
  api.events.on("entity:moved", (ctx, e) => {
    if (e.payload!.id === HUSBAND && bs(ctx.state).night?.sex) finish(ctx, "stop");
  });

  // "Not tonight": turning her down has a price, and she still has the night ahead of her.
  api.actions.register({
    id: NIGHT_DECLINE,
    labelKey: "action.night.decline",
    enumerate: (state) => (state.time.phase === "night" && bs(state).night?.wants && !bs(state).night?.sex ? [{ type: NIGHT_DECLINE }] : []),
    apply(ctx) {
      const b = bs(ctx.state);
      b.night!.wants = false;
      b.night!.asked = true;
      b.night!.scene = "cold_back";
      turnedDown(ctx, 1);
      ctx.log("log.night.declined");
    },
  });
  const turnedDown = (ctx: Ctx, weight: number) => {
    const W = content.body.night.wants;
    feel(ctx, -W.declineDesire * weight, W.declineResent * weight);
    changeHeroine(ctx, "mood", -3 * weight, "turned down");
  };
  // Rolling over without a word is an answer too, a slightly kinder one.
  api.events.on(
    "phase:exit",
    (ctx, e) => {
      if (e.payload!.phase !== "night" || !bs(ctx.state).night?.wants || bs(ctx.state).night?.asked) return;
      turnedDown(ctx, 0.6);
      ctx.log("log.night.ignored_her");
    },
    20,
  );

  /** How much one turn gives each of them, before the pace multiplier. */
  const rates = (state: GameState) => {
    const b = bs(state);
    const h = b.heroine;
    const sex = b.night!.sex!;
    const act = actById(sex.act);
    const inside = act.zones.includes("vagina") || act.zones.includes("anus");
    // a wife stretched far past his size gives him less to feel
    const zone = act.zones.includes("anus") ? "anus" : "vagina";
    const tight = inside ? clamp((b.husband.size / fitOf(state, zone)) * 1.05, B.looseForHim, 1) : 1;
    const skill = h.skills[sex.act] ?? 0;
    const his = (inside ? B.hisRateSex : B.hisRate) * (12 / b.husband.minutes) * tight * (1 + skill / 150) * (act.id === "cunnilingus" ? 0.25 : 1);
    if (sex.act === "pegging" || sex.act === "prostate") {
      const { fit, toy } = toyForHim(state);
      const hurts = sex.act === "pegging" && toy !== null && toy.size > fit + content.body.his.tooBig;
      const mine = B.hisRate * (sex.act === "prostate" ? 1.1 : hurts ? 0.4 : 0.9 + b.husband.stretch / 200);
      return { his: mine, hers: B.hersRate * (sex.pleasure / 60) * (0.6 + h.arousal / 120) };
    }
    const taste = 1 + (h.tastes.acts[sex.act] ?? 0) / 100;
    const hers = B.hersRate * (sex.pleasure / 60) * taste * (0.6 + h.arousal / 120) * (1 - h.satisfied / 160);
    return { his, hers };
  };

  /** One turn passes. Returns true when the scene is over. */
  const turn = (ctx: Ctx, his: number, hers: number): boolean => {
    const b = bs(ctx.state);
    const sex = b.night!.sex!;
    sex.turns += 1;
    ctx.state.time.minute += B.minutesPerTurn;
    sex.his = clamp(sex.his + his);
    sex.hers = clamp(sex.hers + hers);
    if (sex.hers >= 100) {
      sex.came += 1;
      sex.hers = B.afterOrgasm;
      orgasm(ctx);
      ctx.log("log.bed.she_comes");
    }
    if (sex.his >= 100) {
      finish(ctx, "auto");
      return true;
    }
    return false;
  };

  /** He comes (or stops). What it leaves her with depends on how far she got and on who she is. */
  const finish = (ctx: Ctx, how: "auto" | "choice" | "stop") => {
    const turns = bs(ctx.state).night!.sex!.turns;
    finishScene(ctx, how);
    if (ctx.state.time.phase !== "shift") return;
    // back to work: the scene object belongs to the night, and the floor has been waiting
    const b = bs(ctx.state);
    b.night = null;
    if (ctx.state.where[HUSBAND] === BEDROOM) ctx.state.where[HUSBAND] = HALL;
    ctx.state.where[WIFE] = HALL;
    ctx.log("log.upstairs.back");
    runUnattended(ctx, Math.max(1, turns) * B.minutesPerTurn);
  };
  const finishScene = (ctx: Ctx, how: "auto" | "choice" | "stop") => {
    const b = bs(ctx.state);
    const h = b.heroine;
    const sex = b.night!.sex!;
    const act = actById(sex.act);
    const oral = sex.act === "cunnilingus";
    b.night!.sex = null;
    if (how === "stop") {
      // nobody finished: he just stopped
      b.night!.scene = sex.came > 0 ? "sleeping" : "left_wanting";
      if (sex.came === 0 && sex.hers >= 40) {
        feel(ctx, -1, 1);
        changeHeroine(ctx, "mood", -2, "stopped");
      } else if (sex.came > 0) feel(ctx, 2, -2);
      ctx.log(sex.came > 0 ? "log.bed.stop.she_came" : "log.bed.stop");
      ctx.emit("bed:ended", { act: sex.act, came: sex.came > 0, outcome: "stopped", turns: sex.turns });
      return;
    }
    // close enough when he finishes: it tips her over
    const earlier = sex.came > 0; // she already came while it lasted: the ending is his
    if (sex.came === 0 && sex.hers >= B.herCloseAt) {
      sex.came = 1;
      orgasm(ctx);
    }
    changeHeroine(ctx, "energy", act.effects.energy, "husband");
    if (sex.act === "pegging" || sex.act === "prostate") {
      // this one was about him; what it does to her is in who she was while doing it
      b.night!.scene = sex.act;
      feel(ctx, sex.came > 0 ? 1 : 0, b.power >= 30 ? -1 : 0);
      ctx.log(`log.bed.his.${sex.act}`);
      ctx.emit("bed:ended", { act: sex.act, came: sex.came > 0, outcome: "his", turns: sex.turns });
      return;
    }
    const premature = sex.turns <= 2;
    let outcome: string;
    if (sex.came > 0) {
      outcome = "came";
      b.night!.scene = oral ? "cunnilingus" : "sex";
      feel(ctx, oral ? 2 : 3, -3);
      ctx.log(earlier ? "log.bed.end.after_her" : `log.husband.${oral ? "oral" : "sex"}.came`);
    } else if (sex.turns === 0 || (premature && sex.his >= 100 && sex.turns <= 1)) {
      outcome = "too_soon";
      b.night!.scene = "came_too_soon_foreplay";
      feel(ctx, -2, 2.5);
      changeHeroine(ctx, "arousal", 12, "left wanting");
      changeHeroine(ctx, "mood", -4, "left wanting");
      ctx.log("log.husband.too_soon");
    } else {
      feel(ctx, premature ? -1.5 : -1, premature ? 2 : 1.5);
      changeHeroine(ctx, "mood", -3, "left wanting");
      if (h.traits.honesty < H.fakesBelowHonesty && h.marriage.desire >= 40) {
        // she puts on a show for him: he believes it, the transparent log knows better
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
        ctx.log(premature ? `log.husband.premature.${sex.act === "anal" ? "anal" : "sex"}` : "log.husband.left_wanting");
      }
    }
    ctx.emit("husband:act", { act: sex.act, came: sex.came > 0, pleasure: sex.pleasure, outcome, turns: sex.turns });
    ctx.emit("bed:ended", { act: sex.act, came: sex.came > 0, outcome, turns: sex.turns });
  };

  // What he can do while it lasts.
  api.actions.register({
    id: BED,
    labelKey: "action.bed",
    describe: (a) => (a.payload!.to ? { key: "action.bed.switch", params: { act: `act.${a.payload!.to}` } } : a.payload!.where ? { key: `action.bed.finish.${a.payload!.where}` } : { key: `action.bed.${a.payload!.do}` }),
    enumerate(state) {
      const sex = bs(state).night?.sex;
      if (!sex) return [];
      const dos = ["keep", "faster", "slower", "talk", "kiss"];
      if (!sex.top) dos.push("top");
      if (!sex.skirt) dos.push("skirt");
      const out = dos.map((d) => ({ type: BED, payload: { do: d } as Record<string, string> }));
      if (sex.his >= B.cumAt) for (const where of FINISH[sex.act] ?? ["inside"]) out.push({ type: BED, payload: { do: "finish", where } });
      for (const to of BED_ACTS) if (to !== sex.act && (to !== "pegging" || bs(state).toys.length > 0)) out.push({ type: BED, payload: { do: "switch", to } });
      out.push({ type: BED, payload: { do: "stop" } });
      return out;
    },
    apply(ctx, action) {
      const b = bs(ctx.state);
      const sex = b.night!.sex!;
      const what = action.payload!.do as string;
      const r = rates(ctx.state);
      switch (what) {
        case "keep":
          turn(ctx, r.his, r.hers);
          break;
        case "faster":
          turn(ctx, r.his * B.faster[0], r.hers * B.faster[1]);
          break;
        case "slower":
          turn(ctx, r.his * B.slower[0], r.hers * B.slower[1]);
          break;
        case "talk":
          // dirty talk lands with an open woman and falls flat with a shy one
          turn(ctx, B.talk[0], B.talk[1] * (0.4 + b.heroine.traits.openness / 80));
          break;
        case "kiss":
          turn(ctx, B.kiss[0], B.kiss[1] * (0.5 + b.heroine.marriage.desire / 100));
          break;
        case "top":
        case "skirt":
          sex[what] = true;
          turn(ctx, 2, B.undress);
          break;
        case "finish": {
          // where he finishes is a small thing she either likes or puts up with
          const where = (action.payload!.where as string) ?? "inside";
          if (where === "face" || where === "mouth") {
            const likes = b.heroine.traits.openness >= (where === "face" ? 60 : 45) || b.heroine.latents.oral_fixation !== undefined;
            if (likes) changeHeroine(ctx, "arousal", 4, "finish");
            else feel(ctx, 0, where === "face" ? 1.5 : 0.5);
            ctx.log(`log.bed.finish.${where}${likes ? "" : ".no"}`);
          } else if (where === "on_her") ctx.log("log.bed.finish.on_her");
          finish(ctx, "choice");
          break;
        }
        case "stop":
          finish(ctx, "stop");
          break;
        case "switch": {
          const to = action.payload!.to as string;
          if (ask(ctx, to, B.switchBonus) === "refuse") {
            ctx.log("log.bed.switch.no", { act: `act.${to}` });
            turn(ctx, 0, -6);
          } else {
            setAct(ctx, to);
            ctx.log("log.bed.switch.yes", { act: `act.${to}` });
            turn(ctx, 2, 2);
          }
          break;
        }
      }
    },
  });

  // The small hours. If the evening left her wanting, she does not just fall asleep.
  api.events.on(
    "phase:exit",
    (ctx, e) => {
      if (e.payload!.phase !== "night") return;
      const b = bs(ctx.state);
      const h = b.heroine;
      const N = content.body.night;
      if (h.satisfied >= 50 || h.arousal < N.restlessArousal) return;
      const open = b.mode === "open";
      const wakes = ctx.rng.chance(N.husbandWakesChance);
      const tags = open || wakes ? undefined : ["unseen"];
      const factor = content.secrecy.styleFactor[b.husband.style];
      // a lover: someone she has gone all the way with and can text
      const upstairs = (id: string) => Object.values(b.lodgers).some((l) => l.patron === id);
      const lovers = Object.values(b.patrons)
        .filter((p) => (p.memory.hasNumber && p.memory.tier >= 7) || (upstairs(p.id) && p.memory.tier >= content.balance.hotel.nightVisitTier))
        .sort((x, y) => y.memory.affinity - x.memory.affinity || x.id.localeCompare(y.id));
      if (lovers.length > 0 && h.traits.fidelity < N.slipOutFidelityBelow && ctx.rng.chance(N.slipOutChance)) {
        const p = lovers[0]!;
        const out = resolveBody(ctx, actById("sex"), { size: p.size, minutes: 30 });
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
        if (toy) {
          useBody(ctx, actById("sex"), toy.size);
          h.satisfied = S.toySatisfied;
          h.orgasms += 1;
          h.arousal = clamp(h.arousal * 0.2);
          h.sizeTaste = clamp(h.sizeTaste + Math.max(0, toy.size - b.husband.size) * 0.5);
          ctx.log(open || wakes ? "log.night.toy.heard" : "log.night.toy", { toy: `toy.${toy.id}` }, tags);
          ctx.emit("night:self", { noticed: open || wakes, toy: toy.id });
          return;
        }
        h.satisfied = 60;
        h.arousal = clamp(h.arousal * 0.4);
        ctx.log(open || wakes ? "log.night.self.heard" : "log.night.self", undefined, tags);
        ctx.emit("night:self", { noticed: open || wakes });
      }
    },
    10, // before sleep takes the edge off
  );

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
      if (!b.night || (state.time.phase !== "night" && !b.night.sex) || state.where[HUSBAND] !== state.where[WIFE]) return null;
      return {
        type: b.night.scene,
        location: state.where[HUSBAND]!,
        participants: [
          { id: WIFE, role: "wife" },
          { id: HUSBAND, role: "husband" },
        ],
      };
    },
  });

  api.invariants.add("night-consistent", (s) => {
    const night = bs(s).night;
    if (s.time.phase === "night") return night ? null : "no night state at night";
    // outside the night it exists only while he has her to himself in the middle of a shift
    if (!night) return null;
    if (s.time.phase !== "shift" || !night.sex) return "night state does not match the phase";
    return s.where[HUSBAND] === s.where[WIFE] ? null : "a scene is running but they are in different rooms";
  });
}
