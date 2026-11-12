// The night at home: him and her. Goes through the same consent formula as any guest,
// and through the same body rules, so a husband who does little for her shows up in the numbers.
import type { Ctx, GameState, ModApi } from "@tc/core";
import { content } from "../content";
import { outcomeOf, refusalKey, setOutcome, slurTags } from "./voice";
import { bs, clamp, HUSBAND, WIFE } from "../state";
import { fitOf, orgasm, pleasureFor, resolveBody, useBody } from "./body";
import { actById, CONSENT_FORMULA, verdictOf } from "./encounters";
import type { ConsentInput } from "./encounters";
import { changeHeroine } from "./heroine";
import { HALL, TICKS_PER_SHIFT } from "./places";
import { runUnattended } from "./shift";
import { passPrep } from "./day";

import { himOf, tired } from "./rhythm";
export const NIGHT_ACT = "base/night-act";
/** What the husband can ask for in the bedroom. */
export const NIGHT_ACTS = ["kiss", "grinding", "mutual_touching", "cunnilingus", "sex", "anal", "rimming_him", "prostate", "dildo_him", "pegging", "fisting_him", "ignore_handjob", "facesitting", "edging", "cleanup", "chastity", "toy_on_her", "masturbate_show", "footjob", "spank_him", "tease_denial", "thigh_ride"];
/** What is done to him: her finger, a toy in her hand, a toy on straps, her whole hand. */
export const HIS_ACTS = ["prostate", "dildo_him", "pegging", "fisting_him"];
const NEEDS_TOY = new Set(["dildo_him", "pegging"]);
export const BED = "base/bed";
export const NIGHT_DECLINE = "base/night-decline";
export const NIGHT_SELF = "base/night-self";
export const AFTER = "base/after";
export const UPSTAIRS = "base/upstairs";
/** What he can pull her away from work for. */
export const UPSTAIRS_ACTS = ["mutual_touching", "blowjob", "cunnilingus", "sex"];
/** What a bedroom scene can turn into once it is going. */
/** Acts for the bed with a guest in it: only while he is there. */
export const JOIN_ACTS = ["join_dp", "join_two_mouths", "join_hold", "join_after"];
/** Acts that end in a picture and a line of their own. */
const OWN_END = new Set(["ignore_handjob", "facesitting", "edging", "cleanup", "chastity", "toy_on_her", "masturbate_show", "footjob", "spank_him", "tease_denial", "thigh_ride", "join_dp", "join_two_mouths", "join_hold", "join_after"]);
/** What she gets out of an act that is not about a zone of hers being filled. */
const HER_PLEASURE: Record<string, number> = {"facesitting": 70, "cleanup": 60, "toy_on_her": 72, "masturbate_show": 60, "thigh_ride": 66, "tease_denial": 45, "join_dp": 80, "join_two_mouths": 30, "join_hold": 75, "join_after": 60};
export const BED_ACTS = ["ignore_handjob", "facesitting", "edging", "cleanup", "chastity", "toy_on_her", "masturbate_show", "footjob", "spank_him", "tease_denial", "thigh_ride", "join_dp", "join_two_mouths", "join_hold", "join_after", "grinding", "mutual_touching", "breast_play", "fingering", "handjob", "blowjob", "cunnilingus", "sixty_nine", "rimming_her", "sex", "riding", "anal", "rimming_him", "prostate", "dildo_him", "pegging", "fisting_him"];
/** Where he can finish, by what they are doing. "inside" is the plain ending. */
const FINISH: Record<string, string[]> = { blowjob: ["mouth", "face", "chest"], sixty_nine: ["mouth"], handjob: ["on_her", "chest"], sex: ["inside", "belly", "chest", "face"], riding: ["inside", "belly"], anal: ["inside", "back"], grinding: ["belly"], mutual_touching: ["on_her"] };
const PULL_OUT = new Set(["on_her", "belly", "back", "chest"]);
const LEAD = content.intimacy.lead;
/** The toy she would use on him: the biggest one he can take, or the smallest one there is. */
const toyForHim = (state: GameState) => {
  const b = bs(state);
  const K = content.body.his;
  const fit = K.fitBase + b.husband.stretch * K.fitPerStretch;
  const owned = content.day.shop.toys.filter((t) => b.toys.includes(t.id)).sort((x, y) => x.size - y.size);
  return { fit, toy: [...owned].reverse().find((t) => t.size <= fit + K.tooBig) ?? null }; // nothing that fits = nothing she can use on him
};
/** Whether an act done to him is possible at all right now: a toy to do it with, a body that can take it. */
/** What a man can still do for her with nothing left in him. */
export const SOFT_ACTS = ["facesitting", "cleanup", "chastity", "toy_on_her", "masturbate_show", "spank_him", "thigh_ride", "cunnilingus", "fingering", "rimming_her", "breast_play", "mutual_touching", "prostate", "dildo_him", "pegging", "fisting_him"];
export const hisActOpen = (state: GameState, act: string) => {
  const b = bs(state);
  if (b.night?.sex?.soft && !SOFT_ACTS.includes(act)) return false;
  if (JOIN_ACTS.includes(act)) return !!b.night?.third;
  if (NEEDS_TOY.has(act) && toyForHim(state).toy === null) return false;
  if (act === "fisting_him") return toyForHim(state).fit + content.body.his.tooBig >= content.body.his.fistSize;
  return true;
};
/** What doing it to him gives her: it is about who is holding whom. */
const herFromHis = (state: GameState, act: string) => {
  const b = bs(state);
  const K = content.body.his;
  return clamp(K.peggingHerBase * (K.herShare[act] ?? 1) + b.power * K.peggingHerPerPower + (b.heroine.latents.cruel_streak ? 20 : 0));
};
const BEDROOM = "home.bedroom";

const FIN_LAYOUTS = new Set(["fin_face", "fin_mouth", "fin_chest", "fin_belly", "fin_back", "fin_inside"]);

