// The bed scene with him, the working parts (27.11: lifted out of registerMarriage, unchanged): asking, the turns, how it ends.
// marriage.ts registers the actions and events that use them, in the same order as before.
// The night at home: him and her. Goes through the same consent formula as any guest,
// and through the same body rules, so a husband who does little for her shows up in the numbers.
import type { Ctx, GameState } from "@tc/core";
import { content } from "../../content";
import { softChance } from "../nerve";
import { hasLine, outcomeOf, refusalKey, setOutcome } from "../voice";
import { bs, clamp, HUSBAND, WIFE } from "../../state";
import { entersZone, fitOf, orgasm, pleasureFor, sizeStage, useBody } from "../body";
import { owe, toneOf, cruelNow } from "../hernight";
import { think } from "../mind";
import { actById, CONSENT_FORMULA, verdictOf } from "../encounters";
import type { ConsentInput } from "../encounters";
import { changeHeroine } from "../heroine";
import { HALL } from "../places";
import { runUnattended } from "../shift";
import { passPrep } from "../day";

import { tired } from "../rhythm";
import { allowedPlaces, endingOff, finishOff } from "../kinks";
import { BED, BEDROOM, BED_ACTS, FEMDOM, FINISH, HER_PLEASURE, HIS_ACTS, IN_BED, JOIN_ACTS, LEAD, OWN_END, SOFT_ACTS, herFromHis, hisActOpen, toyForHim } from "./acts";

export const B = content.body.bed;

export const H = content.body.husband;

export const feel = (ctx: Ctx, desire: number, resent: number) => {
  const m = bs(ctx.state).heroine.marriage;
  // the closer to the top, the less a good night adds
  m.desire = clamp(m.desire + (desire > 0 ? (desire * H.desireGain * (100 - m.desire)) / 50 : desire));
  m.resent = clamp(m.resent + resent);
};

/** The words of her "no": by its reason; right after they were at it, it is "not again already", whatever the rows say. */
export const refuseLine = (state: GameState) => {
  const b = bs(state);
  const last = b.proposals.at(-1);
  const found = refusalKey("log.husband.refuse", last?.rows ?? []);
  // "that is not my thing" is not what a wife says to her own husband about the plain things: there it is the mood
  const key = found.endsWith(".not_her") && IN_BED.menu.main.includes(last?.act ?? "") ? "log.husband.refuse.mood" : found;
  const plain = key === "log.husband.refuse" || key.endsWith(".cold") || key.endsWith(".mood") || key.endsWith(".plain");
  return plain && (b.night?.had ?? 0) > 0 ? "log.husband.refuse.again" : key;
};

export const ask = (ctx: Ctx, actId: string, bonus = 0, why = "going", loc: string = BEDROOM, more: [string, number][] = []) => {
  const b = bs(ctx.state);
  const input: ConsentInput = { act: actId, partner: HUSBAND, loc, offer: 0, pressure: 0 };
  const res = ctx.engine.evaluate<ConsentInput>(CONSENT_FORMULA, ctx.state, input);
  const extra = [...(bonus ? [[why, bonus] as [string, number]] : []), ...more.filter(([, v]) => v !== 0)];
  const total = res.total + extra.reduce((s, [, v]) => s + v, 0);
  // she came to him wanting it tonight: no hanging back over the ordinary things
  const raw = verdictOf(total);
  const verdict = raw === "hesitant" && b.night?.wants && !HIS_ACTS.includes(actId) ? "eager" : raw;
  b.proposals.push({ day: ctx.state.time.day, tick: -1, patron: HUSBAND, act: actId, loc, verdict, seen: true, total, rows: [...res.rows, ...extra.map(([k, value]) => ({ id: `consent.${k}`, labelKey: `factor.consent.${k}`, value }))] });
  if (b.proposals.length > 12) b.proposals.shift();
  setOutcome(ctx, outcomeOf(verdict), HUSBAND);
  return verdict;
};

/** What a change of act is, bodily: from where he was to where he is going. A line for it, if there is one, goes before the act is named. */
export const kindOf = (actId: string): string => {
  const a = actById(actId);
  if (HIS_ACTS.includes(actId)) return "his";
  if (entersZone(a)) return "inside";
  if (IN_BED.givesHer.includes(actId)) return "on_her";
  if (a.zones.includes("mouth")) return "her_mouth";
  return "hands";
};

