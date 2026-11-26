// Guests try their luck with her, she answers through one formula.
// Every row of that formula is named and visible; mods add rows with api.formulas.addFactor(CONSENT_FORMULA, ...).
import { cruelNow } from "./hernight";
import { actOff } from "./kinks";
import type { Ctx, EngineView, GameState, ModApi, SceneDesc } from "@tc/core";
import { actById, actOf, content } from "../content";
import { outcomeOf, refusalWhy, setOutcome } from "./voice";
import type { Act } from "../content/schema";
import { bs, clamp, HUSBAND, WIFE } from "../state";
import type { Encounter, Patron, Verdict, Visit, Zone } from "../state";
import { entersZone, fitOf, orgasm, pleasureFor, sizeStage, stepsAbove, takeChance, useBody } from "./body";
import { think } from "./mind";
import { settleSize } from "./taking";
import { expectOf } from "./expectations";
import { addHerTips } from "./economy";
import { changeHeroine } from "./heroine";
import { dressOf } from "./dress";
import { variantKey } from "../text";
import { HALL, husbandIn, husbandNextTo, husbandSees, ticks } from "./places";

export const CONSENT_FORMULA = "base/consent";
const PROPOSAL_HISTORY = 12;
const DRINK_STRENGTH = 14;
const S = content.consent.scene;

export const isIntimate = (act: Act) => act.place === "private";

export interface ConsentInput {
  act: string;
  partner: string; // patron id, or "husband"
  loc: string; // where it would happen
  offer: number; // money he puts on the table
  pressure: number; // times he already insisted
}

const topTier = Math.max(...content.acts.filter((a) => !a.only).map((a) => a.tier)); // what guests can reach: acts kept for the marriage do not count
export { actById }; // lives with the content now; kept here for the systems that import it from encounters

export function verdictOf(total: number): Verdict {
  const c = content.consent;
  return total >= c.eagerAt ? "eager" : total >= c.hesitantAt ? "hesitant" : "refuse";
}

/** Tiers grow in weight: small talk barely touches her character, the top of the ladder fully does. */
const depth = (act: Act) => act.tier / topTier;

const privateRoomFor = (state: GameState, engine: EngineView, partner?: string): string | null => {
  // a guest with a room upstairs has a door that locks
  const own = partner ? Object.entries(bs(state).lodgers).find(([, l]) => l.patron === partner)?.[0] : undefined;
  if (own && !husbandIn(state, own) && !husbandNextTo(state, own)) return own;
  const rooms = engine
    .locations()
    .filter((l) => l.zone === "cafe" && l.tags?.includes("private"))
    .map((l) => l.id)
    .sort();
  if (rooms.length === 0) return null;
  // while she hides it she keeps away from him: not his room, and better not the one next door.
  // If the secret itself excites her, next door is exactly where she goes.
  const b = bs(state);
  const thrill = b.heroine.latents.guilt_thrill !== undefined;
  // a room whose only door opens into the room he is standing in means walking the man past him: as bad as his own room
  const here = state.where[HUSBAND] ?? "";
  const pastHim = (r: string) => {
    const doors = content.rooms.find((x) => x.id === r)?.links ?? [];
    return doors.length > 0 && doors.every((d) => d === here);
  };
  const risk = (r: string) => (husbandIn(state, r) || pastHim(r) ? 2 : husbandNextTo(state, r) ? (thrill ? -1 : 1) : 0);
  // when it is in the open between them there is nothing to walk around
  if (b.mode === "open") return rooms[0]!;
  const best = [...rooms].sort((x, y) => risk(x) - risk(y) || x.localeCompare(y))[0]!;
  // nowhere to go without passing him: not now
  return risk(best) >= 2 && !thrill ? null : best;
};

/** The room a guest is in right now, as far as she is concerned: the hall, or another room of the house. */
export const roomOfGuest = (state: GameState, id: string) => {
  const at = state.where[id];
  return !at || at === "cafe.bar" ? HALL : at;
};
/** Rooms with a door of their own: whatever happens there needs no other room. */
const closed = (loc: string) => loc !== HALL && (content.rooms.find((r) => r.id === loc)?.tags.includes("private") || loc.startsWith("hotel.") || loc === "cafe.sauna" || loc === "cafe.lounge");
/** Where she is for the guests: the room she is attending, or the hall. */
export const herRoom = (state: GameState) => {
  const at = bs(state).shift?.attend;
  return at && state.where[WIFE] === at.loc ? at.loc : HALL;
};

/** Money he puts on the table: the paying kind does, once per time with her. */
const offerOf = (p: Patron, act: Act, paid: boolean) => (p.approach === "pay" && act.tier >= (p.rich ? 2 : 3) && !paid ? Math.round(((p.traits.generosity * act.tier) / 4) * (p.rich ? content.balance.rich.offer : 1)) : 0);

/**
 * Is an act that has to get into her worth asking for with this man? Not when both know he is far past what she can take,
 * and not again tonight after a try that failed, until her body has moved a step.
 */
export const worthTrying = (state: GameState, p: Patron, a: Act) => {
  if (actOff(state, a.id)) return false; // the player switched it off (kinks.yaml)
  const zone = entersZone(a);
  if (!zone || !p.memory.sizeKnown) return true;
  if (takeChance(state, zone, p.size) <= 0) return false;
  const no = p.memory.noFit;
  return !(no && no.day === state.time.day && sizeStage(fitOf(state, zone)) <= no.stage);
};

/** How far a man dares to go depends on how much he wants her. */
const G = content.consent.guest;
/** A drunk or worked-up man dares more than his interest alone would let him. */
const tierCap = (p: Patron, v?: Visit) => {
  const dare = p.memory.interest + ((v?.drunk ?? 0) >= G.boldDrunk ? G.boldBonus : 0) + ((v?.heat ?? 0) >= G.boldHeat ? G.boldBonus : 0);
  return dare >= 65 ? topTier : dare >= 45 ? 6 : dare >= 30 ? 4 : 3;
};

/**
 * What this guest would ask for right now. Pure: the debug panel calls it to show the formula
 * before anything happens. `roll` picks between acts of the same tier.
 */
export function nextProposal(state: GameState, engine: EngineView, v: Visit, roll: (n: number) => number): ConsentInput | null {
  const b = bs(state);
  const p = b.patrons[v.patron];
  if (!p || v.blocked) return null;
  let act: Act;
  if (v.retry) act = actById(v.retry);
  else {
    const tier = Math.min(v.tier + 1, tierCap(p, v), topTier);
    // at the very top there is one act only: a man who has already been there does not ask for it every single time -
    // he picks among everything of the top two steps
    const wide = tier === topTier && Math.max(v.tier, p.memory.tier) >= topTier;
    const options = content.acts.filter((a) => (a.tier === tier || (wide && a.tier === topTier - 1)) && !a.only && (a.id !== "drink" || p.approach === "drink") && worthTrying(state, p, a));
    // the one who buys drinks keeps doing so while she is still fairly sober; once she is tipsy, any man may think of it -
    // nobody plans it, one glass simply makes the next one likelier
    const Al = content.consent.alcohol;
    const tipsy = b.heroine.drunk >= Al.othersFrom && b.heroine.drunk < Al.othersUpTo && v.tier >= 0 && tier >= 1 && roll(100) < Al.othersChance;
    // ...and any man who likes her may stand her one now and then (anyoneBuys, percent): drink is what moves an evening along
    const treats = p.approach !== "drink" && tier >= 1 && b.heroine.drunk < Al.buyerUpTo && v.tier >= 0 && roll(100) < Al.anyoneBuys;
    const drink = (p.approach === "drink" && tier >= 1 && b.heroine.drunk < Al.buyerUpTo && v.tier >= 0 && roll(10) < 4) || tipsy || treats;
    if (!drink && options.length === 0) return null; // nothing on that step he can ask for (what there is would not fit)
    act = drink ? actById("drink") : options[roll(options.length)]!;
  }
  if (isIntimate(act) && v.rounds >= p.stamina) return null; // he is spent for tonight
  const offer = offerOf(p, act, false);
  const at = (loc: string): ConsentInput => ({ act: act.id, partner: p.id, loc, offer, pressure: v.pressure });
  const here = roomOfGuest(state, p.id);
  if (act.at && !act.at.includes(here)) return null; // that one belongs to another room
  if (!isIntimate(act)) return at(here);
  if (closed(here)) return at(here); // the back room, the sauna, his room: there is a door already
  // anything can happen right on the floor, it is just much harder for her. She steers it to where she minds least
  const room = privateRoomFor(state, engine, p.id);
  if (!room) return at(HALL);
  const score = (i: ConsentInput) => engine.evaluate<ConsentInput>(CONSENT_FORMULA, state, i).total;
  return score(at(HALL)) > score(at(room)) ? at(HALL) : at(room);
}