export function registerMarriage(api: ModApi) {
  api.events.on("phase:enter", (ctx, e) => {
    const b = bs(ctx.state);
    const phase = e.payload!.phase;
    if (phase === "night") {
      ctx.state.where[HUSBAND] = BEDROOM;
      ctx.state.where[WIFE] = BEDROOM;
      b.night = { scene: "night_awake", asked: false, sex: null };
      // some nights she is the one who reaches for him
      const h = b.heroine;
      const W = content.body.night.wants;
      const promised = b.promised === ctx.state.time.day && h.energy >= W.energy / 2; // she started something earlier today
      if (promised || (h.arousal >= W.arousal && h.marriage.desire >= W.desire && h.energy >= W.energy && h.satisfied < 50 && h.marriage.resent < content.manners.talk.complainAt)) {
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
  const ask = (ctx: Ctx, actId: string, bonus = 0, why = "going", loc: string = BEDROOM, more: [string, number][] = []) => {
    const b = bs(ctx.state);
    const input: ConsentInput = { act: actId, partner: HUSBAND, loc, offer: 0, pressure: 0 };
    const res = ctx.engine.evaluate<ConsentInput>(CONSENT_FORMULA, ctx.state, input);
    const extra = [...(bonus ? [[why, bonus] as [string, number]] : []), ...more.filter(([, v]) => v !== 0)];
    const total = res.total + extra.reduce((s, [, v]) => s + v, 0);
    const verdict = verdictOf(total);
    b.proposals.push({ day: ctx.state.time.day, tick: -1, patron: HUSBAND, act: actId, loc, verdict, seen: true, total, rows: [...res.rows, ...extra.map(([k, value]) => ({ id: `consent.${k}`, labelKey: `factor.consent.${k}`, value }))] });
    if (b.proposals.length > 12) b.proposals.shift();
    setOutcome(ctx, outcomeOf(verdict), HUSBAND);
    return verdict;
  };
  /** Starts or changes what they are doing: her body takes it, the scene picture follows. */
  const setAct = (ctx: Ctx, actId: string) => {
    const b = bs(ctx.state);
    const sex = b.night!.sex!;
    sex.act = actId;
    sex.pleasure = useBody(ctx, actById(actId), b.husband.size);
    if (actId === "rimming_her") sex.pleasure = 65;
    if (actById(actId).lines) {
      sex.pleasure = HER_PLEASURE[actId] ?? 15; // hers by what it is, not by his size
      ctx.log(`log.act.${actId}.start`);
    }
    if (actId === "rimming_him") sex.pleasure = 20; // she is the one giving
    if (HIS_ACTS.includes(actId)) {
      // his body learns the same way hers does; for her it is about who is holding whom
      const K = content.body.his;
      const { fit, toy } = toyForHim(ctx.state);
      const size = actId === "prostate" ? K.fingerSize : actId === "fisting_him" ? K.fistSize : (toy?.size ?? fit);
      const over = size - fit;
      // every time teaches his body a little; something bigger than he is used to teaches it more
      b.husband.stretch = clamp(b.husband.stretch + K.practice + Math.max(0, over) * content.body.stretchPerCm);
      b.power = clamp(b.power + (K.power[actId] ?? 0));
      sex.pleasure = herFromHis(ctx.state, actId);
    }
    b.night!.scene = b.night!.third && !JOIN_ACTS.includes(actId) ? "join_husband" : actId === "sex" ? "sex" : actId; // with a guest in it there are three of them in the picture, whatever he does
    // the first time he is inside her tonight, what she feels of him is said (or thought)
    const act = actById(actId);
    const zone = act.zones.includes("anus") ? "anus" : act.zones.includes("vagina") ? "vagina" : null;
    if (zone && !sex.looseSaid) {
      const ratio = b.husband.size / fitOf(ctx.state, zone);
      const level = ratio < 0.42 ? 3 : ratio < 0.6 ? 2 : ratio < 0.85 ? 1 : 0; // about 65, 33 and 10 on the stretch scale for an average husband
      if (level > 0) {
        sex.looseSaid = true;
        ctx.log(`log.bed.loose.${level}`, undefined, level < 3 ? ["unseen"] : undefined); // the last one she says aloud
      }
    }
  };
  /** How much of him she can feel, and he of her: 1 = a fit, down to almost nothing. */
  const tightness = (state: GameState, actId: string) => {
    const act = actById(actId);
    const zone = act.zones.includes("anus") ? "anus" : act.zones.includes("vagina") ? "vagina" : null;
    if (!zone) return 1;
    const ratio = bs(state).husband.size / fitOf(state, zone);
    return clamp((ratio - B.looseNoneAt) / (B.looseFullAt - B.looseNoneAt), B.looseForHim, 1);
  };
  const GIVES_HER = new Set(["cunnilingus", "rimming_her", "fingering", "breast_play"]);
  const NEEDS_HER = new Set(["handjob", "blowjob", "riding", "sixty_nine", "rimming_him", "prostate", "dildo_him", "pegging", "fisting_him", "grinding", "mutual_touching"]);
  /** What a turn of this act is worth to her, 0..100: her body, or her reasons for doing it. */
  const rewardOf = (state: GameState, actId: string, pleasure: number) => {
    const b = bs(state);
    const h = b.heroine;
    const R = B.reward;
    let motive = 0;
    for (const why of actById(actId).motives ?? []) {
      if (why === "affection") motive += h.marriage.desire * R.affection;
      if (why === "giving" && (h.latents.oral_fixation !== undefined || h.latents.submissive !== undefined)) motive += R.giving;
      if (why === "power") motive += b.power * R.power + (h.latents.cruel_streak !== undefined ? R.cruel : 0);
    }
    return clamp(Math.max(pleasure, pleasure * 0.6 + motive));
  };
  /** She has had enough of how this is going and does something about it. */
  const herMove = (ctx: Ctx) => {
    const b = bs(ctx.state);
    const h = b.heroine;
    const sex = b.night!.sex!;
    const R = B.reward;
    const now = rewardOf(ctx.state, sex.act, sex.pleasure);
    const best = BED_ACTS.filter((a) => a !== sex.act && hisActOpen(ctx.state, a))
      .map((a) => ({ a, r: rewardOf(ctx.state, a, HIS_ACTS.includes(a) ? herFromHis(ctx.state, a) : pleasureFor(ctx.state, actById(a), b.husband.size)) }))
      .sort((x, y) => y.r - x.r || x.a.localeCompare(y.a))[0];
    const loving = h.marriage.desire >= R.lovingDesire || h.latents.submissive !== undefined;
    sex.bored = R.limit - 1.5; // she waits a little for his answer before the next move
    if (best && best.r >= now + R.better && sex.ignored < 2) {
      sex.asks = best.a;
      ctx.log("log.bed.she_asks", { act: `act.${best.a}` });
      return;
    }
    if (loving && !ctx.rng.chance(R.lovingOut)) {
      if (sex.asks === "finish") return; // she has said it already and goes on waiting
      sex.asks = "finish";
      ctx.log("log.bed.asks_finish");
      return;
    }
    if (!loving && h.traits.confidence >= 55 && ctx.rng.chance(R.dropChance)) {
      ctx.log("log.bed.she_drops");
      b.night!.sex = null;
      b.night!.scene = "cold_back";
      feel(ctx, -1, 2);
      h.frustration = clamp(h.frustration + 10);
      ctx.emit("bed:ended", { act: sex.act, came: sex.came > 0, outcome: "dropped", turns: sex.turns });
      return;
    }
    if (!sex.out) {
      sex.out = true;
      sex.asks = null;
      ctx.log("log.bed.checks_out");
      ctx.log(`log.bed.thought.${ctx.rng.int(1, 4)}`, undefined, ["unseen"]);
    }
  };

  // He reaches for her. If she is willing, the scene begins and runs turn by turn.
  api.actions.register({
    id: NIGHT_ACT,
    labelKey: "action.night",
    describe: (a) => ({ key: `action.night.${a.payload!.act}` }),
    enumerate(state) {
      const b = bs(state);
      if (state.time.phase !== "night" || !b.night || b.night.asked || b.night.sex || b.husband.spentDay === state.time.day) return [];
      if (state.where[HUSBAND] !== BEDROOM || state.where[WIFE] !== BEDROOM) return [];
      if (b.night.counter) return [{ type: NIGHT_ACT, payload: { act: b.night.counter } }]; // tonight it is this or nothing
      return NIGHT_ACTS.filter((act) => hisActOpen(state, act)).map((act) => ({ type: NIGHT_ACT, payload: { act } }));
    },
    apply(ctx, action) {
      const b = bs(ctx.state);
      const h = b.heroine;
      const act = actById(action.payload!.act as string);
      b.night!.asked = true;
      const wanted = b.night!.wants === true;
      b.night!.wants = false;
      const countered = b.night!.counter === act.id;
      b.night!.counter = undefined;
      const verdict = countered ? "eager" : ask(ctx, act.id, wanted ? content.body.night.wants.consent : 0, "wants");
      if (verdict === "refuse") {
        // not what he asked for, but she has her own idea of what he is good for tonight
        const C = content.body.bed.counter;
        const leads = b.power >= C.power || h.latents.cruel_streak !== undefined || (h.traits.confidence >= C.confidence && h.sizeTaste >= C.sizeTaste);
        const inside = act.zones.includes("vagina") || act.zones.includes("anus");
        if (leads && inside && h.marriage.resent < C.maxResent && ctx.rng.chance(C.chance)) {
          const hard = b.power >= C.peggingPower || h.latents.cruel_streak !== undefined;
          const options = ["cunnilingus", "rimming_her", ...(hard ? ["prostate", "dildo_him", "pegging", "fisting_him"].filter((a) => hisActOpen(ctx.state, a)) : [])];
          const offer = options[ctx.rng.int(0, options.length - 1)]!;
          b.night!.counter = offer;
          b.night!.asked = false;
          b.night!.scene = "wants_him";
          ctx.log(`log.night.counter.${offer}`);
          ctx.emit("husband:countered", { asked: act.id, offer });
          return;
        }
        b.night!.scene = "cold_back";
        feel(ctx, 0, 1);
        // the "no" says why: whatever pulled hardest against it
        const why = refusalKey("log.husband.refuse", b.proposals.at(-1)?.rows ?? []);
        ctx.log(why, { act: `action.night.${act.id}` }, slurTags(ctx.state, why));
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
        his: clamp(B.startHis + Math.max(0, b.denied) * B.deniedStart + (unlucky ? B.unluckyStart : 0) + himOf(ctx.state).arousal * content.day.rhythm.him.arousal.startHis),
        hers: clamp(h.arousal * 0.4),
        came: 0,
        turns: 0,
        top: false,
        skirt: false,
        pleasure: 0,
        bored: 0,
        asks: null,
        ignored: 0,
        out: false,
        byHand: false,
        looseSaid: false,
      };
      setAct(ctx, act.id);
      // a yes she had to talk herself into does not look like one she was waiting for
      const start = verdict === "hesitant" ? "log.bed.start.hesitant" : "log.bed.start";
      ctx.log(start, { act: `act.${act.id}` }, slurTags(ctx.state, start));
      ctx.emit("bed:started", { act: act.id });
    },
  });

  // Any time they are alone together, or not alone: "come upstairs for a minute", right here, or right here in front of everybody.
  /** How many guests are sitting where the two of them are. */
  const watching = (state: GameState) => {
    const sh = bs(state).shift;
    return state.time.phase === "shift" && sh && state.where[HUSBAND] === HALL ? sh.visits.filter((v) => v.stay > 0).length : 0;
  };
  api.actions.register({
    id: UPSTAIRS,
    labelKey: "action.upstairs",
    describe: (a) => ({ key: `action.upstairs.${a.payload!.pub ? "public" : a.payload!.here ? "here" : "up"}`, params: { act: `act.${a.payload!.act}` } }),
    enumerate(state) {
      const b = bs(state);
      const sh = b.shift;
      const phase = state.time.phase;
      if (b.husband.spentDay === state.time.day || b.encounter || b.caught || b.reaction || b.night) return [];
      if (phase === "shift" ? !sh || sh.tick >= TICKS_PER_SHIFT : phase !== "prep" || !b.day || !!b.day.busy || b.day.left < B.minutesPerTurn * 4) return [];
      if (state.where[HUSBAND] !== state.where[WIFE] || state.where[HUSBAND]?.startsWith("town.")) return [];
      const guests = phase === "shift" ? (state.where[HUSBAND] === HALL ? sh!.visits.length : 0) : 0;
      if (guests === 0) return UPSTAIRS_ACTS.map((act) => ({ type: UPSTAIRS, payload: { act, here: 1 } }));
      return [...UPSTAIRS_ACTS.map((act) => ({ type: UPSTAIRS, payload: { act, here: 0 } })), ...(watching(state) > 0 ? UPSTAIRS_ACTS.map((act) => ({ type: UPSTAIRS, payload: { act, here: 1, pub: 1 } })) : [])];
    },
    apply(ctx, action) {
      const b = bs(ctx.state);
      const h = b.heroine;
      const act = actById(action.payload!.act as string);
      const pub = action.payload!.pub === 1;
      const here = action.payload!.here === 1;
      const loc = here ? ctx.state.where[HUSBAND]! : BEDROOM;
      const N = content.body.night;
      if (b.shift) b.shift.upstairs = true;
      // their own bed is the easy place; an empty room is nearly as good; a room full of guests is another matter
      const more: [string, number][] = [];
      if (pub) more.push(["plain_sight", -Math.max(0, N.public.base + (100 - h.traits.openness) * N.public.perClosed - (h.latents.exhibitionist !== undefined ? N.public.exhibitionist : 0))]);
      else if (here && loc !== BEDROOM) more.push(["elsewhere", -N.elsewhere]);
      else if (!here) more.push(["work", -N.work]); // leaving a full room to itself is not nothing for her
      const verdict = ask(ctx, act.id, 0, "going", loc, more);
      if (verdict === "refuse") {
        feel(ctx, 0, pub ? 1 : 0.5);
        if (pub) ctx.log("log.upstairs.no.public");
        else if (!here) ctx.log("log.upstairs.no");
        else {
          const why = refusalKey("log.husband.refuse", b.proposals.at(-1)?.rows ?? []);
          ctx.log(why, { act: `action.night.${act.id}` }, slurTags(ctx.state, why));
        }
        ctx.emit("husband:refused", { act: act.id });
        return;
      }
      if (!here) {
        ctx.state.where[HUSBAND] = BEDROOM;
        ctx.state.where[WIFE] = BEDROOM;
      }
      changeHeroine(ctx, "arousal", h.marriage.desire * H.foreplay, "husband");
      b.night = { scene: act.id, asked: true, ...(here ? { here: pub ? ("public" as const) : ("here" as const) } : {}), sex: { act: act.id, his: clamp(B.startHis + Math.max(0, b.denied) * B.deniedStart), hers: clamp(h.arousal * 0.4), came: 0, turns: 0, top: false, skirt: false, pleasure: 0, bored: 0, asks: null, ignored: 0, out: false, byHand: false, looseSaid: false } };
      setAct(ctx, act.id);
      if (pub) {
        // the whole room has it to talk about, and to think about
        b.gossip = clamp(b.gossip + N.public.gossip);
        for (const v of b.shift!.visits) if (v.stay > 0) v.heat = clamp((v.heat ?? 0) + N.public.heat);
        h.traits.openness = clamp(h.traits.openness + N.public.openness);
      }
      const start = pub ? "log.upstairs.public" : !here ? "log.upstairs.up" : ctx.state.time.phase === "shift" ? "log.upstairs.here" : "log.upstairs.prep";
      ctx.log(start, { act: `act.${act.id}` });
      ctx.emit("bed:started", { act: act.id, shift: ctx.state.time.phase === "shift", public: pub });
    },
  });
  // He stepped in while she was with a guest and she let him: from here it is a scene of three, and he is one of them.
  api.events.on("join:start", (ctx, e) => {
    const b = bs(ctx.state);
    const h = b.heroine;
    const { act: actId, patron } = e.payload as { act: string; patron: string };
    const p = b.patrons[patron];
    if (b.night || !p) return;
    const act = actById(NIGHT_ACTS.includes(actId) || BED_ACTS.includes(actId) ? actId : "sex");
    const pub = ctx.state.where[WIFE] === HALL;
    ctx.state.where[HUSBAND] = ctx.state.where[WIFE]!;
    b.night = { scene: "join_husband", asked: true, here: pub ? "public" : "here", third: patron, sex: { act: act.id, his: clamp(B.startHis + Math.max(0, b.denied) * B.deniedStart), hers: clamp(h.arousal * 0.6), came: 0, turns: 0, top: false, skirt: false, pleasure: 0, bored: 0, asks: null, ignored: 0, out: false, byHand: false, looseSaid: false } };
    setAct(ctx, act.id);
    // two men at once is more than either of them alone, and she knows which of them is the bigger
    b.night.sex!.hers = clamp(b.night.sex!.hers + 15);
    if (p.size > b.husband.size + 2) {
      b.power = clamp(b.power + 1);
      ctx.log("log.join.bigger", { name: `@name:${p.name}` }, ["unseen", "thought"]);
    }
    ctx.log("log.join.start", { name: `@name:${p.name}`, act: `act.${act.id}` });
    ctx.emit("bed:started", { act: act.id, shift: true, public: pub, third: patron });
  });
  // The doors open while they are at it: it stops there.
  api.events.on("phase:enter", (ctx, e) => {
    const b = bs(ctx.state);
    if (e.payload!.phase !== "shift" || !b.night) return;
    if (b.night.sex) finishScene(ctx, "stop");
    b.night = null;
  });
  // Walking away in the middle of it ends it.
  api.events.on("entity:moved", (ctx, e) => {
    if (e.payload!.id === HUSBAND && bs(ctx.state).night?.sex) finish(ctx, "stop");
  });

  // She said no. He can still see to himself next to her, if she lets him: she lies there, he looks at her.
  api.actions.register({
    id: NIGHT_SELF,
    labelKey: "action.night.self",
    enumerate(state) {
      const b = bs(state);
      const n = b.night;
      if (state.time.phase !== "night" || !n || n.sex || n.scene !== "cold_back" || n.selfAsked || b.husband.spentDay === state.time.day) return [];
      return state.where[HUSBAND] === BEDROOM && state.where[WIFE] === BEDROOM ? [{ type: NIGHT_SELF }] : [];
    },
    apply(ctx) {
      const b = bs(ctx.state);
      const h = b.heroine;
      b.night!.selfAsked = true;
      if (h.marriage.resent >= content.body.bed.selfResent) {
        feel(ctx, 0, 0.5);
        ctx.log("log.night.self.no");
        return;
      }
      b.night!.scene = "by_hand";
      b.husband.spentDay = ctx.state.time.day;
      b.denied = -1;
      const mocks = b.mode === "open" && (b.power >= 30 || h.latents.cruel_streak !== undefined);
      if (mocks) b.power = clamp(b.power + 2);
      const kind = h.marriage.desire >= content.body.bed.reward.lovingDesire;
      feel(ctx, mocks ? -0.5 : 0, 0); // she does not think less of him for it unless she was already looking down
      ctx.log(mocks ? "log.night.self.mock" : kind ? "log.night.self.kind" : `log.night.self.ignored.${ctx.rng.int(1, 3)}`);
      ctx.emit("bed:ended", { act: "self", came: false, outcome: "by_hand", turns: 0 });
    },
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
    ctx.emit("her:turned_down", { weight });
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
    void zone;
    const tight = inside ? tightness(state, sex.act) : 1;
    const skill = h.skills[sex.act] ?? 0;
    let his = (inside ? B.hisRateSex : B.hisRate) * (12 / b.husband.minutes) * tight * (1 + skill / 150) * (act.id === "cunnilingus" ? 0.25 : 1);
    // she has checked out: what needs her hands or her moving simply stops, the rest goes on without her
    if (sex.out) his = NEEDS_HER.has(sex.act) ? 0 : his * 0.7;
    if (sex.byHand || (sex.out && his === 0)) return { his: B.handRate * (12 / b.husband.minutes), hers: 0 };
    if (sex.out) return { his, hers: 0 };
    if (HIS_ACTS.includes(sex.act)) {
      const K = content.body.his;
      const { fit, toy } = toyForHim(state);
      const size = sex.act === "prostate" ? K.fingerSize : sex.act === "fisting_him" ? K.fistSize : (toy?.size ?? fit);
      const hurts = size > fit + K.tooBig;
      const mine = B.hisRate * (hurts ? 0.4 : (K.hisShare[sex.act] ?? 1) + b.husband.stretch / 200);
      return { his: mine, hers: 0 }; // it works on her head, not on her body: she does not come from it
    }
    if (sex.act === "rimming_him") return { his: B.hisRate * content.body.his.rimmingRate, hers: 0 };
    const taste = 1 + (h.tastes.acts[sex.act] ?? 0) / 100;
    const hers = B.hersRate * (sex.pleasure / 60) * taste * (0.6 + h.arousal / 120) * (1 - h.satisfied / 160);
    return { his, hers };
  };

  /** One turn passes. Returns true when the scene is over. */
  const turn = (ctx: Ctx, his: number, hers: number): boolean => {
    const b = bs(ctx.state);
    const sex = b.night!.sex!;
    sex.turns += 1;
    if (ctx.state.time.phase === "night") ctx.emit("bed:turn");
    else ctx.state.time.minute += B.minutesPerTurn;
    if (sex.turns % 3 === 0 && (b.night!.third || b.night!.here === "public")) ctx.log(`log.bed.${b.night!.third ? "third" : "watched"}.${ctx.rng.int(1, 4)}`, b.night!.third ? { name: `@name:${b.patrons[b.night!.third]?.name ?? ""}` } : undefined);
    if (actById(sex.act).lines && sex.turns % 2 === 0) ctx.log(`log.act.${sex.act}.turn.${ctx.rng.int(1, 3)}`);
    sex.his = clamp(sex.his + his);
    sex.hers = clamp(sex.hers + hers);
    if (sex.hers >= 100) {
      sex.came += 1;
      sex.hers = B.afterOrgasm;
      orgasm(ctx);
      ctx.log(sex.act === "rimming_her" ? "log.bed.her.rimming_her" : "log.bed.she_comes");
      if (sex.act === "rimming_her") b.night!.scene = "came_rimming_her";
    }
    if (sex.soft) {
      // nothing of his to wait for: it lasts until she is there, or until she has had enough of trying
      sex.his = 0;
      if (sex.came > 0 || sex.turns >= B.after.maxTurns) {
        afterEnds(ctx);
        return true;
      }
      return false;
    }
    if (sex.his >= 100) {
      finish(ctx, "auto");
      return true;
    }
    // he goes soft: she is not there, or there is nothing to feel, or there is too much between them
    const soft = (sex.out ? B.soft.whenOut : 0) + (tightness(ctx.state, sex.act) < 0.3 ? B.soft.whenLoose : 0) + b.heroine.marriage.resent * B.soft.perResent + (tired(ctx.state) ? content.day.rhythm.him.softTired : 0);
    const hisTurn = !GIVES_HER.has(sex.act); // it does not matter while he is the one doing something for her
    if (hisTurn && sex.turns >= 2 && sex.his < B.soft.belowHis && !sex.byHand && soft > 0 && ctx.rng.chance(soft)) {
      b.night!.sex = null;
      b.night!.scene = "went_soft";
      feel(ctx, -1.5, 1);
      b.heroine.frustration = clamp(b.heroine.frustration + (sex.came > 0 ? 0 : 12));
      ctx.log(b.heroine.marriage.desire >= B.reward.lovingDesire ? "log.bed.soft.kind" : "log.bed.soft");
      ctx.emit("bed:ended", { act: sex.act, came: sex.came > 0, outcome: "went_soft", turns: sex.turns });
      if (carryOn(ctx, sex)) return true;
      if (ctx.state.time.phase !== "night") backToWork(ctx, sex.turns);
      return true;
    }
    // is she getting anything out of this?
    if (!sex.out) {
      if (sex.asks) {
        sex.ignored += 1; // he went on without answering her
        if (sex.ignored >= 2 && sex.asks !== "finish") {
          sex.asks = null;
          feel(ctx, 0, 1);
        }
      }
      const reward = rewardOf(ctx.state, sex.act, sex.pleasure);
      const R = B.reward;
      sex.bored = reward < R.enough ? sex.bored + (R.enough - reward) / R.enough : Math.max(0, sex.bored - 0.5);
      if (sex.bored >= R.limit) {
        herMove(ctx);
        if (!b.night?.sex) {
          if (ctx.state.time.phase !== "night") backToWork(ctx, sex.turns);
          return true;
        }
      }
    }
    return false;
  };

  /** He comes (or stops). What it leaves her with depends on how far she got and on who she is. */
  /** He is finished and she is not: sometimes she does not let him off. The scene goes on with what needs no erection. */
  const carryOn = (ctx: Ctx, was: { hers: number; came: number; out: boolean; soft?: boolean; turns: number }): boolean => {
    const b = bs(ctx.state);
    const h = b.heroine;
    const A = B.after;
    if (!b.night || b.night.sex || was.soft || was.came > 0 || was.out || was.hers < A.minHers || h.marriage.resent >= A.maxResent) return false;
    if (!ctx.rng.chance(Math.min(0.95, A.chance + Math.max(0, h.marriage.desire - 50) * A.perDesire))) return false;
    const pick = SOFT_ACTS.filter((a) => BED_ACTS.includes(a) && hisActOpen(ctx.state, a) && (!HIS_ACTS.includes(a) || b.power >= LEAD.hisActsPower))
      .map((a) => ({ a, r: rewardOf(ctx.state, a, HIS_ACTS.includes(a) ? herFromHis(ctx.state, a) : pleasureFor(ctx.state, actById(a), b.husband.size)) }))
      .sort((x, y) => y.r - x.r || x.a.localeCompare(y.a))[0];
    if (!pick) return false;
    b.night.sex = { act: pick.a, his: 0, hers: clamp(was.hers), came: 0, turns: 0, top: false, skirt: true, pleasure: 0, bored: 0, asks: null, ignored: 0, out: false, byHand: false, looseSaid: true, soft: true };
    setAct(ctx, pick.a);
    ctx.log("log.bed.she_continues", { act: `act.${pick.a}` });
    ctx.emit("bed:continued", { act: pick.a });
    return true;
  };
  /** The end of what she kept him at: she got there, or she gave up on it. */
  const afterEnds = (ctx: Ctx) => {
    const b = bs(ctx.state);
    const sex = b.night!.sex!;
    b.night!.sex = null;
    b.night!.scene = sex.came > 0 ? "sleeping" : "left_wanting";
    if (sex.came > 0) feel(ctx, 2.5, -2.5);
    else b.heroine.frustration = clamp(b.heroine.frustration + 8);
    ctx.log(sex.came > 0 ? "log.bed.after.came" : "log.bed.after.gave_up");
    ctx.emit("bed:ended", { act: sex.act, came: sex.came > 0, outcome: "after", turns: sex.turns });
    if (ctx.state.time.phase !== "night") backToWork(ctx, sex.turns);
  };
  const finish = (ctx: Ctx, how: "auto" | "choice" | "stop") => {
    const was = { ...bs(ctx.state).night!.sex! };
    finishScene(ctx, how);
    if (how !== "stop" && carryOn(ctx, was)) return;
    if (ctx.state.time.phase !== "night") backToWork(ctx, was.turns);
  };
  /** Mid-shift: the scene object belongs to the night, and the floor has been waiting. */
  const backToWork = (ctx: Ctx, turns: number) => {
    const b = bs(ctx.state);
    const here = b.night?.here;
    b.night = null;
    const minutes = Math.max(1, turns) * B.minutesPerTurn;
    if (ctx.state.time.phase === "prep") {
      // the afternoon: nobody was waiting, but the clock did not stop
      ctx.log("log.here.back");
      passPrep(ctx, minutes);
      ctx.state.where[WIFE] = ctx.state.where[HUSBAND]!;
      return;
    }
    if (!here) {
      if (ctx.state.where[HUSBAND] === BEDROOM) ctx.state.where[HUSBAND] = HALL;
      ctx.state.where[WIFE] = HALL;
    }
    ctx.log(here === "public" ? "log.here.back.public" : here ? "log.here.back" : "log.upstairs.back");
    runUnattended(ctx, minutes);
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
    if (sex.came === 0 && sex.hers >= B.herCloseAt && sex.pleasure >= 30) { // not from a man she cannot feel
      sex.came = 1;
      orgasm(ctx);
    }
    changeHeroine(ctx, "energy", act.effects.energy, "husband");
    if (HIS_ACTS.includes(sex.act) || sex.act === "rimming_him" || OWN_END.has(sex.act)) {
      // this one was about him; what it does to her is in who she was while doing it
      b.night!.scene = `came_${sex.act}`;
      feel(ctx, sex.came > 0 ? 1 : 0, b.power >= 30 ? -1 : 0);
      ctx.log(`log.bed.his.${sex.act}`);
      ctx.emit("bed:ended", { act: sex.act, came: sex.came > 0, outcome: "his", turns: sex.turns });
      return;
    }
    if ((sex.byHand || sex.out) && sex.came === 0) {
      // he finished himself while she lay there
      b.night!.scene = "by_hand";
      feel(ctx, -1.5, sex.out ? 1 : 0.5);
      if (b.mode === "open") b.power = clamp(b.power + 2);
      h.frustration = clamp(h.frustration + 12);
      ctx.log(sex.out ? "log.bed.by_hand.ignored" : "log.bed.by_hand");
      ctx.emit("husband:act", { act: sex.act, came: false, pleasure: sex.pleasure, outcome: "by_hand", turns: sex.turns });
      ctx.emit("bed:ended", { act: sex.act, came: false, outcome: "by_hand", turns: sex.turns });
      return;
    }
    const premature = sex.turns <= 2;
    let outcome: string;
    if (sex.came > 0) {
      outcome = "came";
      b.night!.scene = sex.act === "rimming_her" ? "came_rimming_her" : oral ? "cunnilingus" : "sex";
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
    // nights that leave her wanting pile up; a night that does not, lets some of it go
    h.frustration = clamp(h.frustration + (sex.came > 0 ? -25 : outcome === "finished_herself" ? 4 : 12));
    ctx.emit("husband:act", { act: sex.act, came: sex.came > 0, pleasure: sex.pleasure, outcome, turns: sex.turns });
    ctx.emit("bed:ended", { act: sex.act, came: sex.came > 0, outcome, turns: sex.turns });
  };

  /** She ends it the way she wants it ended. */
  const herFinish = (ctx: Ctx) => {
    const b = bs(ctx.state);
    const h = b.heroine;
    const sex = b.night!.sex!;
    const inside = sex.act === "sex" || sex.act === "riding" || sex.act === "anal";
    const cruel = h.latents.cruel_streak !== undefined;
    let where = FINISH[sex.act]?.[0] ?? "on_her";
    let how = "plain";
    if (!HIS_ACTS.includes(sex.act) && sex.act !== "rimming_him") {
      if ((b.power >= LEAD.ruinedPower || cruel) && ctx.rng.chance(LEAD.ending.ruined)) how = "ruined";
      else if (b.power >= LEAD.snowballPower && h.traits.openness >= LEAD.snowballOpenness && ctx.rng.chance(LEAD.ending.snowball)) how = "snowball";
      else if (inside && b.power >= LEAD.lickPower && ctx.rng.chance(LEAD.ending.lickClean)) how = "lick_clean";
      else if (inside) how = "inside";
    }
    if (how === "ruined") {
      // she lets go of him at the last moment: it happens, and it is worth nothing to him
      b.husband.cumOn = content.look.marks.onHim;
      ctx.emit("bed:her_ending", { how });
      ctx.log("log.bed.lead.end.ruined");
    } else {
      where = how === "snowball" ? "mouth" : how === "plain" ? where : "inside";
      ctx.emit("cum:landed", { by: HUSBAND, act: sex.act, where });
      ctx.emit("bed:her_ending", { how });
      ctx.log(`log.bed.lead.end.${how}`);
    }
    if (how !== "plain" && how !== "inside") b.power = clamp(b.power + LEAD.power);
    if (how === "snowball" || how === "lick_clean") delete h.cum?.[how === "snowball" ? "mouth" : "inside"]; // it ends up in him
    finish(ctx, "choice");
    if (b.night && how !== "plain" && how !== "inside") b.night.scene = `lead_${how}`;
  };
  /** One turn of a scene she runs: clothes, what they do, the pace, and when he is allowed. */
  const herTurn = (ctx: Ctx) => {
    const b = bs(ctx.state);
    const h = b.heroine;
    const sex = b.night!.sex!;
    const R = B.reward;
    if (!sex.top) {
      sex.top = true;
      ctx.log("log.bed.lead.top");
      return void turn(ctx, 3, B.undress);
    }
    if (sex.panties !== "off") {
      sex.panties = "off";
      sex.skirt = true;
      h.panties = "off";
      ctx.log("log.bed.lead.panties");
      return void turn(ctx, 3, B.undress);
    }
    // what is best for her right now, including what she may decide he takes
    const own = (a: string) => !HIS_ACTS.includes(a) || b.power >= LEAD.hisActsPower || h.latents.cruel_streak !== undefined;
    const now = rewardOf(ctx.state, sex.act, sex.pleasure);
    // she does not do the same thing twice in one scene, and she does not always reach for the same favourite:
    // among what is better than now she picks by how much better, and now and then she simply takes them to something ordinary
    const tried = (sex.tried = sex.tried ?? [sex.act]);
    const options = BED_ACTS.filter((a) => a !== sex.act && !tried.includes(a) && hisActOpen(ctx.state, a) && own(a))
      .map((a) => ({ a, r: rewardOf(ctx.state, a, HIS_ACTS.includes(a) ? herFromHis(ctx.state, a) : pleasureFor(ctx.state, actById(a), b.husband.size)) }))
      .filter((o) => o.r >= now + R.better)
      .sort((x, y) => y.r - x.r || x.a.localeCompare(y.a));
    const ordinary = options.filter((o) => !HIS_ACTS.includes(o.a));
    const pool = ordinary.length > 0 && ordinary.length < options.length && ctx.rng.chance(LEAD.ordinaryShare) ? ordinary : options;
    const best = pool.length > 0 ? ctx.rng.weighted(pool.map((o) => ({ item: o, weight: Math.pow(Math.max(1, o.r - now), LEAD.variety) }))) : undefined;
    if (best && (sex.switched ?? 0) < 3) {
      sex.switched = (sex.switched ?? 0) + 1;
      tried.push(best.a);
      setAct(ctx, best.a);
      ctx.log("log.bed.lead.switch", { act: `act.${best.a}` });
      return void turn(ctx, 2, 3);
    }
    const r = rates(ctx.state);
    // done: she has had hers, or it has gone on long enough
    if ((sex.came > 0 && (sex.his >= B.cumAt || sex.turns >= LEAD.minTurns)) || sex.turns >= LEAD.maxTurns) return void herFinish(ctx);
    // he is close and she is not there yet: she holds him back, and sometimes he cannot be held
    if (sex.his >= LEAD.holdAt && sex.came === 0) {
      if (ctx.rng.chance(LEAD.slipPerTurn * Math.min(2, 12 / b.husband.minutes))) {
        feel(ctx, 0, LEAD.slipped.resent ?? 0);
        ctx.emit("bed:her_ending", { how: "slipped" });
        ctx.log("log.bed.lead.slipped");
        ctx.emit("cum:landed", { by: HUSBAND, act: sex.act, where: FINISH[sex.act]?.[0] ?? "on_her" });
        return void finish(ctx, "choice");
      }
      sex.his = LEAD.holdAt;
      if (!sex.heldSaid) {
        sex.heldSaid = true;
        ctx.log("log.bed.lead.hold");
      }
      return void turn(ctx, 0, r.hers * 1.4);
    }
    // otherwise she takes her time, for herself
    turn(ctx, r.his * (sex.hers < 60 ? 0.6 : 1), r.hers * (sex.hers < 60 ? 1.5 : 1.3));
  };
  // Some nights, once she holds the reins in the marriage, she does not wait to be given them.
  api.events.on("bed:started", (ctx) => {
    const b = bs(ctx.state);
    const sex = b.night?.sex;
    if (!sex || b.mode !== "open" || ctx.state.time.phase !== "night") return;
    const cruel = b.heroine.latents.cruel_streak !== undefined;
    if (b.power < LEAD.takesAtPower && !cruel) return;
    if (!ctx.rng.chance(cruel ? LEAD.cruelTakes : LEAD.takesChance)) return;
    sex.lead = true;
    ctx.log("log.bed.lead.takes");
    ctx.emit("bed:lead", { given: false });
  });

  // Afterwards: "lick it up", "clean me". She does, or she turns it round on him.
  api.actions.register({
    id: AFTER,
    labelKey: "action.after",
    describe: (a) => ({ key: `action.after.${a.payload!.do}` }),
    enumerate(state) {
      const n = bs(state).night;
      if (state.time.phase !== "night" || !n || n.sex || !n.after || bs(state).complaint) return [];
      const dos = [...(PULL_OUT.has(n.after) || n.after === "face" ? ["lick_it"] : []), "clean_me"];
      return dos.map((d) => ({ type: AFTER, payload: { do: d } }));
    },
    apply(ctx, action) {
      const b = bs(ctx.state);
      const h = b.heroine;
      const A = content.intimacy.after;
      const what = action.payload!.do as string;
      const where = b.night!.after!;
      b.night!.after = undefined;
      const willing = h.traits.openness >= A.willingOpenness || h.latents.oral_fixation !== undefined || h.latents.submissive !== undefined;
      if (b.mode === "open" && b.power >= A.reversePower) {
        b.power = clamp(b.power + (A.reversed.power ?? 0));
        ctx.log(`log.after.${what}.reversed`);
        ctx.emit("bed:after", { do: what, outcome: "reversed", where });
        if (what === "lick_it") for (const k of ["face", "chest", "body"]) delete h.cum?.[k];
      } else if (willing) {
        changeHeroine(ctx, "arousal", A.done.arousal ?? 0, "husband");
        ctx.log(`log.after.${what}`);
        ctx.emit("bed:after", { do: what, outcome: "done", where });
        if (what === "lick_it") for (const k of ["face", "chest", "body"]) delete h.cum?.[k];
        else b.husband.cumOn = 0;
      } else {
        ctx.log(`log.after.${what}.no`);
        ctx.emit("bed:after", { do: what, outcome: "refused", where });
      }
    },
  });

  const bedOptions = (state: GameState): { type: string; payload: Record<string, string> }[] => {
      const sex = bs(state).night?.sex;
      if (!sex) return [];
      // she runs it: he follows, asks, or takes it back
      if (sex.lead) return ["follow", ...(sex.his >= B.cumAt ? ["beg"] : []), "take_back", "stop"].map((d) => ({ type: BED, payload: { do: d } }));
      const dos = ["keep", "faster", "slower", "talk", "kiss", "say_mine", "look_at_me"];

      if (!sex.byHand) dos.push("hand");
      if (!sex.top) dos.push("top");
      if (!sex.skirt) dos.push("skirt");
      if (!sex.naked && (sex.panties ?? "on") === "on") dos.push("panties_aside");
      if (!sex.naked && sex.panties !== "off") dos.push("panties_off");
      if (!sex.naked && sex.top && sex.panties === "off") dos.push("naked");
      dos.push("give_lead");
      const out = dos.map((d) => ({ type: BED, payload: { do: d } as Record<string, string> }));
      if (sex.asks && sex.asks !== "finish") out.unshift({ type: BED, payload: { do: "give", act: sex.asks } });
      if (sex.his >= B.cumAt) for (const where of FINISH[sex.act] ?? ["inside"]) out.push({ type: BED, payload: { do: "finish", where } });
      for (const to of BED_ACTS) if (to !== sex.act && hisActOpen(state, to)) out.push({ type: BED, payload: { do: "switch", to } });
      out.push({ type: BED, payload: { do: "stop" } });
      return out;
    };
  // What he can do while it lasts.
  api.actions.register({
    id: BED,
    labelKey: "action.bed",
    describe: (a) => (a.payload!.do === "give" ? { key: "action.bed.give", params: { act: `act.${a.payload!.act}` } } : a.payload!.to ? { key: "action.bed.switch", params: { act: `act.${a.payload!.to}` } } : a.payload!.where ? { key: `action.bed.finish.${a.payload!.where}` } : { key: `action.bed.${a.payload!.do}` }),
    enumerate: (state) => bedOptions(state),
    // while she leads, anything he tries to do on his own is simply her next move
    accepts: (state, a) => {
      const sex = bs(state).night?.sex;
      if (!sex) return false;
      if (sex.lead && ["keep", "faster", "slower", "talk", "kiss"].includes(a.payload?.do as string)) return true;
      const key = (p: Record<string, unknown> | undefined) => JSON.stringify(Object.entries(p ?? {}).sort(([x], [y]) => x.localeCompare(y)));
      return bedOptions(state).some((o) => key(o.payload) === key(a.payload));
    },
    apply(ctx, action) {
      const b = bs(ctx.state);
      const sex = b.night!.sex!;
      let what = action.payload!.do as string;
      if (sex.lead && ["keep", "faster", "slower", "talk", "kiss"].includes(what)) what = "follow";
      const r = rates(ctx.state);
      switch (what) {
        case "give": {
          // he does what she asked for: no question to answer, she wanted it
          const to = sex.asks!;
          sex.asks = null;
          sex.ignored = 0;
          sex.bored = 0;
          setAct(ctx, to);
          feel(ctx, 0.5, -0.5);
          ctx.log("log.bed.gives", { act: `act.${to}` });
          turn(ctx, 2, 4);
          break;
        }
        case "hand":
          sex.byHand = true;
          ctx.log(sex.out ? "log.bed.hand.ignored" : "log.bed.hand");
          turn(ctx, rates(ctx.state).his, 0);
          break;
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
        case "panties_aside":
        case "panties_off":
          sex.panties = what === "panties_off" ? "off" : "aside";
          b.heroine.panties = sex.panties;
          sex.skirt = true;
          turn(ctx, 2, B.undress);
          break;
        case "naked":
          sex.naked = true;
          sex.panties = "off";
          b.heroine.panties = "off";
          turn(ctx, 3, B.undress);
          break;
        case "say_mine": {
          // a wife who holds the reins laughs at it; one who wants him says it
          const Tk = content.intimacy.talk;
          if (b.power >= Tk.sayMinePower && b.mode === "open") {
            b.power = clamp(b.power + (Tk.sayMineLaugh.power ?? 0));
            ctx.log("log.bed.say_mine.laughs");
            turn(ctx, 1, 0);
          } else if (b.heroine.marriage.desire >= 45) {
            ctx.emit("bed:said", { what: "mine" });
            ctx.log("log.bed.say_mine");
            turn(ctx, Tk.sayMine.his ?? 0, Tk.sayMine.hers ?? 0);
          } else {
            ctx.log("log.bed.say_mine.no");
            turn(ctx, 0, -3);
          }
          break;
        }
        case "look_at_me":
          ctx.log(sex.out ? "log.bed.look_at_me.out" : "log.bed.look_at_me");
          turn(ctx, sex.out ? 0 : (content.intimacy.talk.lookAtMe.his ?? 0), sex.out ? 0 : (content.intimacy.talk.lookAtMe.hers ?? 0));
          break;
        case "give_lead":
          sex.lead = true;
          ctx.log("log.bed.lead.given");
          ctx.emit("bed:lead", { given: true });
          herTurn(ctx);
          break;
        case "follow":
          herTurn(ctx);
          break;
        case "beg": {
          // "please": she decides
          const lets = b.heroine.marriage.desire >= LEAD.begAllowDesire && sex.came > 0;
          if (lets || sex.turns >= LEAD.maxTurns) herFinish(ctx);
          else {
            sex.his = clamp(sex.his + (LEAD.begDenied.his ?? 0));
            b.power = clamp(b.power + (LEAD.begDenied.power ?? 0));
            ctx.log(`log.bed.lead.denied.${ctx.rng.int(1, 2)}`);
            turn(ctx, 0, r.hers);
          }
          break;
        }
        case "take_back":
          sex.lead = false;
          if (b.power >= LEAD.takesAtPower) {
            feel(ctx, 0, LEAD.takeBack.resent ?? 0);
            ctx.emit("bed:lead", { given: false, taken: true });
            ctx.log("log.bed.lead.taken_back.sulk");
          } else ctx.log("log.bed.lead.taken_back");
          turn(ctx, r.his, r.hers * 0.5);
          break;
        case "finish": {
          // where he finishes is a small thing she either likes or puts up with
          let where = (action.payload!.where as string) ?? "inside";
          const Fn = content.intimacy.finish;
          const hh = b.heroine;
          // she has her own mind about it
          if (where === "face" && hh.traits.openness < 60 && hh.latents.oral_fixation === undefined && hh.traits.confidence >= Fn.dodgeConfidence) {
            where = "chest";
            ctx.log("log.bed.finish.dodged");
          } else if (PULL_OUT.has(where) && (sex.act === "sex" || sex.act === "riding") && hh.arousal >= Fn.holdArousal && hh.marriage.desire >= Fn.holdDesire && ctx.rng.chance(Fn.holdChance)) {
            where = "inside";
            ctx.log("log.bed.finish.held");
          }
          if (b.night && ctx.state.time.phase === "night") b.night.after = where;
          if (b.night) b.night.fin = where;
          if (where === "face" || where === "mouth") {
            const likes = b.heroine.traits.openness >= (where === "face" ? 60 : 45) || b.heroine.latents.oral_fixation !== undefined;
            if (likes) changeHeroine(ctx, "arousal", 4, "finish");
            else feel(ctx, 0, where === "face" ? 1.5 : 0.5);
            ctx.log(`log.bed.finish.${where}${likes ? "" : ".no"}`);
          } else if (PULL_OUT.has(where)) ctx.log(`log.bed.finish.${where}`);
          ctx.emit("cum:landed", { by: HUSBAND, act: bs(ctx.state).night!.sex!.act, where });
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
          h.frustration = clamp(h.frustration - 20);
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
    const Dr = content.consent.drift;
    // what counts is how much she has come to want more than he has, not the stretch itself
    if (gap > 1) b.heroine.marriage.desire = clamp(b.heroine.marriage.desire - Math.min(gap, Dr.husbandSizeGap) * Dr.husbandSize * (b.heroine.sizeTaste / 50));
  });

  api.scenes.register({
    id: "base.night",
    priority: 20,
    match(state) {
      const b = bs(state);
      if (!b.night || (state.time.phase !== "night" && !b.night.sex) || state.where[HUSBAND] !== state.where[WIFE]) return null;
      const fin = b.night.fin && !b.night.sex ? `fin_${b.night.fin}` : "";
      return {
        type: FIN_LAYOUTS.has(fin) ? fin : b.night.scene,
        location: state.where[HUSBAND]!,
        participants: [
          { id: WIFE, role: "wife" },
          { id: HUSBAND, role: "husband" },
        ],
        ...(b.night.fin && !b.night.sex ? { tags: { fin: b.night.fin } } : {}),
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