export const moveLine = (ctx: Ctx, from: string, to: string, who: "he" | "she") => {
  const key = `log.bed.move.${who}.${kindOf(from)}.${kindOf(to)}`;
  if (kindOf(from) !== kindOf(to) && hasLine(key)) ctx.log(key);
};

/** She takes over by pushing him onto his back: plain sex becomes her on top, so that she does not "switch" to where she already is. */
export const onTop = (ctx: Ctx) => {
  const sex = bs(ctx.state).night!.sex!;
  if (sex.act !== "sex" || !hisActOpen(ctx.state, "riding")) return;
  setAct(ctx, "riding");
  sex.tried = [...(sex.tried ?? ["sex"]), "riding"];
};

/** Starts or changes what they are doing: her body takes it, the scene picture follows. */
export const setAct = (ctx: Ctx, actId: string) => {
  const b = bs(ctx.state);
  const sex = b.night!.sex!;
  sex.act = actId;
  sex.pleasure = useBody(ctx, actById(actId), b.husband.size);
  // with the cage on it is done through the cage: her doing, next to nothing for him
  if (b.husband.caged && content.body.cage.through.includes(actId)) ctx.log(`log.bed.cage.${actId}`);
  if (actById(actId).lines) {
    sex.pleasure = HER_PLEASURE[actId] ?? IN_BED.herPleasureDefault; // hers by what it is, not by his size
    ctx.log(`log.act.${actId}.start`);
  }
  const fixed = IN_BED.fixedPleasure[actId]; // his size says nothing here: his tongue, or she is the one giving
  if (fixed !== undefined) sex.pleasure = fixed;
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
  const zone = entersZone(act); // his tongue or his fingers are not "him inside her"
  if (zone && !sex.looseSaid) {
    const ratio = b.husband.size / fitOf(ctx.state, zone);
    const level = ratio < 0.42 ? 3 : ratio < 0.6 ? 2 : ratio < 0.85 ? 1 : 0; // about 65, 33 and 10 on the stretch scale for an average husband
    // said when it changes, and then only now and then: the same line every night reads as a stuck record
    const said = b.heroine.looseAt;
    const fresh = !said || said.level !== level || ctx.state.time.day - said.day >= content.body.take.looseEvery;
    if (level > 0 && fresh) {
      sex.looseSaid = true;
      b.heroine.looseAt = { level, day: ctx.state.time.day };
      ctx.log(`log.bed.loose.${level}`, undefined, level < 3 ? ["unseen"] : undefined); // the last one she says aloud
    }
    // what goes through her head about it: the drink, the man from this afternoon, or simply what she now knows others have
    const h = b.heroine;
    const today = h.lastBig?.day === ctx.state.time.day && h.lastBig.size > b.husband.size;
    const knows = sizeStage(h.seenSize ?? 0) - sizeStage(b.husband.size) >= 2;
    const crossed = level === 0 && knows && ctx.rng.chance(content.body.take.bedThought);
    if (level === 0 && knows) sex.looseSaid = true; // one roll a night, not one per act
    if ((level > 0 && fresh) || crossed) {
      sex.looseSaid = true;
      // in the open she says it as it is; hidden, now and then she lets it slip in words that hide where it comes from (the @ntr wording)
      if (today && level > 0 && (b.mode === "open" || ctx.rng.chance(content.body.take.hiddenSays ?? 0))) ctx.log(`log.bed.compare.say.${ctx.rng.int(1, 3)}`);
      else think(ctx, today ? "thought.bed.compare" : level > 0 && h.drunk >= 30 ? "thought.bed.small.drunk" : level > 0 ? "thought.bed.small" : "thought.bed.knows", level > 0);
    }
  }
};

/** How much of him she can feel, and he of her: 1 = a fit, down to almost nothing. */
export const tightness = (state: GameState, actId: string) => {
  const act = actById(actId);
  const zone = act.zones.includes("anus") ? "anus" : act.zones.includes("vagina") ? "vagina" : null;
  if (!zone) return 1;
  const ratio = bs(state).husband.size / fitOf(state, zone);
  return clamp((ratio - B.looseNoneAt) / (B.looseFullAt - B.looseNoneAt), B.looseForHim, 1);
};

export const GIVES_HER = new Set(IN_BED.givesHer);

export const NEEDS_HER = new Set(IN_BED.needsHer);