/** He settles up when it is over: everything it came to, more if he got what he came for. */
function payOwed(ctx: Ctx, enc: Encounter) {
  const b = bs(ctx.state);
  const p = b.patrons[enc.patron];
  const done = enc.finished === true;
  const tip = Math.round((enc.owed ?? 0) * (done ? S.paidDone : S.paidCut));
  enc.owed = 0;
  if (!p || tip <= 0) return;
  const till = addHerTips(ctx, tip);
  if (b.shift) b.shift.tips += till;
  b.today.tips += till;
  p.memory.tipsTotal += tip;
  const seen = husbandSees(ctx.state, enc.loc) || b.mode === "open";
  ctx.log(done ? "log.enc.paid.came" : "log.enc.paid", { name: `@name:${p.name}`, tip }, seen ? undefined : ["unseen"]);
}

/** Ends what is going on between her and a guest. `force` is kept for callers; anything that calls this means it. */
export function endEncounter(ctx: Ctx, _force = true) {
  const b = bs(ctx.state);
  const enc = b.encounter;
  if (!enc) return;
  payOwed(ctx, enc);
  b.encounter = null;
  const sh = b.shift;
  // she goes back to where she was working: the room she is attending, or the hall; he goes back to his seat
  const attending = sh?.attend && sh.tick < sh.attend.until ? sh.attend.loc : null;
  ctx.state.where[WIFE] = attending ?? HALL;
  const ve = sh?.visits.find((x) => x.patron === enc.patron);
  if (ctx.state.where[enc.patron]) ctx.state.where[enc.patron] = ve?.at ?? HALL;
  for (const m of enc.men ?? []) {
    const vm = sh?.visits.find((x) => x.patron === m.patron);
    if (vm && ctx.state.where[m.patron]) ctx.state.where[m.patron] = vm.at ?? HALL;
  }
  if (sh) {
    // she goes back to work, and he does not come at her again straight away
    sh.restUntil = sh.tick + S.restMinutes;
    const v = sh.visits.find((x) => x.patron === enc.patron);
    if (v) v.cooldownUntil = sh.tick + S.patronCooldown;
  }
  ctx.emit("encounter:ended", { patron: enc.patron, act: enc.act, loc: enc.loc, minutes: sh ? sh.tick - enc.startTick : 0, came: enc.came });
}

/** What he would move on to from where they are: what he likes if he can get there, otherwise the next step. */
function nextInScene(ctx: Ctx, v: Visit, p: Patron, enc: Encounter): Act | null {
  const now = actById(enc.act);
  const cap = Math.min(topTier, tierCap(p, v) + 1); // in the middle of it a man dares a little more
  const options = content.acts.filter(
    (a) => !a.only && a.id !== enc.act && a.id !== "drink" && a.minutes > 0 && a.tier <= cap && a.tier <= now.tier + 2 && a.tier >= now.tier && (!isIntimate(a) || v.rounds < p.stamina) && (!a.at || a.at.includes(enc.loc)) && worthTrying(ctx.state, p, a),
  );
  if (options.length === 0) return null;
  const liked = options.filter((a) => p.likes?.includes(a.id)).sort((x, y) => y.tier - x.tier);
  if (liked.length > 0 && ctx.rng.chance(S.likeChance)) return liked[0]!;
  const up = options.filter((a) => a.tier === now.tier + 1);
  // the last step has one act on it: not every scene has to end there
  const toTop = now.tier + 1 === topTier;
  if (up.length > 0 && (!toTop || ctx.rng.chance(S.topChance))) return ctx.rng.pick(up);
  if (toTop) {
    const same = options.filter((a) => a.tier === now.tier);
    return same.length > 0 ? ctx.rng.pick(same) : null;
  }
  const further = options.filter((a) => a.tier > now.tier);
  return ctx.rng.pick(further.length > 0 ? further : options);
}

