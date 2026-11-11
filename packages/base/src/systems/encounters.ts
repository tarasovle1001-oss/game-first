// Guests try their luck with her, she answers through one formula.
// Every row of that formula is named and visible; mods add rows with api.formulas.addFactor(CONSENT_FORMULA, ...).
import type { Ctx, EngineView, GameState, ModApi } from "@tc/core";
import { content } from "../content";
import type { Act } from "../content/schema";
import { bs, clamp, HUSBAND, WIFE } from "../state";
import type { Patron, Verdict, Visit } from "../state";
import { fitOf, resolveBody } from "./body";
import { expectOf } from "./expectations";
import { addHerTips } from "./economy";
import { changeHeroine } from "./heroine";
import { variantKey } from "../text";
import { HALL, husbandIn, husbandNextTo, husbandSees, ticks } from "./places";

export const CONSENT_FORMULA = "base/consent";
const PROPOSAL_HISTORY = 12;
const DRINK_STRENGTH = 14;

export const isIntimate = (act: Act) => act.place === "private";

export interface ConsentInput {
  act: string;
  partner: string; // patron id, or "husband"
  loc: string; // where it would happen
  offer: number; // money he puts on the table
  pressure: number; // times he already insisted
}

const acts = new Map(content.acts.map((a) => [a.id, a]));
const topTier = Math.max(...content.acts.map((a) => a.tier));
export const actById = (id: string): Act => {
  const a = acts.get(id);
  if (!a) throw new Error(`unknown act "${id}"`);
  return a;
};

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
  const risk = (r: string) => (husbandIn(state, r) ? 2 : husbandNextTo(state, r) ? (thrill ? -1 : 1) : 0);
  return b.mode === "open" ? rooms[0]! : [...rooms].sort((x, y) => risk(x) - risk(y) || x.localeCompare(y))[0]!;
};

/** How far a man dares to go depends on how much he wants her. */
const tierCap = (p: Patron) => (p.memory.interest >= 65 ? topTier : p.memory.interest >= 45 ? 6 : p.memory.interest >= 30 ? 4 : 3);

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
    const tier = Math.min(v.tier + 1, tierCap(p), topTier);
    const options = content.acts.filter((a) => a.tier === tier && (a.id !== "drink" || p.approach === "drink"));
    // the one who buys drinks keeps doing so while she is still fairly sober
    const drink = p.approach === "drink" && tier >= 1 && b.heroine.drunk < 45 && v.tier >= 0 && roll(10) < 4;
    act = drink ? actById("drink") : options[roll(options.length)]!;
  }
  if (isIntimate(act) && v.rounds >= p.stamina) return null; // he is spent for tonight
  const offer = p.approach === "pay" && act.tier >= 3 ? Math.round((p.traits.generosity * act.tier) / 4) : 0;
  const at = (loc: string): ConsentInput => ({ act: act.id, partner: p.id, loc, offer, pressure: v.pressure });
  if (!isIntimate(act)) return at(HALL);
  // anything can happen right on the floor, it is just much harder for her. She steers it to where she minds least
  const room = privateRoomFor(state, engine, p.id);
  if (!room) return at(HALL);
  const score = (i: ConsentInput) => engine.evaluate<ConsentInput>(CONSENT_FORMULA, state, i).total;
  return score(at(HALL)) > score(at(room)) ? at(HALL) : at(room);
}

/** Ends the running encounter once its time is up (or right away when forced, e.g. at closing). */
export function endEncounter(ctx: Ctx, force = false) {
  const b = bs(ctx.state);
  const enc = b.encounter;
  if (!enc) return;
  if (!force && b.shift && b.shift.tick < enc.endsTick) return;
  b.encounter = null;
  ctx.state.where[WIFE] = HALL;
  if (ctx.state.where[enc.patron]) ctx.state.where[enc.patron] = HALL;
  ctx.emit("encounter:ended", { patron: enc.patron, act: enc.act, loc: enc.loc });
}