/** What a turn of this act is worth to her, 0..100: her body, or her reasons for doing it. */
export const rewardOf = (state: GameState, actId: string, pleasure: number) => {
  const b = bs(state);
  const h = b.heroine;
  const R = B.reward;
  let motive = 0;
  for (const why of actById(actId).motives ?? []) {
    if (why === "affection") motive += h.marriage.desire * R.affection;
    if (why === "giving" && (h.latents.oral_fixation !== undefined || h.latents.submissive !== undefined)) motive += R.giving;
    if (why === "power") motive += b.power * R.power + (cruelNow(b) ? R.cruel : 0);
  }
  return clamp(Math.max(pleasure, pleasure * 0.6 + motive));
};

/** She has had enough of how this is going and does something about it. */
export const herMove = (ctx: Ctx) => {
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
    ctx.log(`log.bed.she_asks.t${toneOf(ctx.state)}`, { act: `act.${best.a}` });
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

// Any time they are alone together, or not alone: "come upstairs for a minute", right here, or right here in front of everybody.
/** How many guests are sitting where the two of them are. */
export const watching = (state: GameState) => {
  const sh = bs(state).shift;
  return state.time.phase === "shift" && sh && state.where[HUSBAND] === HALL ? sh.visits.filter((v) => v.stay > 0).length : 0;
};

export const turnedDown = (ctx: Ctx, weight: number) => {
  const W = content.body.night.wants;
  feel(ctx, -W.declineDesire * weight, W.declineResent * weight);
  changeHeroine(ctx, "mood", -3 * weight, "turned down");
  ctx.emit("her:turned_down", { weight });
};

/** How much one turn gives each of them, before the pace multiplier. */
export const rates = (state: GameState) => {
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
  let his = (inside ? B.hisRateSex : B.hisRate) * (12 / b.husband.minutes) * tight * (1 + skill / 150) * (IN_BED.untouched.includes(act.id) ? B.givingRate : 1);
  if (b.husband.caged && content.body.cage.through.includes(sex.act)) his *= content.body.cage.throughRate;
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
export const turn = (ctx: Ctx, his: number, hers: number): boolean => {
  const b = bs(ctx.state);
  const sex = b.night!.sex!;
  sex.turns += 1;
  if (ctx.state.time.phase === "night") ctx.emit("bed:turn");
  else ctx.state.time.minute += B.minutesPerTurn;
  if (sex.turns % 3 === 0 && (b.night!.third || b.night!.here === "public")) ctx.log(`log.bed.${b.night!.third ? "third" : "watched"}.${ctx.rng.int(1, 4)}`, b.night!.third ? { name: `@name:${b.patrons[b.night!.third]?.name ?? ""}` } : undefined);
  if (actById(sex.act).lines && sex.turns % 2 === 0) ctx.log(`log.act.${sex.act}.turn.${ctx.rng.int(1, 3)}`);
  // in the open, on a night a guest sent her home worked up: she tells him about it while they are at it
  const Rp = content.intimacy.her.report;
  if (b.night!.why === "guest" && b.mode === "open" && Rp.turns.includes(sex.turns)) {
    ctx.log(`log.bed.report.${Rp.turns.indexOf(sex.turns) + 1}`);
    his += Rp.his;
  }
  sex.his = clamp(sex.his + his);
  if (IN_BED.untouched.includes(sex.act) && !sex.byHand) sex.his = Math.min(sex.his, Math.max(B.givingCap, sex.his - his)); // nothing touches him: it builds and stays there
  sex.hers = clamp(sex.hers + hers);
  // he goes over in the first moves: it is over before she gets there, never both at once
  if (sex.his >= 100 && sex.turns <= 2 && !sex.lead) sex.hers = Math.min(sex.hers, 99);
  if (sex.hers >= 100) {
    sex.came += 1;
    sex.hers = B.afterOrgasm;
    orgasm(ctx);
    // "clenching around you" is for when he is in her; from his mouth or his hand it is another line
    ctx.log(sex.act === "rimming_her" ? "log.bed.her.rimming_her" : entersZone(actById(sex.act)) ? "log.bed.she_comes" : "log.bed.she_comes.out");
    if (sex.act === "rimming_her") b.night!.scene = "came_rimming_her";
  }
  if (!sex.soft && !sex.lead && !sex.byHand && IN_BED.untouched.includes(sex.act) && sex.came >= B.givingComes) {
    ctx.log("log.bed.end.enough_her");
    afterEnds(ctx);
    return true;
  }
  if (sex.soft && HIS_ACTS.includes(sex.act)) {
    // soft or not, what is done to him from behind still gets him there: no erection needed for that
    if (sex.his >= 100) {
      finish(ctx, "auto");
      return true;
    }
    return false;
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
  // far too soon: he feels it coming and has one move to do something about it
  if (!sex.warned && !sex.lead && sex.his >= B.save.earlyAt && sex.his < 100 && sex.turns <= B.save.earlyTurns && !GIVES_HER.has(sex.act)) {
    sex.warned = "early";
    ctx.log("log.bed.slipping.early");
  }
  if (sex.his >= 100) {
    finish(ctx, "auto");
    return true;
  }
  // he goes soft: she is not there, or there is nothing to feel, or there is too much between them
  const soft = softChance(ctx.state) + (sex.out ? B.soft.whenOut : 0) + (tightness(ctx.state, sex.act) < 0.3 ? B.soft.whenLoose : 0) + b.heroine.marriage.resent * B.soft.perResent + (tired(ctx.state) ? content.day.rhythm.him.softTired : 0);
  const hisTurn = !GIVES_HER.has(sex.act) && !SOFT_ACTS.includes(sex.act); // it does not matter while he is doing something for her, or she to him with nothing asked of him
  // once he has felt it going and did not catch it, it goes: the warning is the only chance he gets
  const doomed = sex.warned === "soft" && !sex.saved && hisTurn && !sex.byHand;
  const slipping = doomed || (hisTurn && sex.turns >= 2 && sex.his < B.soft.belowHis && !sex.byHand && !sex.saved && soft > 0 && ctx.rng.chance(soft));
  // the first time he only feels it going: one move to do something about it
  if (slipping && !sex.warned) {
    sex.warned = "soft";
    ctx.log("log.bed.slipping.soft");
  } else if (slipping) {
    b.night!.sex = null;
    b.night!.scene = "went_soft";
    feel(ctx, -1.5, 1);
    b.heroine.frustration = clamp(b.heroine.frustration + (sex.came > 0 ? 0 : 12));
    ctx.log(b.heroine.marriage.desire >= B.reward.lovingDesire ? "log.bed.soft.kind" : "log.bed.soft");
    ctx.emit("bed:ended", { act: sex.act, came: sex.came > 0, outcome: "went_soft", turns: sex.turns });
    // he went soft: she may still ask him for what needs none of that
    const night = ctx.state.time.phase === "night";
    const more = wantsMore(ctx, sex);
    if (more) {
      ctx.log(`log.bed.second.${more.more ? "more" : "need"}.t${toneOf(ctx.state)}`, { act: `act.${more.act}` });
      if (night) b.night!.rest = { his: false, hers: sex.came > 0, act: sex.act, wants: more.act, hersAt: sex.hers };
      else startSecond(ctx, more.act, sex.hers);
      return true;
    }
    if (night) b.night!.rest = { his: false, hers: sex.came > 0, act: sex.act, hersAt: sex.hers };
    else backToWork(ctx, sex.turns);
    return true;
  }
  // locked up and getting nothing done for her: she says what she wants instead
  if (b.husband.caged && content.body.cage.through.includes(sex.act) && !sex.asks && sex.turns >= content.body.cage.demandTurns && !sex.demanded && hisActOpen(ctx.state, content.body.cage.demand)) {
    sex.asks = content.body.cage.demand;
    sex.demanded = true;
    ctx.log("log.bed.cage.demand", { act: `act.${content.body.cage.demand}` });
  }
  // a wife who has a taste for it, or holds the reins, now and then wants to be the one doing it to him
  const hh = b.heroine;
  if (!sex.lead && !sex.asks && !sex.out && !FEMDOM.has(sex.act) && sex.turns >= 2 && (b.power >= 20 || cruelNow(b) || (hh.tastes.acts.pegging ?? 0) > 0 || (hh.tastes.acts.prostate ?? 0) > 0)) {
    const cand = ["prostate", "dildo_him", "pegging"].filter((a) => hisActOpen(ctx.state, a));
    if (cand.length > 0 && ctx.rng.chance(0.05 + b.power * 0.002)) {
      sex.asks = ctx.rng.pick(cand);
      ctx.log("log.bed.fd.she_wants", { act: `act.${sex.asks}` });
    }
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
export const wantsMore = (ctx: Ctx, was: { hers: number; came: number; out: boolean; soft?: boolean; turns: number }): { act: string; more: boolean } | null => {
  const b = bs(ctx.state);
  const h = b.heroine;
  const A = B.after;
  if (!b.night || was.soft || was.out || h.marriage.resent >= A.maxResent) return null;
  const S2 = content.intimacy.her.second;
  const rounds = b.night.rounds ?? 0;
  if (was.came > 0) {
    // she has come and can go on: with her libido one is not always enough (with guests it never is)
    if (rounds >= S2.maxRounds - 1 || h.energy < S2.energy || !ctx.rng.chance(Math.min(0.9, S2.base + Math.max(0, h.traits.libido - 50) * S2.perLibido))) return null;
  } else {
    if (was.hers < A.minHers) return null;
    if (!ctx.rng.chance(Math.min(0.95, A.chance + Math.max(0, h.marriage.desire - 50) * A.perDesire + toneOf(ctx.state) * 0.1))) return null;
  }
  const pick = SOFT_ACTS.filter((a) => BED_ACTS.includes(a) && hisActOpen(ctx.state, a) && (!HIS_ACTS.includes(a) || b.power >= LEAD.hisActsPower))
    .map((a) => ({ a, r: rewardOf(ctx.state, a, HIS_ACTS.includes(a) ? herFromHis(ctx.state, a) : pleasureFor(ctx.state, actById(a), b.husband.size)) }))
    .sort((x, y) => y.r - x.r || x.a.localeCompare(y.a))[0];
  return pick ? { act: pick.a, more: was.came > 0 } : null;
};

/** The scene goes on with what needs nothing of him: she asked for it, or he offered. */
export const startSecond = (ctx: Ctx, act: string, hers: number) => {
  const n = bs(ctx.state).night!;
  n.rounds = (n.rounds ?? 0) + 1;
  if (n.rest?.hers) n.herCame = true; // the second round starts from zero; that she has come tonight stays
  n.rest = undefined;
  n.fin = undefined;
  n.sex = { act, his: 0, hers: clamp(hers), came: 0, turns: 0, top: false, skirt: true, pleasure: 0, bored: 0, asks: null, ignored: 0, out: false, byHand: false, looseSaid: true, soft: true };
  setAct(ctx, act);
  ctx.emit("bed:continued", { act });
};

/** She asked for more and did not get it: one more thing he owes her, and she may see to herself next to him. */
export const restRefused = (ctx: Ctx, quiet = false) => {
  const b = bs(ctx.state);
  const h = b.heroine;
  const r = b.night!.rest!;
  b.night!.rest = undefined;
  feel(ctx, 0, content.intimacy.her.second.refusedResent);
  if (!quiet) ctx.log(`log.bed.second.refused.t${toneOf(ctx.state)}`);
  owe(ctx, r.hers ? "more" : "refused"); // she came and wanted more, or she never got there: not the same grudge
  if (!r.hers && (h.traits.libido >= H.finishesHerselfAtLibido || h.arousal >= 60)) {
    b.night!.scene = "finishing_herself";
    b.night!.fin = undefined;
    h.satisfied = 60;
    changeHeroine(ctx, "arousal", -h.arousal * 0.6, "finished herself");
    ctx.log("log.husband.finishes_herself", undefined, quiet ? ["unseen"] : undefined);
  } else if (!r.hers) h.frustration = clamp(h.frustration + 8);
};

/** The end of what she kept him at: she got there, or she gave up on it. */
export const afterEnds = (ctx: Ctx) => {
  const b = bs(ctx.state);
  const sex = b.night!.sex!;
  b.night!.sex = null;
  b.night!.scene = sex.came > 0 ? "him_hug" : "left_wanting"; // "sleeping" is for when she is asleep
  if (sex.came > 0) feel(ctx, 2.5, -2.5);
  else b.heroine.frustration = clamp(b.heroine.frustration + 8);
  // that she came has just been said (she_comes): the second line about the same orgasm read as two of them
  if (sex.came === 0) ctx.log("log.bed.after.gave_up");
  ctx.emit("bed:ended", { act: sex.act, came: sex.came > 0, outcome: "after", turns: sex.turns });
  if (ctx.state.time.phase !== "night") backToWork(ctx, sex.turns);
  else b.night!.rest = { his: false, hers: sex.came > 0, act: sex.act, hersAt: sex.hers };
};

/**
 * It is over. At night what comes next is a stage of its own (`night.rest`): who came, what she asks for, and his answer -
 * he gives it, sees to her, holds her, starts again, or sleeps. By day and mid-shift there is no time for that: she just keeps him at it.
 */
export const finish = (ctx: Ctx, how: "auto" | "choice" | "stop") => {
  const live = bs(ctx.state).night!.sex!;
  const was = { ...live };
  const night = ctx.state.time.phase === "night";
  const more = how !== "stop" ? wantsMore(ctx, was) : null;
  finishScene(ctx, how, !!more && night && was.came === 0);
  const n = bs(ctx.state).night;
  if (more && n) {
    ctx.log(`log.bed.second.${more.more ? "more" : "need"}.t${toneOf(ctx.state)}`, { act: `act.${more.act}` });
    if (night) n.rest = { his: true, hers: live.came > 0, act: was.act, wants: more.act, hersAt: was.hers };
    else startSecond(ctx, more.act, was.hers);
    return;
  }
  if (night && n && !n.sex) n.rest = { his: how !== "stop", hers: live.came > 0, act: was.act, hersAt: was.hers };
  if (!night) backToWork(ctx, was.turns);
};

/** Mid-shift: the scene object belongs to the night, and the floor has been waiting. */
export const backToWork = (ctx: Ctx, turns: number) => {
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

export const finishScene = (ctx: Ctx, how: "auto" | "choice" | "stop", defer = false) => {
  const b = bs(ctx.state);
  const h = b.heroine;
  const sex = b.night!.sex!;
  const act = actById(sex.act);
  const oral = sex.act === "cunnilingus";
  b.night!.sex = null;
  if (how === "stop") {
    // nobody finished: he just stopped
    b.night!.scene = sex.came > 0 ? "him_hug" : "left_wanting";
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
  // not from a man she cannot feel, and not when he was gone in a moment: a too-early end leaves her where she was
  if (sex.came === 0 && sex.hers >= B.herCloseAt && sex.pleasure >= 30 && sex.turns > 2 && sex.warned !== "early") {
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
    ctx.log(earlier ? (entersZone(act) ? "log.bed.end.after_her" : NEEDS_HER.has(sex.act) && !sex.out ? "log.bed.end.after_her.hers" : "log.bed.end.after_her.out") : `log.husband.${oral ? "oral" : "sex"}.came`);
  } else if (sex.turns === 0 || (premature && sex.his >= 100 && sex.turns <= 1)) {
    outcome = "too_soon";
    b.night!.scene = "came_too_soon_foreplay";
    feel(ctx, -2, 2.5);
    changeHeroine(ctx, "arousal", 12, "left wanting");
    changeHeroine(ctx, "mood", -4, "left wanting");
    ctx.log("log.husband.too_soon");
  } else if (defer) {
    // she is about to ask him for more: what this night leaves her with is decided by his answer, not here
    outcome = "left_wanting";
    b.night!.scene = "left_wanting";
    ctx.log("log.husband.came_first");
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
export const herFinish = (ctx: Ctx) => {
  const b = bs(ctx.state);
  const h = b.heroine;
  const sex = b.night!.sex!;
  const inside = sex.act === "sex" || sex.act === "riding" || sex.act === "anal";
  const cruel = cruelNow(b);
  let where = allowedPlaces(ctx.state, FINISH[sex.act] ?? ["on_her"])[0]!;
  let how = "plain";
  if (!HIS_ACTS.includes(sex.act) && sex.act !== "rimming_him") {
    // a ruined ending is what he owes her, collected: the more is owed, the likelier. With nothing owed it is a rare whim; on a night meant as a reward, never
    const O = content.intimacy.her.owes;
    const owed = (b.owes ?? 0) > 0 && b.power >= O.punishPower;
    if (b.night?.why === "reward") how = inside && !finishOff(ctx.state, "inside") ? "inside" : "plain";
    else if (owed && !endingOff(ctx.state, "ruined") && ctx.rng.chance(Math.min(0.9, (b.owes ?? 0) * O.ruinPer))) {
      how = "ruined";
      b.owes = (b.owes ?? 0) - 1;
      ctx.log(`log.bed.ruin.owed.${ctx.rng.int(1, 2)}`, { n: b.owes });
    } else if ((b.power >= LEAD.ruinedPower || cruel) && !endingOff(ctx.state, "ruined") && ctx.rng.chance(LEAD.ending.ruined * (owed ? 1 : O.randomRuin))) how = "ruined";
    else if (b.power >= LEAD.snowballPower && h.traits.openness >= LEAD.snowballOpenness && !endingOff(ctx.state, "snowball") && ctx.rng.chance(LEAD.ending.snowball)) how = "snowball";
    else if (inside && b.power >= LEAD.lickPower && !endingOff(ctx.state, "lick_clean") && ctx.rng.chance(LEAD.ending.lickClean)) how = "lick_clean";
    else if (inside && how === "plain" && !finishOff(ctx.state, "inside")) how = "inside";
  }
  if (how === "ruined") {
    // she lets go of him at the last moment: it happens, and it is worth nothing to him
    b.husband.cumOn = content.look.marks.onHim;
    b.husband.ruinedTurn = ctx.state.turn; // it takes almost nothing off how much he wants (rhythm, bed:ended)
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
export const herTurn = (ctx: Ctx) => {
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
  const own = (a: string) => !HIS_ACTS.includes(a) || b.power >= LEAD.hisActsPower || cruelNow(b);
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
    moveLine(ctx, sex.act, best.a, "she");
    setAct(ctx, best.a);
    ctx.log("log.bed.lead.switch", { act: `act.${best.a}` });
    return void turn(ctx, 2, 3);
  }
  const r = rates(ctx.state);
  // done: she has had hers, or it has gone on long enough
  if ((sex.came > 0 && (sex.his >= B.cumAt || sex.turns >= LEAD.minTurns)) || sex.turns >= LEAD.maxTurns) return void herFinish(ctx);
  // he is close and what they are doing is all for him: nothing in it for her to wait for, she lets him have it
  if (sex.his >= LEAD.holdAt && sex.came === 0 && r.hers <= 0) return void herFinish(ctx);
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
      // "I am not done" is for what she is getting something out of; when it is all being done to him, she is just making him wait
      ctx.log(HIS_ACTS.includes(sex.act) ? "log.bed.lead.hold.his" : "log.bed.lead.hold");
    }
    return void turn(ctx, 0, r.hers * 1.4);
  }
  // otherwise she takes her time, for herself
  turn(ctx, r.his * (sex.hers < 60 ? 0.6 : 1), r.hers * (sex.hers < 60 ? 1.5 : 1.3));
};

export const bedOptions = (state: GameState): { type: string; payload: Record<string, string> }[] => {
    const sex = bs(state).night?.sex;
    if (!sex) return [];
    // what is being done to him: he can only moan, ask for more, or ask her to go easy
    const fd = FEMDOM.has(sex.act) ? ["moan", "beg_more", "beg_gentle"] : [];
    // she runs it: he follows, asks, or takes it back
    if (sex.lead) return ["follow", ...fd, ...(sex.his >= B.cumAt ? ["beg"] : []), "take_back", "stop"].map((d) => ({ type: BED, payload: { do: d } }));
    const dos = ["keep", "faster", "slower", "talk", "kiss", "say_mine", "look_at_me", ...fd];

    if (!sex.byHand) dos.push("hand");
    if (!sex.top) dos.push("top");
    if (!sex.skirt) dos.push("skirt");
    if (!sex.naked && (sex.panties ?? "on") === "on") dos.push("panties_aside");
    if (!sex.naked && sex.panties !== "off") dos.push("panties_off");
    if (!sex.naked && sex.top && sex.panties === "off") dos.push("naked");
    dos.push("give_lead");
    const out = dos.map((d) => ({ type: BED, payload: { do: d } as Record<string, string> }));
    if (sex.asks && sex.asks !== "finish") out.unshift({ type: BED, payload: { do: "give", act: sex.asks } });
    if (sex.his >= B.cumAt) for (const where of FINISH[sex.act] ? allowedPlaces(state, FINISH[sex.act]!) : ["self"]) out.push({ type: BED, payload: { do: "finish", where } });
    for (const to of BED_ACTS) if (to !== sex.act && hisActOpen(state, to)) out.push({ type: BED, payload: { do: "switch", to } });
    out.push({ type: BED, payload: { do: "stop" } });
    return out;
  };