/** One minute of what is going on between her and a guest. */
export function advanceEncounter(ctx: Ctx) {
  const b = bs(ctx.state);
  const enc = b.encounter;
  const sh = b.shift;
  if (!enc || !sh || b.caught) return; // while her husband stands in the door, nothing moves
  const p = b.patrons[enc.patron];
  const v = sh.visits.find((x) => x.patron === enc.patron);
  if (!p || !v) return endEncounter(ctx);
  const h = b.heroine;
  const act = actById(enc.act);
  const seen = husbandSees(ctx.state, enc.loc) || b.mode === "open";
  const tags = seen ? undefined : ["unseen"];
  const name = `@name:${p.name}`;
  v.waited = 0;

  if (isIntimate(act)) {
    enc.his = clamp(enc.his + enc.hisRate * (1 + (v.heat ?? 0) / G.heatFinish)); // worked up, he does not last as long
    enc.hers = clamp(enc.hers + S.herRate * (enc.pleasure / 60) * (0.6 + h.arousal / 120) * (1 - h.satisfied / 160));
    if (enc.hers >= 100) {
      enc.came += 1;
      enc.hers = content.body.bed.afterOrgasm;
      orgasm(ctx);
      h.frustration = clamp(h.frustration - 25);
      p.memory.orgasms += 1;
      p.memory.affinity = clamp(p.memory.affinity + 6, -100, 100);
      // a bigger man than her husband made her come: size starts to matter to her
      if (p.size > b.husband.size) h.sizeTaste = clamp(h.sizeTaste + content.body.sizeTasteGain);
      ctx.log("log.came", { name }, tags);
      ctx.emit("encounter:came", { patron: p.id, act: enc.act, witnessed: seen });
    }
    if (enc.his >= 100) {
      v.rounds += 1;
      enc.his = 0;
      enc.finished = true;
      v.heat = (v.heat ?? 0) * G.heatAfter;
      // where it goes and what she makes of it is its own small scene
      if (!gate.finish?.(ctx, v, p, enc)) {
        ctx.log("log.enc.he_finishes", { name }, tags);
        ctx.emit("cum:landed", { by: p.id, act: enc.act });
      }
      if (!b.encounter) return; // she made a scene of it and it is over
      if (v.rounds >= p.stamina || !ctx.rng.chance(S.continueChance)) return endEncounter(ctx);
      enc.nextTry = sh.tick; // he still has it in him and wants something else
    }
  }

  const limit = enc.loc.startsWith("hotel.") ? S.maxMinutesRoom : S.maxMinutes;
  if (sh.tick - enc.startTick >= limit) return endEncounter(ctx);
  const ranOut = !isIntimate(act) && sh.tick - enc.actTick >= act.minutes; // a kiss or a lap does not last for ever
  if (sh.tick < enc.nextTry && !ranOut) return;

  // he tries to move it on
  enc.nextTry = sh.tick + ctx.rng.int(S.tryEvery[0], S.tryEvery[1]);
  // is she getting anything out of this? Her body, or her reasons for being with this man
  if (isIntimate(act)) {
    const worth = clamp(Math.max(enc.pleasure, enc.pleasure * 0.6 + Math.max(0, p.memory.affinity) * G.rewardAffinity + (enc.paid && h.latents.money_hungry !== undefined ? G.rewardPaid : 0) + (p.approach === "push" && h.latents.likes_rough !== undefined ? G.rewardRough : 0)));
    enc.bored = worth < G.rewardEnough ? (enc.bored ?? 0) + 1 : Math.max(0, (enc.bored ?? 0) - 1);
    if ((enc.bored ?? 0) >= G.boredLimit) {
      // she steers it to something that does more for her, or she has had enough
      const better = content.acts
        .filter((a) => !a.only && isIntimate(a) && a.id !== act.id && a.tier <= Math.max(act.tier, p.memory.tier) && (v.rounds < p.stamina) && (!a.at || a.at.includes(enc.loc)) && !actOff(ctx.state, a.id))
        .map((a) => ({ a, r: pleasureFor(ctx.state, a, p.size) }))
        .filter((x) => x.r >= enc.pleasure + G.rewardBetter)
        .sort((x, y) => y.r - x.r || x.a.id.localeCompare(y.a.id))[0];
      enc.bored = 0;
      if (better) {
        ctx.log("log.enc.she_steers", { name, act: `act.${better.a.id}` }, tags);
        return accept(ctx, v, p, { act: better.a.id, partner: p.id, loc: enc.loc, offer: 0, pressure: 0 }, "eager");
      }
      if (h.latents.submissive === undefined && !enc.paid) {
        ctx.log("log.enc.she_bored", { name }, tags);
        p.memory.affinity = clamp(p.memory.affinity - 2, -100, 100);
        h.frustration = clamp(h.frustration + 6);
        return endEncounter(ctx);
      }
    }
  }
  const next = nextInScene(ctx, v, p, enc);
  if (!next) return ranOut ? endEncounter(ctx) : undefined;
  const offer = offerOf(p, next, enc.paid);
  const at = (loc: string): ConsentInput => ({ act: next.id, partner: p.id, loc, offer, pressure: enc.refusals });
  let input = at(enc.loc);
  if (isIntimate(next) && enc.loc === HALL) {
    const room = privateRoomFor(ctx.state, ctx.engine, p.id);
    const score = (i: ConsentInput) => ctx.engine.evaluate<ConsentInput>(CONSENT_FORMULA, ctx.state, i).total;
    if (room && score(at(room)) >= score(at(HALL))) input = at(room);
  }
  const res = ctx.engine.evaluate<ConsentInput>(CONSENT_FORMULA, ctx.state, input);
  const total = res.total + S.goingBonus;
  const rows = [...res.rows, { id: "consent.going", labelKey: "factor.consent.going", value: S.goingBonus }];
  let verdict = verdictOf(total);
  let rolled: number | undefined;
  if (verdict === "hesitant") {
    const c = content.consent;
    rolled = c.hesitantYesAtZero + ((1 - c.hesitantYesAtZero) * (total - c.hesitantAt)) / Math.max(1, c.eagerAt - c.hesitantAt);
    if (!ctx.rng.chance(rolled)) verdict = "refuse";
  }
  const witnessed = husbandSees(ctx.state, enc.loc) || husbandSees(ctx.state, input.loc);
  b.proposals.push({ day: ctx.state.time.day, tick: sh.tick, patron: p.id, act: next.id, loc: input.loc, verdict, seen: witnessed, total, rows, ...(rolled === undefined ? {} : { rolled }) });
  if (b.proposals.length > PROPOSAL_HISTORY) b.proposals.shift();
  ctx.emit("encounter:proposed", { patron: p.id, act: next.id, verdict, total, seen: witnessed, rowIds: rows.map((r) => r.id) });
  sh.interrupt = sh.interrupt || witnessed;
  if (verdict !== "refuse") return accept(ctx, v, p, input, verdict);

  // she will not: stay where they are, or call it off
  if (ranOut) {
    // it simply ends where it was: no harm done, he will try again another time
    ctx.log("log.enc.ends", { name, act: `act.${next.id}` }, tags);
    return endEncounter(ctx);
  }
  enc.refusals += 1;
  p.memory.refusals += 1;
  if (enc.refusals >= S.stayLimit || total < content.consent.hesitantAt - S.endBelow) {
    ctx.log("log.enc.she_ends", { name, act: `act.${next.id}` }, tags);
    bodyWhy(ctx, rows, name, tags);
    p.memory.interest = clamp(p.memory.interest - 2);
    p.memory.affinity = clamp(p.memory.affinity - S.pushedTooFar, -100, 100); // he overdid it, and she remembers
    ctx.emit("encounter:pushed", { patron: p.id, act: next.id, far: true });
    return endEncounter(ctx);
  }
  p.memory.affinity = clamp(p.memory.affinity - S.pushed, -100, 100);
  // asking for what she plainly dislikes costs him more
  if ((h.tastes.acts[next.id] ?? 0) < 0) p.memory.affinity = clamp(p.memory.affinity - S.pushed, -100, 100);
  ctx.emit("encounter:pushed", { patron: p.id, act: next.id, far: false });
  ctx.log("log.enc.stays", { name, act: `act.${next.id}`, now: `act.${enc.act}` }, tags);
  bodyWhy(ctx, rows, name, tags);
}

/** When it is her body that says no (worn out, sore, no strength), the log says so: otherwise a late-evening "no" reads like a change of heart. */
function bodyWhy(ctx: Ctx, rows: { id: string; value: number }[], name: string, tags?: string[]) {
  const why = refusalWhy(rows);
  if (["worn", "tired", "sore"].includes(why) && bodySay(ctx)) ctx.log(`log.refuse.why.${why}`, { name }, tags);
}

/** Late in an evening every second man still asks; that she is done is said once, then she just shakes her head for a while. */
function bodySay(ctx: Ctx): boolean {
  const sh = bs(ctx.state).shift;
  if (!sh) return true;
  if (sh.bodySaid !== undefined && sh.tick - sh.bodySaid < S.bodyWhyEvery) return false;
  sh.bodySaid = sh.tick;
  return true;
}