function accept(ctx: Ctx, v: Visit, p: Patron, input: ConsentInput, verdict: Verdict) {
  const b = bs(ctx.state);
  const act = actById(input.act);
  const eager = verdict === "eager";
  const k = eager ? 1 : 0.5; // reluctant yes: she gets half of the good out of it
  const e = act.effects;

  const first = (p.memory.acts[act.id] ?? 0) === 0;
  if (isLight(act)) {
    b.shift!.moment = { patron: p.id, act: act.id }; // shown as the scene of this hour if nothing bigger happens
  } else {
    b.encounter = { patron: p.id, act: act.id, loc: input.loc, verdict, endsTick: b.shift!.tick + ticks(act.minutes) };
    ctx.state.where[WIFE] = input.loc;
    ctx.state.where[p.id] = input.loc;
  }

  changeHeroine(ctx, "arousal", e.arousal * k, act.id);
  changeHeroine(ctx, "mood", eager ? e.mood : Math.min(e.mood, 0) - 3, act.id);
  changeHeroine(ctx, "energy", e.energy, act.id);
  if (act.id === "drink") changeHeroine(ctx, "drunk", DRINK_STRENGTH, act.id);

  p.memory.interest = clamp(p.memory.interest + e.interest);
  p.memory.affinity = clamp(p.memory.affinity + e.affinity * k, -100, 100);
  p.memory.tier = Math.max(p.memory.tier, act.tier);
  p.memory.acts[act.id] = (p.memory.acts[act.id] ?? 0) + 1;
  v.tier = Math.max(v.tier, act.tier);
  v.retry = null;
  v.pressure = 0;
  v.waited = 0; // he is being paid attention to

  // the physical side: stretch, skill, whether she comes
  const skill = b.heroine.skills[act.id] ?? 0;
  let came = false;
  if (isIntimate(act)) {
    const out = resolveBody(ctx, act, { size: p.size, minutes: act.minutes });
    came = out.came;
    v.rounds += 1;
    p.memory.sizeKnown = true;
    if (came) {
      p.memory.orgasms += 1;
      p.memory.affinity = clamp(p.memory.affinity + 6, -100, 100);
      // a bigger man than her husband made her come: size starts to matter to her
      if (p.size > b.husband.size) b.heroine.sizeTaste = clamp(b.heroine.sizeTaste + content.body.sizeTasteGain);
    }
  }

  // a skilled hand or mouth is worth more to him
  const tip = Math.round(((act.tip * p.traits.generosity) / 50) * (1 + skill / 100) * content.balance.purse.actTipScale) + input.offer;
  if (tip > 0) {
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

  const seen = husbandSees(ctx.state, input.loc);
  // while she hides it, what he was not there for does not reach his log
  const tags = seen || b.mode === "open" ? undefined : ["unseen"];
  // routine small talk with a familiar face is not worth a log line every hour
  if (!isLight(act) || first || verdict !== "eager")
    ctx.log(variantKey(`log.act.${act.id}.${verdict}`, (n) => ctx.rng.int(0, n - 1)), { name: `@name:${p.name}`, room: `loc.${input.loc}`, tip }, tags);
  if (came) ctx.log("log.came", { name: `@name:${p.name}` }, tags);
  ctx.emit("encounter:started", { patron: p.id, act: act.id, loc: input.loc, verdict, witnessed: seen, came, tier: act.tier, intimate: isIntimate(act) });
}

function refuse(ctx: Ctx, v: Visit, p: Patron, input: ConsentInput) {
  const b = bs(ctx.state);
  const act = actById(input.act);
  const type = content.patronTypes.find((t) => t.id === p.type)!;
  p.memory.refusals += 1;
  b.heroine.traits.confidence = clamp(b.heroine.traits.confidence + 0.2);
  const seen = husbandSees(ctx.state, HALL) || b.mode === "open"; // he asks on the floor, wherever he wanted to go
  ctx.log(variantKey(`log.act.${act.id}.refuse`, (n) => ctx.rng.int(0, n - 1)), { name: `@name:${p.name}`, room: `loc.${input.loc}`, tip: 0 }, seen ? undefined : ["unseen"]);

  const cool = (interest: number, affinity: number) => {
    p.memory.interest = clamp(p.memory.interest + interest);
    p.memory.affinity = clamp(p.memory.affinity + affinity, -100, 100);
  };
  switch (type.onRefusal) {
    case "backs_off":
      cool(-2, 1); // he takes it well, she notices
      v.blocked = true;
      break;
    case "insists":
      if (v.pressure < 1) {
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

/** Small talk, a drink, a bit of flirting: it happens in passing and does not take her off the floor. */
const isLight = (act: Act) => act.minutes === 0;

export function runProposals(ctx: Ctx) {
  const b = bs(ctx.state);
  const sh = b.shift!;
  sh.moment = null;
  if (b.encounter) return;
  // a man speaks up once he has been here a moment; the keener ones go first
  const eligible = sh.visits
    .filter((v) => !v.blocked && (v.served > 0 || v.waited > 0))
    .sort((a, c) => b.patrons[c.patron]!.memory.interest - b.patrons[a.patron]!.memory.interest || a.patron.localeCompare(c.patron));
  let spoke = 0;
  for (const v of eligible) {
    if (spoke >= content.consent.proposalsPerTick) break;
    const p = b.patrons[v.patron]!;
    const perHour = content.consent.askChancePerHour + p.memory.interest * content.consent.askChancePerInterest;
    if (!ctx.rng.chance((perHour * content.balance.shift.minutesPerTick) / 60)) continue;
    const input = nextProposal(ctx.state, ctx.engine, v, (len) => ctx.rng.int(0, len - 1));
    if (!input) continue;
    const act = actById(input.act);
    if (!isLight(act) && b.encounter) continue; // she is already with someone
    spoke += 1;
    const res = ctx.engine.evaluate<ConsentInput>(CONSENT_FORMULA, ctx.state, input);
    let verdict = verdictOf(res.total);
    // hesitating can go either way: the closer to "gladly", the surer the yes
    let rolled: number | undefined;
    if (verdict === "hesitant") {
      const c = content.consent;
      rolled = c.hesitantYesAtZero + ((1 - c.hesitantYesAtZero) * (res.total - c.hesitantAt)) / Math.max(1, c.eagerAt - c.hesitantAt);
      if (!ctx.rng.chance(rolled)) verdict = "refuse";
    }
    b.proposals.push({ day: ctx.state.time.day, tick: sh.tick, patron: p.id, act: input.act, loc: input.loc, verdict, seen: husbandSees(ctx.state, HALL) || husbandSees(ctx.state, input.loc), total: res.total, rows: res.rows, ...(rolled === undefined ? {} : { rolled }) });
    if (b.proposals.length > PROPOSAL_HISTORY) b.proposals.shift();
    const seen = husbandSees(ctx.state, HALL) || husbandSees(ctx.state, input.loc);
    ctx.emit("encounter:proposed", { patron: p.id, act: input.act, verdict, total: res.total, seen, rowIds: res.rows.map((r) => r.id) });
    if (verdict === "refuse") refuse(ctx, v, p, input);
    else accept(ctx, v, p, input, verdict);
    if (verdict === "refuse" || !isLight(act)) b.shift!.interrupt = true; // worth stopping "wait until" for
  }
}

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
  row("mood", 12, (s) => (her(s).mood - 50) * c.mood);
  row("tired", 13, (s, _i, act) => (her(s).energy < 20 && act.tier >= 2 ? -c.tired : null));
  row("satisfied", 14, (s, _i, act) => (isIntimate(act) ? -her(s).satisfied * c.satisfied : null));
  // her character
  row("openness", 20, (s, _i, act) => (her(s).traits.openness - 50) * c.openness * (0.3 + depth(act)));
  row("fidelity", 21, (s, _i, act, p) => (p && act.tier >= 2 ? -her(s).traits.fidelity * c.fidelity * depth(act) : null));
  row("libido", 22, (s, _i, act) => (act.tier >= 3 ? (her(s).traits.libido - 50) * c.libido : null));
  // him: a guest
  row("affinity", 30, (_s, _i, _a, p) => (p ? p.memory.affinity * c.affinity : null));
  row("charm", 31, (_s, _i, _a, p) => (p ? (p.traits.charm - 50) * c.charm : null));
  row("familiar", 32, (_s, _i, act, p) => (p && (p.memory.acts[act.id] ?? 0) > 0 ? c.familiar : null));
  row("jump", 33, (_s, _i, act, p) => {
    if (!p) return null;
    const skipped = act.tier - (p.memory.tier + 1);
    return skipped > 0 ? -c.jumpPerTier * skipped : null;
  });
  row("money", 34, (s, i) => {
    if (i.offer <= 0) return null;
    const b = bs(s);
    const need = clamp((b.debt - b.money) / 4000, 0, 1); // 0 = comfortable, 1 = drowning
    return i.offer * c.money * (0.5 + need);
  });
  row("pressure", 35, (s, i, _a, p) => (p && i.pressure > 0 ? (p.traits.persistence - her(s).traits.confidence) * c.pressure : null));
  // size: once she knows what he has, it counts for or against him, as much as size matters to her
  row("size", 36, (s, _i, act, p) => {
    const zone = act.zones.includes("vagina") ? "vagina" : act.zones.includes("anus") ? "anus" : null;
    if (!zone) return null;
    if (p && !p.memory.sizeKnown) return null;
    const size = p ? p.size : bs(s).husband.size;
    const diff = size - fitOf(s, "vagina"); // against what she is used to by now
    return clamp(diff * c.size * (0.4 + her(s).sizeTaste / 60), -c.sizeCap, c.sizeCap);
  });
  // him: her husband
  row("marital", 36, (_s, _i, _a, p) => (p ? null : c.marital));
  row("desire", 37, (s, _i, _a, p) => (p ? null : (her(s).marriage.desire - 50) * c.desire));
  row("resent", 38, (s, _i, _a, p) => (p ? null : -her(s).marriage.resent * c.resent));
  row("power_denies", 39, (s, _i, act, p) => (p || bs(s).mode !== "open" || act.tier < 5 ? null : -bs(s).power * sec.powerDenies));
  // the situation
  row("witnesses", 40, (s, i, act, p) => {
    const others = (bs(s).shift?.visits.length ?? 0) - 1;
    return p && i.loc === HALL && act.tier >= 3 && others > 0 ? -(100 - her(s).traits.openness) * c.witnesses : null;
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
  row("power", 42, (s, _i, act, p) => (p && bs(s).mode === "open" && act.tier >= 2 ? bs(s).power * sec.powerRow : null));

  // What the viewer sees of it: only if he is in the same room.
  api.scenes.register({
    id: "base.encounter",
    priority: 100,
    match(state) {
      const enc = bs(state).encounter;
      if (!enc || !husbandSees(state, enc.loc)) return null;
      return {
        type: actById(enc.act).scene,
        location: enc.loc,
        participants: [
          { id: WIFE, role: "wife" },
          { id: enc.patron, role: "patron" },
        ],
        tags: { outfit: bs(state).heroine.outfit },
      };
    },
  });

  // A passing moment on the floor (chat, drink, flirt) when nothing bigger is going on.
  api.scenes.register({
    id: "base.moment",
    priority: 50,
    match(state) {
      const m = bs(state).shift?.moment;
      if (!m || !husbandSees(state, HALL) || state.where[WIFE] !== HALL) return null;
      return {
        type: actById(m.act).scene,
        location: HALL,
        participants: [
          { id: WIFE, role: "wife" },
          { id: m.patron, role: "patron" },
        ],
        tags: { outfit: bs(state).heroine.outfit },
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
    const act = acts.get(enc.act);
    if (!act) return `encounter with unknown act "${enc.act}"`;
    return null;
  });
}