function accept(ctx: Ctx, v: Visit, p: Patron, asked: ConsentInput, verdict: Verdict, hers = false) {
  const b = bs(ctx.state);
  // she said yes; whether a man his size gets in is another matter. If not, they find a way round it.
  const warmth = b.encounter?.patron === p.id ? b.encounter.warm : undefined;
  const wanted = actById(asked.act);
  const zoneIn = entersZone(wanted);
  // what is said about the try belongs after "he leads her off", not before it: the lines are held back until then
  const sizeLines: Parameters<Ctx["log"]>[] = [];
  const held = { ...ctx, log: (...line: Parameters<Ctx["log"]>) => void sizeLines.push(line) } as Ctx; // (the log is a ring: counting its length does not find them)
  const settled = settleSize(held, wanted, p.size, p.name, { warm: zoneIn ? (warmth?.[zoneIn] ?? 0) : 0, tags: husbandSees(ctx.state, asked.loc) || b.mode === "open" ? undefined : ["unseen"] });
  const input = settled.act.id === asked.act ? asked : { ...asked, act: settled.act.id };
  const act = settled.act;
  const eager = verdict === "eager";
  if (!isLight(actById(input.act)) || actById(input.act).tier >= 2) setOutcome(ctx, outcomeOf(verdict), p.id, husbandSees(ctx.state, herRoom(ctx.state)) || husbandSees(ctx.state, input.loc) || bs(ctx.state).mode === "open");
  const k = eager ? 1 : 0.5; // reluctant yes: she gets half of the good out of it
  const e = act.effects;

  const first = (p.memory.acts[act.id] ?? 0) === 0;
  const sh = b.shift!;
  const running = b.encounter?.patron === p.id ? b.encounter : null;
  const wasIn = running?.loc ?? herRoom(ctx.state);
  // walking off the floor with a guest while her husband is looking needs a word of some kind
  const leaving = !isLight(act) && wasIn === HALL && input.loc !== HALL && husbandSees(ctx.state, HALL) && !husbandSees(ctx.state, input.loc);
  let aloud = false;
  if (leaving) {
    const who = { name: `@name:${p.name}`, room: `loc.${input.loc}`, money: input.offer };
    if (b.mode === "open") ctx.log("log.leave.open", who);
    else if (input.offer > 0 && p.traits.persistence >= 70) {
      aloud = true; // the brazen kind names his price in front of everyone
      ctx.log("log.leave.offer", who);
    } else {
      ctx.log(`log.leave.excuse.${ctx.rng.int(1, 4)}`, who);
      b.suspicion = clamp(b.suspicion + S.leaveSuspicion * content.secrecy.styleFactor[b.husband.style]);
    }
    sh.interrupt = true;
  }
  if (isLight(act)) {
    sh.moment = { patron: p.id, act: act.id, until: sh.tick + ticks(10), loc: input.loc }; // shown as the scene for a while if nothing bigger happens
  } else if (running) {
    running.act = act.id;
    running.verdict = verdict;
    running.actTick = sh.tick;
    running.loc = input.loc;
    running.his = isIntimate(act) ? running.his : 0;
    running.paid = running.paid || input.offer > 0;
    ctx.state.where[WIFE] = input.loc;
    ctx.state.where[p.id] = input.loc;
  } else {
    b.encounter = { patron: p.id, act: act.id, loc: input.loc, verdict, startTick: sh.tick, actTick: sh.tick, nextTry: sh.tick + ctx.rng.int(S.tryEvery[0], S.tryEvery[1]), his: 0, hers: clamp(b.heroine.arousal * 0.3), hisRate: 0, pleasure: 0, came: 0, refusals: 0, paid: input.offer > 0 };
    ctx.state.where[WIFE] = input.loc;
    ctx.state.where[p.id] = input.loc;
  }

  changeHeroine(ctx, "arousal", e.arousal * k, act.id);
  changeHeroine(ctx, "mood", eager ? e.mood : Math.min(e.mood, 0) - 3, act.id);
  changeHeroine(ctx, "energy", e.energy, act.id);
  if (act.id === "drink") changeHeroine(ctx, "drunk", DRINK_STRENGTH, act.id);

  p.memory.interest = clamp(p.memory.interest + e.interest);
  // the kind of attention that suits her character wins her over faster
  const suits = (p.approach === "court" && b.heroine.latents.romantic !== undefined) || (p.approach === "push" && b.heroine.latents.likes_rough !== undefined) ? 1.6 : 1;
  p.memory.affinity = clamp(p.memory.affinity + e.affinity * k * suits, -100, 100);
  p.memory.tier = Math.max(p.memory.tier, act.tier);
  p.memory.acts[act.id] = (p.memory.acts[act.id] ?? 0) + 1;
  v.tier = Math.max(v.tier, act.tier);
  v.retry = null;
  v.pressure = 0;
  v.waited = 0; // he is being paid attention to

  // the physical side: stretch, skill, whether she comes
  const skill = b.heroine.skills[act.id] ?? 0;
  const came = false; // that is decided minute by minute now
  if (isIntimate(act) && b.encounter) {
    // her body takes it once per act; how it goes from here is counted by the minute
    b.encounter.pleasure = useBody(ctx, act, p.size);
    b.encounter.hisRate = 100 / (act.minutes * (0.7 + ctx.rng.int(0, 60) / 100));
    p.memory.sizeKnown = true;
    // what is done to a place now makes the next, bigger try in this scene likelier to work
    const W = content.body.take;
    const warms: Zone | null = zoneIn ?? (["fingering", "cunnilingus", "mutual_touching", "toy_on_her"].includes(act.id) ? "vagina" : act.id === "rimming_her" ? "anus" : null);
    if (warms) b.encounter.warm = { ...b.encounter.warm, [warms]: Math.min(W.warmMax, (b.encounter.warm?.[warms] ?? 0) + W.warm) };
    if (settled.take !== "fits") b.encounter.took = settled.take;
  }
  // it did not go in: he does not ask for that again tonight unless her body gives a step
  if (zoneIn && settled.act.id !== asked.act) p.memory.noFit = { day: ctx.state.time.day, stage: sizeStage(fitOf(ctx.state, zoneIn)) };

  // a skilled hand or mouth is worth more to him
  const tip = Math.round(((act.tip * p.traits.generosity) / 50) * (1 + skill / 100) * content.balance.purse.actTipScale) + input.offer;
  // behind a door he does not pay act by act: it adds up and he leaves it when they are done
  const later = act.place === "private" && !!b.encounter && b.encounter.patron === p.id;
  if (later) b.encounter!.owed = (b.encounter!.owed ?? 0) + tip;
  else if (tip > 0) {
    const till = addHerTips(ctx, tip); // the ledger counts only what reaches the till
    b.shift!.tips += till;
    b.today.tips += till;
    p.memory.tipsTotal += tip;
  }

  // saying yes moves her character; small talk does not, the further the act the more
  const d = content.consent.drift;
  const t = b.heroine.traits;
  const weight = Math.max(0, act.tier - 1) * k;
  t.openness = clamp(t.openness + d.openness * weight);
  t.fidelity = clamp(t.fidelity - d.fidelity * weight);
  if (eager) t.confidence = clamp(t.confidence + d.confidence * weight);

  const seen = husbandSees(ctx.state, input.loc) || aloud;
  // while she hides it, what he was not there for does not reach his log
  const tags = seen || b.mode === "open" ? undefined : ["unseen"];
  // routine small talk with a familiar face is not worth a log line every hour
  // where it happens is said once, when it starts, not with every new thing they do
  if (act.place === "private" && !running && !leaving) ctx.log(input.loc === HALL ? "log.enc.here" : hers ? "log.enc.away.hers" : "log.enc.away", { name: `@name:${p.name}`, room: `loc.${input.loc}` }, tags);
  for (const line of sizeLines) ctx.log(...line);
  // a man too long for her throat: she takes what she can, and it is said instead of "to the root"
  if (act.id === "deepthroat" && p.size > fitOf(ctx.state, "mouth") + content.body.take.throatOver) {
    ctx.log(`log.throat.partial.${ctx.rng.int(1, 3)}`, { name: `@name:${p.name}` }, tags);
    think(ctx, "thought.throat.partial");
  } else if (!isLight(act) || first || verdict !== "eager")
    ctx.log(
      variantKey(`log.act.${act.id}.${verdict}`, (n) => {
        // not the line this act had last time tonight
        const said = (sh.said = sh.said ?? {});
        const k = `${act.id}.${verdict}`;
        let i = ctx.rng.int(0, n - 1);
        if (said[k] === i) i = (i + 1) % n;
        said[k] = i;
        return i;
      }),
      { name: `@name:${p.name}`, room: `loc.${input.loc}`, tip },
      tags,
    );
  ctx.emit("encounter:started", { patron: p.id, act: act.id, loc: input.loc, verdict, witnessed: seen, came, tier: act.tier, intimate: isIntimate(act), switched: running !== null });
}

function refuse(ctx: Ctx, v: Visit, p: Patron, input: ConsentInput) {
  const b = bs(ctx.state);
  const act = actById(input.act);
  const type = content.patronTypes.find((t) => t.id === p.type)!;
  p.memory.refusals += 1;
  b.heroine.traits.confidence = clamp(b.heroine.traits.confidence + 0.2);
  const seen = husbandSees(ctx.state, herRoom(ctx.state)) || b.mode === "open"; // he asks where she is, wherever he wanted to go
  ctx.log(variantKey(`log.act.${act.id}.refuse`, (n) => ctx.rng.int(0, n - 1)), { name: `@name:${p.name}`, room: `loc.${input.loc}`, tip: 0 }, seen ? undefined : ["unseen"]);
  // past the lightest things a "no" has a reason, and it shows
  const last = b.proposals.at(-1);
  if (act.tier >= 2 && last && last.patron === p.id && last.act === act.id) {
    const reason = refusalWhy(last.rows);
    const why = `log.refuse.why.${reason}`;
    if (content.locales.ru?.[why] !== undefined && (!["worn", "tired", "sore"].includes(reason) || bodySay(ctx))) ctx.log(why, { name: `@name:${p.name}` }, seen ? undefined : ["unseen"]);
  }
  setOutcome(ctx, "away", p.id, seen);

  const cool = (interest: number, affinity: number) => {
    p.memory.interest = clamp(p.memory.interest + interest);
    p.memory.affinity = clamp(p.memory.affinity + affinity, -100, 100);
  };
  switch (type.onRefusal) {
    case "backs_off":
      if ((v.drunk ?? 0) >= G.deafDrunk && v.pressure < 1 && ctx.rng.chance(G.deafChance)) {
        // sober he would have let it go; with this much in him he asks again
        v.pressure += 1;
        v.retry = act.id;
        cool(0, -3);
        ctx.log("log.guest.drunk_again", { name: `@name:${p.name}` }, seen ? undefined : ["unseen"]);
        break;
      }
      cool(-2, 1); // he takes it well, she notices
      v.blocked = true;
      break;
    case "insists":
      if (v.pressure < (b.heroine.latents.likes_rough !== undefined ? 3 : 1)) {
        v.pressure += 1;
        v.retry = act.id;
        cool(0, -3);
      } else {
        v.blocked = true;
        v.retry = null;
        cool(-3, -8);
      }
      break;
    case "sulks":
      cool(-6, -2);
      changeHeroine(ctx, "mood", -2, "sulking guest");
      v.blocked = true;
      break;
    case "leaves":
      cool(-4, -5);
      v.blocked = true;
      v.stay = 0;
      break;
  }
  ctx.emit("encounter:refused", { patron: p.id, act: act.id, reaction: type.onRefusal });
}

/**
 * She is the one who starts it: wanting it, tipsy, left wanting at home, and a man in the room she likes.
 * She takes the next step with him herself, as far as she would gladly go anyway.
 */
function herOwnMove(ctx: Ctx) {
  const b = bs(ctx.state);
  const sh = b.shift!;
  const h = b.heroine;
  const H = G.her;
  const room = herRoom(ctx.state);
  if (b.encounter || sh.tick < (sh.restUntil ?? 0) || (sh.herMoves ?? 0) >= H.perShift || ctx.state.where[WIFE] !== room) return;
  const urge = Math.max(0, h.arousal - H.arousalFrom) * H.perArousal + h.frustration * H.perFrustration + h.drunk * H.perDrunk + (h.latents.exhibitionist !== undefined ? H.trait : 0) + (h.latents.disappointed !== undefined ? h.marriage.resent * H.perResent : 0);
  if (urge < H.urgeFrom || !ctx.rng.chance(Math.min(H.maxChance, (urge / 100) * H.chancePerMinute))) return;
  // whom: a man she likes; or a stranger, or a rough one, if that is her thing
  const drawn = (p: Patron) =>
    p.memory.affinity + (h.tastes.types[p.type] ?? 0) * 0.5 + (h.latents.new_faces !== undefined && p.memory.visits <= 1 ? H.traitPull : 0) + (h.latents.likes_rough !== undefined && p.approach === "push" ? H.traitPull : 0) + (h.latents.size_queen !== undefined && p.memory.sizeKnown ? Math.min(30, (sizeStage(p.size) - sizeStage(b.husband.size)) * 4) : 0);
  const best = sh.visits
    .filter((v) => !v.blocked && b.ask?.patron !== v.patron && (!v.away || room !== HALL) && v.out === undefined && sh.tick >= (v.cooldownUntil ?? 0) && b.patrons[v.patron] && (v.served > 0 || v.group) && roomOfGuest(ctx.state, v.patron) === room)
    .map((v) => ({ v, p: b.patrons[v.patron]!, pull: drawn(b.patrons[v.patron]!) }))
    .filter((x) => x.pull >= H.pullFrom)
    .sort((x, y) => y.pull - x.pull || x.p.id.localeCompare(y.p.id))[0];
  if (!best) return;
  const { v, p } = best;
  const tier = Math.max(1, Math.min(v.tier + 1, p.memory.tier + 1, topTier));
  const score = (i: ConsentInput) => ctx.engine.evaluate<ConsentInput>(CONSENT_FORMULA, ctx.state, i);
  const options = content.acts
    // at the top of the ladder there is one act only: with a man she has been there with, she chooses among the top two steps
    .filter((a) => (a.tier === tier || (tier === topTier && Math.max(v.tier, p.memory.tier) >= topTier && a.tier === topTier - 1)) && !a.only && a.id !== "drink" && (!isIntimate(a) || v.rounds < p.stamina) && (!a.at || a.at.includes(room)) && worthTrying(ctx.state, p, a))
    .map((a) => {
      const at = (loc: string): ConsentInput => ({ act: a.id, partner: p.id, loc, offer: 0, pressure: 0 });
      const other = isIntimate(a) && !closed(room) ? privateRoomFor(ctx.state, ctx.engine, p.id) : null;
      const input = other && score(at(other)).total > score(at(room)).total ? at(other) : at(room);
      return { input, res: score(input) };
    })
    .sort((x, y) => y.res.total - x.res.total || x.input.act.localeCompare(y.input.act));
  const pick = options[0];
  if (!pick || pick.res.total < content.consent.eagerAt + H.margin) return; // she wants to, but not that much
  sh.herMoves = (sh.herMoves ?? 0) + 1;
  const seen = husbandSees(ctx.state, room) || husbandSees(ctx.state, pick.input.loc);
  b.proposals.push({ day: ctx.state.time.day, tick: sh.tick, patron: p.id, act: pick.input.act, loc: pick.input.loc, verdict: "eager", seen, total: pick.res.total, rows: [...pick.res.rows, { id: "consent.her_own", labelKey: "factor.consent.her_own", value: 0 }] });
  if (b.proposals.length > PROPOSAL_HISTORY) b.proposals.shift();
  p.memory.interest = clamp(p.memory.interest + H.interest);
  ctx.log(`log.her.starts.${actById(pick.input.act).tier <= 2 ? "light" : isIntimate(actById(pick.input.act)) ? "takes" : "close"}`, { name: `@name:${p.name}` }, seen || b.mode === "open" ? undefined : ["unseen"]);
  accept(ctx, v, p, pick.input, "eager", true); // it was her who took him by the wrist: "he leads her off" would say the opposite
  if (seen) sh.interrupt = true;
  ctx.emit("her:started", { patron: p.id, act: pick.input.act, seen });
}

/** Small talk, a drink, a bit of flirting: it happens in passing and does not take her off the floor. */
const isLight = (act: Act) => act.minutes === 0;

/** Every ten minutes: guests who have been served get drunker, and the ones who want her get worked up watching. */
export function warmGuests(ctx: Ctx) {
  const b = bs(ctx.state);
  for (const v of b.shift?.visits ?? []) {
    const p = b.patrons[v.patron];
    if (!p) continue;
    if (v.served > 0) v.drunk = clamp((v.drunk ?? 0) + (p.approach === "drink" ? G.drunkPerTick * 1.5 : G.drunkPerTick));
    const watching = p.memory.interest * G.heatPerInterest + (v.sawBare && v.sawBare !== "none" ? G.heatBare : 0) + (v.tier >= 2 ? G.heatTouched : 0);
    v.heat = clamp((v.heat ?? 0) + watching - G.heatCool);
  }
}

/** A hook for the terms between husband and wife: return true when she asks him before saying yes. */
export const gate: { ask?: (ctx: Ctx, v: Visit, p: Patron, input: ConsentInput, verdict: Verdict) => boolean; deal?: (ctx: Ctx, v: Visit, p: Patron, input: ConsentInput) => boolean; finish?: (ctx: Ctx, v: Visit, p: Patron, enc: Encounter) => boolean } = {};
/** Start an act with a guest outright (a dare taken, a yes given after asking). */
export function startWith(ctx: Ctx, patronId: string, actId: string, verdict: Verdict) {
  const b = bs(ctx.state);
  const v = b.shift?.visits.find((x) => x.patron === patronId);
  const p = b.patrons[patronId];
  if (!v || !p || b.encounter || v.out !== undefined || !ctx.state.where[p.id]) return false;
  const act = actById(actId);
  const loc = isIntimate(act) ? (privateRoomFor(ctx.state, ctx.engine, p.id) ?? HALL) : HALL;
  accept(ctx, v, p, { act: actId, partner: patronId, loc, offer: 0, pressure: 0 }, verdict);
  return true;
}

export function runProposals(ctx: Ctx) {
  const b = bs(ctx.state);
  const sh = b.shift!;
  if (sh.moment && sh.tick >= sh.moment.until) sh.moment = null;
  if (b.encounter || b.night || ((sh.awayUntil ?? 0) > sh.tick && !sh.attend)) return;
  // only the men in the room she is in: the hall, or the room she has gone into
  const room = herRoom(ctx.state);
  // a man speaks up once he has been here a moment; the keener ones go first
  const eligible = sh.visits
    .filter((v) => !v.blocked && b.ask?.patron !== v.patron /* she has gone to ask her husband about him: nothing with him until there is an answer */ && (!v.away || room !== HALL) && v.out === undefined && (v.served > 0 || v.waited > 0 || v.group) && roomOfGuest(ctx.state, v.patron) === room)
    .sort((a, c) => b.patrons[c.patron]!.memory.interest - b.patrons[a.patron]!.memory.interest || a.patron.localeCompare(c.patron));
  herOwnMove(ctx);
  if (b.encounter) return;
  let spoke = 0;
  const worn = sh.bodySaid !== undefined && sh.tick - sh.bodySaid < S.bodyWhyEvery ? S.wornAsks : 1;
  for (const v of eligible) {
    if (spoke >= content.consent.proposalsPerTick) break;
    const p = b.patrons[v.patron]!;
    const perHour = (content.consent.askChancePerHour + p.memory.interest * content.consent.askChancePerInterest) * (1 + (v.heat ?? 0) / G.heatAsks);
    // the man she went to see, or who called her in, speaks up straight away; the others as at any table
    const first = sh.attend?.patron === v.patron && !sh.attend.asked;
    if (first) sh.attend!.asked = true;
    else if (!ctx.rng.chance((perHour * content.balance.shift.minutesPerTick) / 60 * (room === HALL ? 1 : S.roomAsks) * worn)) continue;
    const input = nextProposal(ctx.state, ctx.engine, v, (len) => ctx.rng.int(0, len - 1));
    if (!input) continue;
    const act = actById(input.act);
    if (!isLight(act) && (b.encounter || sh.tick < (sh.restUntil ?? 0) || sh.tick < (v.cooldownUntil ?? 0))) continue; // she is with someone, or only just back at work
    spoke += 1;
    if (gate.deal?.(ctx, v, p, input)) continue; // a man with money goes to her husband first
    const res = ctx.engine.evaluate<ConsentInput>(CONSENT_FORMULA, ctx.state, input);
    let verdict = verdictOf(res.total);
    // hesitating can go either way: the closer to "gladly", the surer the yes
    let rolled: number | undefined;
    if (verdict === "hesitant") {
      const c = content.consent;
      rolled = c.hesitantYesAtZero + ((1 - c.hesitantYesAtZero) * (res.total - c.hesitantAt)) / Math.max(1, c.eagerAt - c.hesitantAt);
      if (!ctx.rng.chance(rolled)) verdict = "refuse";
    }
    b.proposals.push({ day: ctx.state.time.day, tick: sh.tick, patron: p.id, act: input.act, loc: input.loc, verdict, seen: husbandSees(ctx.state, room) || husbandSees(ctx.state, input.loc), total: res.total, rows: res.rows, ...(rolled === undefined ? {} : { rolled }) });
    if (b.proposals.length > PROPOSAL_HISTORY) b.proposals.shift();
    const seen = husbandSees(ctx.state, room) || husbandSees(ctx.state, input.loc);
    ctx.emit("encounter:proposed", { patron: p.id, act: input.act, verdict, total: res.total, seen, rowIds: res.rows.map((r) => r.id) });
    if (gate.ask?.(ctx, v, p, input, verdict)) continue; // she goes to her husband first: glad of it, or not glad at all
    if (verdict === "refuse") refuse(ctx, v, p, input);
    else {
      accept(ctx, v, p, input, verdict);
      // she is plainly glad of it: he reads that and does not go one small step at a time
      // (only when she would gladly take the step he skips, too)
      if (isLight(act) && verdict === "eager" && res.total >= content.consent.eagerAt + S.skipMargin) {
        const over = content.acts.filter((a) => a.tier === act.tier + 1 && !a.only && a.id !== "drink" && !actOff(ctx.state, a.id));
        const glad = over.length > 0 && over.every((a) => verdictOf(ctx.engine.evaluate<ConsentInput>(CONSENT_FORMULA, ctx.state, { ...input, act: a.id }).total) === "eager");
        if (glad) {
          v.tier = Math.min(v.tier + 1, tierCap(p, v), topTier);
          p.memory.tier = Math.max(p.memory.tier, v.tier); // it counts as a step taken, not as one he jumped over
        }
      }
    }
    if (verdict === "refuse" || !isLight(act)) b.shift!.interrupt = true; // worth stopping "wait until" for
  }
}

/** The picture of the ending, by where it went. */
const FIN_SCENE: Record<string, string> = { face: "patron_fin_face", mouth: "patron_fin_mouth", chest: "patron_fin_chest", body: "patron_fin_body", hands: "patron_fin_hands", inside: "patron_fin_inside", anus: "patron_fin_anus", thighs: "patron_fin_thighs", held: "patron_fin_held" };
/** Which picture it is when more than one man has her: by the parts of her that are taken. */
export function groupScene(actId: string, joined: string[]): string | null {
  if (joined.length === 0) return null;
  const zones = actById(actId).zones as string[];
  const own = zones.includes("vagina") ? "pussy" : zones.includes("anus") ? "anus" : zones.includes("mouth") ? "mouth" : "hand";
  const s = new Set([own, ...joined]);
  const below = s.has("pussy") || s.has("anus");
  if (s.has("pussy") && s.has("anus")) return s.has("mouth") ? "group_airtight" : "group_dp";
  if (below && s.has("mouth")) return s.has("hand") ? "group_spitroast_hand" : "group_spitroast";
  if (below && s.has("hand")) return "group_sex_hand";
  if (s.has("mouth") && s.has("hand")) return "group_oral_hand";
  return null;
}

/** What the screen may show: what the husband can see from where he stands, or everything when the player has asked to watch it all. */
export const onScreen = (state: GameState, loc: string) => husbandSees(state, loc) || bs(state).viewAll === true || (bs(state).mode === "open" && loc.startsWith("hotel.room")); // in an open marriage what goes on in a let room is no secret to him

export function registerEncounters(api: ModApi) {
  const c = content.consent;
  const sec = content.secrecy;
  // `p` is null when the partner is her husband: rows about a guest simply do not apply then
  type F = (state: GameState, input: ConsentInput, act: Act, p: Patron | null) => number | null;
  const row = (id: string, order: number, fn: F) =>
    api.formulas.addFactor<ConsentInput>(CONSENT_FORMULA, {
      id: `consent.${id}`,
      labelKey: `factor.consent.${id}`,
      order,
      eval(state, input) {
        const p = input.partner === HUSBAND ? null : bs(state).patrons[input.partner];
        if (p === undefined) return null;
        const v = fn(state, input, actById(input.act), p);
        return v === null || Math.abs(v) < 0.05 ? null : v; // rows that add nothing are not shown
      },
    });
  const her = (s: GameState) => bs(s).heroine;

  row("act", 0, (_s, _i, act, p) => (p ? act.base : act.base / 2)); // with her husband nothing is a big step
  // her state
  row("arousal", 10, (s, _i, act) => her(s).arousal * c.arousal * (0.3 + depth(act)));
  row("drunk", 11, (s) => her(s).drunk * c.drunk);
  // past a point drink asks for more drink: another glass is easier to say yes to than the first
  row("tipsy_more", 11.5, (s, _i, act) => (act.id === "drink" && her(s).drunk >= c.alcohol.selfFrom ? (her(s).drunk - c.alcohol.selfFrom) * c.alcohol.selfPer : null));
  row("mood", 12, (s) => (her(s).mood - 50) * c.mood);
  row("tired", 13, (s, _i, act) => (her(s).energy < 20 && act.tier >= 2 ? -c.tired - (20 - her(s).energy) * c.tiredPer : null));
  // nights that left her wanting add up, and at some point they speak for any man who is not her husband
  row("frustrated", 13.5, (s, _i, act) => (act.tier >= 3 && her(s).frustration >= 10 ? her(s).frustration * c.frustrated : null));
  row("satisfied", 14, (s, _i, act) => (isIntimate(act) ? -her(s).satisfied * c.satisfied : null));
  // her character
  row("openness", 20, (s, _i, act) => (her(s).traits.openness - 50) * c.openness * (0.3 + depth(act)));
  row("fidelity", 21, (s, _i, act, p) => (p && act.tier >= 2 ? -her(s).traits.fidelity * c.fidelity * depth(act) : null));
  row("libido", 22, (s, _i, act) => (act.tier >= 3 ? (her(s).traits.libido - 50) * c.libido : null));
  // him: a guest
  row("affinity", 30, (_s, _i, _a, p) => (p ? p.memory.affinity * c.affinity : null));
  row("charm", 31, (_s, _i, _a, p) => (p ? (p.traits.charm - 50) * c.charm : null));
  row("familiar", 32, (_s, _i, act, p) => (p && (p.memory.acts[act.id] ?? 0) > 0 ? c.familiar : null));
  // a man she hardly knows: a faithful wife does not kiss him or sit on his lap, whatever her mood
  row("stranger", 32, (s, i, act, p) => {
    if (!p || act.tier < 2 || i.offer > 0 || her(s).latents.new_faces !== undefined) return null;
    const gap = Math.max(0, c.strangerBelow - p.memory.affinity);
    return gap > 0 ? -(her(s).traits.fidelity / 100) * gap * c.stranger * (act.tier === 2 ? 0.4 : 1) || null : null;
  });
  // a man who can hardly stand is not much of a temptation, unless rough and sloppy is what she likes
  row("drunk_guest", 32, (s, _i, act, p) => {
    const v = p ? bs(s).shift?.visits.find((x) => x.patron === p.id) : undefined;
    const over = (v?.drunk ?? 0) - G.sloppyFrom;
    if (!v || over <= 0 || act.tier < 2) return null;
    return her(s).latents.likes_rough !== undefined ? over * G.sloppy * 0.5 : -over * G.sloppy;
  });
  row("jump", 33, (_s, _i, act, p) => {
    if (!p) return null;
    const skipped = act.tier - (p.memory.tier + 1);
    return skipped > 0 ? -c.jumpPerTier * skipped : null;
  });
  // a man who has heard "no" from her many times and keeps at it wears her patience thin
  row("fed_up", 33.5, (_s, _i, act, p) => (p && act.tier >= 2 && p.memory.refusals >= S.fedUpAfter ? -Math.min(S.fedUpMax, (p.memory.refusals - S.fedUpAfter + 1) * S.fedUpPer) : null));
  row("money", 34, (s, i) => {
    if (i.offer <= 0) return null;
    const b = bs(s);
    const need = clamp((b.debt - b.money) / 4000, 0, 1); // 0 = comfortable, 1 = drowning
    // money talks, but it does not shout: past a point more of it changes nothing (a rich man's offer is a reason, not a switch)
    return Math.min(c.moneyCap, i.offer * c.money * (0.5 + need));
  });
  row("pressure", 35, (s, i, _a, p) => (p && i.pressure > 0 ? (p.traits.persistence - her(s).traits.confidence) * c.pressure : null));
  // size: once she knows what he has, it counts for or against him, as much as size matters to her
  row("size", 36, (s, _i, act, p) => {
    const zone = act.zones.includes("vagina") ? "vagina" : act.zones.includes("anus") ? "anus" : null;
    if (!zone) return null;
    if (p && !p.memory.sizeKnown) return null;
    const size = p ? p.size : bs(s).husband.size;
    const diff = size - fitOf(s, "vagina"); // against what she is used to by now
    // curiosity pulls, as much as size matters to her; with her husband it is habit and duty as much as wanting: his size counts for half
    const pull = clamp(diff * c.size * (0.4 + her(s).sizeTaste / 60), -c.sizeCap, c.sizeCap) * (p ? 1 : c.sizeHusband);
    // ...and a body not ready for it holds back: every step he is above her, less for a woman who wants it
    const fear = stepsAbove(s, zone, size) * content.body.take.fearPerStage * Math.max(0.2, 1 - her(s).sizeTaste / 100);
    return pull - fear;
  });
  // him: her husband
  row("marital", 36, (_s, i, _a, p) => (p ? null : c.marital + (i.loc === "home.bedroom" ? c.maritalBed : 0)));
  row("desire", 37, (s, _i, _a, p) => (p ? null : (her(s).marriage.desire - 50) * c.desire));
  // he has gone without for nights: a wife who still cares lets him, out of tenderness or pity. One who holds the power does not
  row("pity", 38, (s, _i, _a, p) => {
    const b = bs(s);
    const h = her(s);
    if (p || b.denied < 2 || h.marriage.resent >= 40 || b.power >= 30 || cruelNow(b)) return null;
    return Math.min(c.pityMax, (b.denied - 1) * c.pity) * (h.marriage.desire / 100) || null;
  });
  row("resent", 38, (s, _i, _a, p) => (p ? null : -her(s).marriage.resent * c.resent));
  row("power_denies", 39, (s, _i, act, p) => (p || bs(s).mode !== "open" || act.tier < 5 ? null : -bs(s).power * sec.powerDenies));
  // the situation
  row("witnesses", 40, (s, i, act, p) => {
    // the other men in that room: in the hall the other tables, in the back room the rest of his company
    const others = (bs(s).shift?.visits.filter((v) => !v.away && v.patron !== i.partner && roomOfGuest(s, v.patron) === i.loc).length ?? 0);
    if (!p || act.tier < 3 || others === 0) return null;
    return i.loc === HALL ? -(100 - her(s).traits.openness) * c.witnesses : -(100 - her(s).traits.openness) * c.witnesses * Math.min(1, others / 3);
  });
  // a company: the others egg him on, and saying no to a whole table is harder than to one man
  row("company", 40.2, (s, i, act, p) => {
    if (!p || act.tier < 1 || i.loc === HALL) return null;
    const v = bs(s).shift?.visits.find((x) => x.patron === i.partner);
    if (!v?.group) return null;
    const others = bs(s).shift!.visits.filter((x) => x.group && x.patron !== i.partner && roomOfGuest(s, x.patron) === i.loc).length;
    return others * c.companyPerMan || null;
  });
  row("plain_sight", 40.5, (_s, i, act, p) => (p && isIntimate(act) && i.loc === HALL ? -c.inPlainSight : null));
  // His eyes on her. How heavy they are depends on what she thinks he allows: if she is sure he does not mind,
  // they weigh nothing; if she is sure he does, they stop her cold.
  row("husband", 41, (s, i, act, p) => {
    if (!p || act.tier < 2) return null;
    const b = bs(s);
    if (b.mode === "open") return husbandSees(s, i.loc) ? sec.watchingByStyle[b.husband.style] : null; // he knows; how he takes it decides
    // 1 = she is sure he minds, 0 = she is sure he does not; with no idea at all she is only half as careful
    const minds = clamp((20 - expectOf(s, act.id)) / 100, 0, 1);
    if (husbandIn(s, i.loc)) return -c.husbandWatching * minds;
    if (husbandSees(s, i.loc)) return -c.husbandWatching * 0.7 * minds;
    if (husbandSees(s, HALL) && i.loc !== HALL) return (-c.husbandWatching / 2) * minds; // he would see them walk off together
    return null;
  });
  // What she believes he wants, when he is not looking: a "yes" always helps a little,
  // a "no" holds her back only as far as she is honest (in the open she simply goes by it).
  row("expect", 41.5, (s, i, act, p) => {
    if (!p || act.tier < 2) return null;
    const b = bs(s);
    const x = expectOf(s, act.id);
    if (x > 0) return (x / 100) * c.expect.permission;
    if (b.expect[act.id] === undefined && x >= c.expect.unknown) return null; // nothing was ever said or shown
    if (b.mode !== "open" && husbandSees(s, i.loc)) return null; // already counted in his eyes on her
    const binds = b.mode === "open" ? 1 : her(s).traits.honesty / 100;
    return (x / 100) * c.expect.behindBack * binds;
  });
  // He has gone out and left the bar to her: nobody to see, nobody to ask. She hurries to be done before he is back.
  row("away", 41.7, (s, _i, act, p) => {
    const sh = bs(s).shift;
    if (!p || act.tier < 2 || !sh || sh.awaySince === undefined) return null;
    const A = c.away;
    const hours = Math.max(0, sh.tick - sh.awaySince) / 60;
    return Math.min(A.max, A.base + hours * A.perHour) * (1 - (her(s).traits.honesty / 100) * A.honesty);
  });
  row("power", 42, (s, _i, act, p) => (p && bs(s).mode === "open" && act.tier >= 2 ? bs(s).power * sec.powerRow : null));

  // What the viewer sees of it: only if he is in the same room.
  api.scenes.register({
    id: "base.encounter",
    priority: 100,
    match(state) {
      const enc = bs(state).encounter;
      if (!enc || !onScreen(state, enc.loc)) return null;
      const joining = enc.joined && enc.joinUntil !== undefined && (bs(state).shift?.tick ?? 0) < enc.joinUntil;
      return {
        type: joining ? `join_${enc.joined}` : (groupScene(enc.act, (enc.men ?? []).map((m) => m.slot)) ?? actById(enc.act).scene),
        location: enc.loc,
        participants: [
          { id: WIFE, role: "wife" },
          { id: enc.patron, role: "patron" },
          ...(joining ? [{ id: HUSBAND, role: "husband" }] : (enc.men ?? []).map((m, i) => ({ id: m.patron, role: `patron${i + 2}` }))),
        ],
        tags: { outfit: dressOf(state), ...((enc.men?.length ?? 0) > 0 ? { men: String(1 + enc.men!.length) } : {}), ...((enc.crowd?.length ?? 0) > 0 ? { crowd: "yes" } : {}) },
      };
    },
  });
  // He has just finished: for a few minutes the picture is the ending, not the act.
  api.scenes.register({
    id: "base.finish",
    priority: 90,
    match(state): SceneDesc | null {
      const f = bs(state).shift?.fin;
      if (!f || bs(state).encounter || (bs(state).shift?.tick ?? 0) >= f.until || !onScreen(state, f.loc)) return null;
      // a group that has finished: the picture is all of them after it, not one man's ending
      if ((f.men ?? 0) >= 2) return { type: "group_after", location: f.loc, participants: [{ id: WIFE, role: "wife" }, { id: f.patron, role: "patron" }], tags: { outfit: dressOf(state), men: String(f.men) } };
      return { type: FIN_SCENE[f.place] ?? actById(f.act).scene, location: f.loc, participants: [{ id: WIFE, role: "wife" }, { id: f.patron, role: "patron" }], tags: { outfit: dressOf(state), fin: f.place, ...(f.lock ? { lock: "1" } : {}) } };
    },
  });

  // A passing moment on the floor (chat, drink, flirt) when nothing bigger is going on.
  api.scenes.register({
    id: "base.moment",
    priority: 50,
    match(state) {
      const m = bs(state).shift?.moment;
      const loc = m?.loc ?? HALL;
      if (!m || !onScreen(state, loc) || state.where[WIFE] !== loc) return null;
      return {
        type: actById(m.act).scene,
        location: loc,
        participants: [
          { id: WIFE, role: "wife" },
          { id: m.patron, role: "patron" },
        ],
        tags: { outfit: dressOf(state) },
      };
    },
  });

  api.invariants.add("encounter-consistent", (s) => {
    const b = bs(s);
    const enc = b.encounter;
    if (!enc) return null;
    if (!b.shift) return "encounter outside of a shift";
    if (!b.shift.visits.some((v) => v.patron === enc.patron)) return `encounter with ${enc.patron} who is not here`;
    if (s.where[WIFE] !== enc.loc || s.where[enc.patron] !== enc.loc) return "encounter participants are not in its room";
    const act = actOf(enc.act);
    if (!act) return `encounter with unknown act "${enc.act}"`;
    return null;
  });
}
