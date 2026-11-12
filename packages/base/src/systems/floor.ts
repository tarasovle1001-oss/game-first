// The floor during the evening: the small things that happen at the tables, a guest with money who goes to
// the husband first, a company that takes the back room, sitting down with a guest, joining her.
import type { Ctx, GameState, ModApi } from "@tc/core";
import { content } from "../content";
import { bs, clamp, HUSBAND, WIFE } from "../state";
import type { Patron, Visit } from "../state";
import { annoy } from "./annoy";
import { resolveBody } from "./body";
import { addHerTips, addMoney, addReputation } from "./economy";
import { actById, CONSENT_FORMULA, gate, isIntimate, startWith, verdictOf } from "./encounters";
import type { ConsentInput } from "./encounters";
import { changeHeroine } from "./heroine";
import { EMOTIONS, feel, trustOf } from "./mind";
import type { Emotion } from "./mind";
import { generatePatron } from "./patrons";
import { HALL, husbandSees } from "./places";
import { changeHim } from "./rhythm";
import { runUnattended } from "./shift";

export const DEAL = "base/deal";
export const GROUP = "base/group";
export const TABLE = "base/table";
export const JOIN = "base/join";
export const LOUNGE = "cafe.lounge";
export const SAUNA = "cafe.sauna";
const F = content.floor;
const E = content.consent.expect;
type Fx = Record<string, number>;

/** One bag of numbers applied to her, to him at the table, and to the till. Returns the tip, if any. */
function apply(ctx: Ctx, bag: Fx | undefined, p: Patron | null, v: Visit | null, reason: string): number {
  if (!bag) return 0;
  const b = bs(ctx.state);
  const h = b.heroine;
  let tip = 0;
  for (const [k, n] of Object.entries(bag)) {
    if (k === "affinity" && p) p.memory.affinity = clamp(p.memory.affinity + n, -100, 100);
    else if (k === "interest" && p) p.memory.interest = clamp(p.memory.interest + n);
    else if (k === "heat" && v) v.heat = clamp((v.heat ?? 0) + n);
    else if (k === "number" && p) p.memory.hasNumber = true;
    else if (k === "annoy") annoy(ctx, n, "guests");
    else if (k === "tip") tip += n;
    else if (k === "trust") h.marriage.trust = clamp(trustOf(ctx.state) + n);
    else if (k === "resent" || k === "desire") h.marriage[k] = clamp(h.marriage[k] + n);
    else if ((EMOTIONS as readonly string[]).includes(k)) feel(ctx, k as Emotion, n);
    else if (k === "mood" || k === "arousal" || k === "energy" || k === "drunk") changeHeroine(ctx, k, n, reason);
  }
  if (tip > 0) {
    const till = addHerTips(ctx, Math.round(tip));
    if (b.shift) b.shift.tips += till;
    b.today.tips += till;
    if (p) p.memory.tipsTotal += Math.round(tip);
  }
  return Math.round(tip);
}

export function registerFloor(api: ModApi) {
  // === 1. small things at the tables ============================================================
  api.events.on("shift:tick", (ctx) => {
    const b = bs(ctx.state);
    const sh = b.shift;
    const h = b.heroine;
    if (!sh || b.encounter || b.night || (sh.awayUntil ?? 0) > sh.tick || ctx.state.where[WIFE] !== HALL || h.energy <= 0) return;
    if (!ctx.rng.chance(F.moments.chancePerTick)) return;
    const tables = sh.visits.filter((v) => v.stay > 0 && !v.blocked && v.served > 0 && b.patrons[v.patron]);
    if (tables.length === 0) return;
    const v = ctx.rng.pick(tables);
    const p = b.patrons[v.patron]!;
    const pushy = sh.visits.some((x) => x.patron !== v.patron && x.pressure > 0);
    const fits = F.moments.list.filter((m) => {
      const w = m.when;
      if (sh.momentsSeen?.includes(`${p.id}:${m.id}`)) return false;
      if (w.regular !== undefined && w.regular !== p.regular) return false;
      if (w.newcomer && p.memory.visits > 1) return false;
      if (w.approach && w.approach !== p.approach) return false;
      if (w.minInterest !== undefined && p.memory.interest < w.minInterest) return false;
      if (w.minDrunk !== undefined && (v.drunk ?? 0) < w.minDrunk) return false;
      if (w.minGenerosity !== undefined && p.traits.generosity < w.minGenerosity) return false;
      if (w.maxGenerosity !== undefined && p.traits.generosity > w.maxGenerosity) return false;
      if (w.minAffinity !== undefined && p.memory.affinity < w.minAffinity) return false;
      if (w.waiting && v.waited < 10) return false;
      if (w.noNumber && p.memory.hasNumber) return false;
      if (w.pushyNear && !pushy) return false;
      return true;
    });
    if (fits.length === 0) return;
    const m = ctx.rng.pick(fits);
    sh.momentsSeen = [...(sh.momentsSeen ?? []), `${p.id}:${m.id}`];
    // the same thing lands differently from a man she likes, and on a woman who is up for it
    const well = !!m.good && p.memory.affinity >= (m.likeAffinity ?? F.moments.likeAffinity) && h.traits.openness >= (m.needOpen ?? 0);
    const side = well || !m.bad ? "good" : "bad";
    const tip = apply(ctx, side === "good" ? m.good : m.bad, p, v, m.id);
    if (b.mode === "hidden" && b.secretActsToday > 0) apply(ctx, m.secret, p, v, m.id);
    const seen = husbandSees(ctx.state, HALL) || b.mode === "open";
    ctx.log(`log.moment.${m.id}${m.good && m.bad ? `.${side}` : ""}`, { name: `@name:${p.name}`, tip }, seen ? undefined : ["unseen"]);
    ctx.emit("floor:moment", { id: m.id, patron: p.id, side });
  });
  // how many times he would not take a no tonight: it is written on him
  api.events.on("encounter:pushed", (ctx, e) => {
    const v = bs(ctx.state).shift?.visits.find((x) => x.patron === e.payload!.patron);
    if (v) v.crossed = (v.crossed ?? 0) + 1;
  });

  // === 2. a guest with money goes to the husband first ===========================================
  const priceOf = (p: Patron, actId: string) => {
    const act = actById(actId);
    return Math.max(10, Math.round(((p.traits.generosity * act.tier) / 4) * F.deal.priceFactor * (act.tier >= 7 ? F.deal.hourFactor : 1)));
  };
  gate.deal = (ctx, v, p, input) => {
    const b = bs(ctx.state);
    const D = F.deal;
    const act = actById(input.act);
    if (b.deal || b.ask || act.tier < D.fromTier || v.dealt || !husbandSees(ctx.state, HALL) || b.caught || b.reaction) return false;
    const pays = p.approach === "pay" || ((v.drunk ?? 0) >= D.drunkGenerous[0] && p.traits.generosity >= D.drunkGenerous[1]);
    if (!pays || !ctx.rng.chance(D.chance)) return false;
    v.dealt = true;
    b.deal = { patron: p.id, act: act.id, price: priceOf(p, act.id), tick: b.shift!.tick };
    v.cooldownUntil = b.shift!.tick + D.expires;
    b.shift!.interrupt = true;
    ctx.log(`log.deal.asks${act.tier >= 7 ? ".hour" : ""}`, { name: `@name:${p.name}`, act: `act.${act.id}`, price: b.deal.price });
    ctx.emit("deal:asked", { patron: p.id, act: act.id, price: b.deal.price });
    return true;
  };
  api.events.on("shift:minute", (ctx) => {
    const b = bs(ctx.state);
    if (!b.deal || !b.shift || b.shift.tick - b.deal.tick < F.deal.expires) return;
    const v = b.shift.visits.find((x) => x.patron === b.deal!.patron);
    if (v) v.retry = b.deal.act; // nobody answered: he goes and asks her himself
    b.deal = undefined;
    ctx.log("log.deal.unanswered");
  });
  api.events.on("phase:exit", (ctx, e) => {
    if (e.payload!.phase === "shift") bs(ctx.state).deal = undefined;
  });
  api.actions.register({
    id: DEAL,
    labelKey: "action.deal",
    describe: (a) => ({ key: `action.deal.${a.payload!.say}`, params: { price: (a.payload!.price as number) ?? 0 } }),
    enumerate(state) {
      const d = bs(state).deal;
      if (!d || state.time.phase !== "shift") return [];
      const out: { type: string; payload: Record<string, string | number> }[] = [
        { type: DEAL, payload: { say: "ask_her" } },
        { type: DEAL, payload: { say: "tell_her", price: d.price } },
        ...F.deal.raise.map((k) => ({ type: DEAL, payload: { say: "tell_her", price: Math.round((d.price * k) / 5) * 5 } })),
        { type: DEAL, payload: { say: "not_here" } },
      ];
      return out;
    },
    accepts: (state, a) => !!bs(state).deal && state.time.phase === "shift" && ["ask_her", "tell_her", "not_here"].includes(a.payload?.say as string) && (a.payload?.say !== "tell_her" || (a.payload?.price as number) > 0),
    apply(ctx, action) {
      const b = bs(ctx.state);
      const h = b.heroine;
      const D = F.deal;
      const d = b.deal!;
      b.deal = undefined;
      const p = b.patrons[d.patron]!;
      const v = b.shift!.visits.find((x) => x.patron === d.patron);
      const say = action.payload!.say as string;
      const name = `@name:${p.name}`;
      const res = ctx.engine.evaluate<ConsentInput>(CONSENT_FORMULA, ctx.state, { act: d.act, partner: p.id, loc: HALL, offer: 0, pressure: 0 });
      const wanted = verdictOf(res.total) === "eager";
      b.told.push({ day: ctx.state.time.day, key: `told.deal.${say}`, params: { name, what: `act.${d.act}` } });
      if (b.told.length > 10) b.told.shift();
      if (say === "ask_her") {
        // he steps aside: that is an answer too
        b.expect[d.act] = Math.max(b.expect[d.act] ?? 0, E.ignoreCap);
        if (v) (v.retry = d.act), (v.cooldownUntil = 0);
        ctx.log("log.deal.ask_her", { name });
      } else if (say === "not_here") {
        for (const a of content.acts) if (a.tier >= actById(d.act).tier && !a.only) b.expect[a.id] = Math.min(b.expect[a.id] ?? 0, E.forbid);
        p.memory.affinity = clamp(p.memory.affinity - D.refusedAffinity, -100, 100);
        if (v) (v.retry = null), (v.blocked = actById(d.act).tier >= 5 ? true : v.blocked);
        apply(ctx, wanted ? D.refuseHerLiked : D.refuseHerRelief, p, v ?? null, "deal");
        ctx.log(`log.deal.not_here${wanted ? ".sulk" : ""}`, { name });
      } else {
        const price = action.payload!.price as number;
        // he may not take a raise; then the deal is off
        const raised = price > d.price;
        if (raised && !ctx.rng.chance(clamp(p.traits.generosity * D.acceptPerGenerosity + p.memory.interest * D.acceptPerInterest - (price / d.price - 1) * 0.6, 0.05, 0.95))) {
          if (v) v.retry = null;
          p.memory.affinity = clamp(p.memory.affinity - 2, -100, 100);
          ctx.log("log.deal.too_much", { name, price });
          ctx.emit("deal:done", { patron: p.id, say, ok: false });
          return;
        }
        // "I want you to do this": his word and the money both count in what she answers
        const total = res.total + D.wantBonus + price * content.consent.money;
        const verdict = verdictOf(total);
        b.expect[d.act] = E.approve;
        if (verdict === "refuse" || !startWith(ctx, p.id, d.act, verdict)) {
          h.marriage.trust = clamp(trustOf(ctx.state) + D.soldTrust);
          h.marriage.resent = clamp(h.marriage.resent + D.soldResent);
          feel(ctx, "anger", 8);
          if (v) v.retry = null;
          ctx.log("log.deal.she_refuses", { name, price });
          ctx.emit("deal:done", { patron: p.id, say, ok: false });
          return;
        }
        // the money goes through his hands: into the till, her share by the usual split
        const till = addHerTips(ctx, price);
        b.shift!.tips += till;
        b.today.tips += till;
        p.memory.tipsTotal += price;
        if (b.encounter) b.encounter.paid = true;
        if (verdict === "hesitant") {
          h.marriage.trust = clamp(trustOf(ctx.state) + D.soldTrust / 2);
          feel(ctx, "shame", 5);
        }
        ctx.log(`log.deal.sold.${verdict}`, { name, price, act: `act.${d.act}` });
      }
      ctx.emit("deal:done", { patron: p.id, say, ok: true });
    },
  });

  // === 3. a company in the back room ===============================================================
  const Gr = F.groups;
  api.events.on("shift:start", (ctx) => {
    const b = bs(ctx.state);
    const sh = b.shift!;
    if (ctx.state.time.day < Gr.fromDay || !ctx.rng.chance(Gr.chancePerDay)) return;
    sh.groupAt = ctx.rng.int(Gr.arriveTick[0], Gr.arriveTick[1]);
  });
  /** The company settles up and goes. A company that was never brought anything leaves angry. */
  const leave = (ctx: Ctx) => {
    const b = bs(ctx.state);
    const sh = b.shift!;
    const g = sh.group!;
    sh.group = undefined;
    if (g.rounds === 0) {
      addReputation(ctx, -2 * Gr.restlessReputation);
      ctx.log("log.group.leave.nothing");
      return;
    }
    addMoney(ctx, g.bill, "group");
    sh.income += g.bill;
    b.today.income += g.bill;
    ctx.log("log.group.leave", { bill: g.bill, n: g.size });
  };
  /** The company is sent off at the door, or left standing there until it leaves. */
  const turnAway = (ctx: Ctx, waited: boolean) => {
    const sh = bs(ctx.state).shift!;
    sh.group = undefined;
    addReputation(ctx, -2);
    ctx.log(waited ? "log.group.gone" : "log.group.decline");
  };
  /** A round they asked for and did not get. The first is forgiven. */
  const ignored = (ctx: Ctx, waited: boolean) => {
    const sh = bs(ctx.state).shift!;
    const g = sh.group!;
    g.wants = undefined;
    g.nextTray = sh.tick + Gr.trayEvery;
    g.ignored = (g.ignored ?? 0) + 1;
    g.heat = clamp(g.heat - 5);
    if (g.ignored >= 2) addReputation(ctx, -1);
    ctx.log(g.ignored >= 2 ? "log.group.ignored.again" : waited ? "log.group.ignored.waited" : "log.group.ignored");
  };
  const tierFor = (heat: number) => Gr.tierByHeat.filter(([from]) => heat >= from).at(-1)?.[1] ?? 1;
  api.events.on("shift:minute", (ctx) => {
    const b = bs(ctx.state);
    const sh = b.shift;
    if (!sh) return;
    if (sh.groupAt !== undefined && sh.tick >= sh.groupAt && !sh.group) {
      sh.groupAt = undefined;
      const lead = generatePatron(ctx);
      b.patrons[lead.id] = lead;
      lead.memory.visits = 1;
      lead.memory.lastDay = ctx.state.time.day;
      const sauna = b.upgrades.includes("sauna") && ctx.rng.chance(Gr.saunaChance);
      sh.group = { kind: ctx.rng.pick(Gr.kinds), size: ctx.rng.int(Gr.size[0], Gr.size[1]), lead: lead.id, until: sh.tick + Gr.stay, heat: sauna ? Gr.saunaHeat : 10, nextTray: sh.tick + 5, rounds: 0, bill: 0, pending: sh.tick, ...(sauna ? { sauna: true } : {}) };
      sh.interrupt = true;
      ctx.log(sauna ? "log.group.arrive.sauna" : `log.group.arrive.${sh.group.kind}`, { n: sh.group.size });
      return;
    }
    const g = sh.group;
    if (!g) return;
    if (g.pending !== undefined) {
      // they stand in the doorway waiting for a yes; not for ever
      if (sh.tick - g.pending >= 20) turnAway(ctx, true);
      return;
    }
    // a round nobody brought: they notice, and it costs the house
    if (g.wants !== undefined && sh.tick - g.wants >= 20) ignored(ctx, true);
    // she comes back out
    if (g.herOut !== undefined && sh.tick >= g.herOut) {
      g.herOut = undefined;
      ctx.state.where[WIFE] = HALL;
      ctx.log(`log.group.her_back${g.sauna ? ".sauna" : ""}`);
      sh.interrupt = true;
    }
    if (sh.tick >= g.until && g.herOut === undefined) {
      leave(ctx);
      return;
    }
    if (!g.wants && sh.tick >= g.nextTray && sh.tick < g.until - 10) {
      g.wants = sh.tick;
      sh.interrupt = true;
      ctx.log(`log.group.wants${g.sauna ? ".sauna" : ""}`);
    }
    if (g.wants !== undefined && sh.tick - g.wants === Gr.trayWait) {
      addReputation(ctx, -Gr.restlessReputation);
      g.heat = clamp(g.heat - 5);
      ctx.log(`log.group.restless${g.sauna ? ".sauna" : ""}`);
    }
  });
  /** She is in the back room with a tray and a company that has been drinking. What happens is counted in one go. */
  const herRound = (ctx: Ctx) => {
    const b = bs(ctx.state);
    const sh = b.shift!;
    const g = sh.group!;
    const h = b.heroine;
    const lead = b.patrons[g.lead]!;
    const venue = g.sauna ? SAUNA : LOUNGE;
    g.heat = clamp(g.heat + Gr.heatHer);
    const seen = husbandSees(ctx.state, venue) || b.mode === "open";
    const tags = seen ? undefined : ["unseen"];
    let minutes = ctx.rng.int(Gr.inside[0], Gr.inside[1]);
    const tier = tierFor(g.heat + (g.sauna ? Gr.saunaTier : 0));
    const options = content.acts.filter((a) => a.tier === tier && !a.only && a.id !== "drink");
    const act = options.length > 0 ? ctx.rng.pick(options) : null;
    if (act && tier >= 1) {
      // several men at once push harder than one
      const input: ConsentInput = { act: act.id, partner: lead.id, loc: venue, offer: 0, pressure: (g.size - 1) * Gr.pressurePerMan };
      const res = ctx.engine.evaluate<ConsentInput>(CONSENT_FORMULA, ctx.state, input);
      const verdict = verdictOf(res.total);
      b.proposals.push({ day: ctx.state.time.day, tick: sh.tick, patron: lead.id, act: act.id, loc: venue, verdict, seen, total: res.total, rows: res.rows });
      if (b.proposals.length > 12) b.proposals.shift();
      if (verdict === "refuse") {
        g.heat = clamp(g.heat + Gr.refusedHeat);
        annoy(ctx, 4 + g.size, "guests");
        feel(ctx, "fear", 3 * g.size, 1.3 - h.traits.confidence / 100);
        ctx.log("log.group.in.refused", { act: `act.${act.id}` }, tags);
      } else {
        const many = isIntimate(act) ? Math.max(1, Math.round(g.size * Gr.manyBonus)) : 1;
        if (isIntimate(act)) {
          minutes = ctx.rng.int(Gr.longInside[0], Gr.longInside[1]);
          let came = 0;
          for (let i = 0; i < many; i++) {
            const out = resolveBody(ctx, act, { size: lead.size + ctx.rng.int(-3, 3), minutes: act.minutes });
            if (out.came) came += 1;
            ctx.emit("cum:landed", { by: lead.id, act: act.id });
          }
          lead.memory.sizeKnown = true;
          lead.memory.orgasms += came;
          if (b.mode === "hidden") b.secretActsToday += 1;
          if (came > 0) feel(ctx, "delight", 8 + came * 3);
        }
        lead.memory.tier = Math.max(lead.memory.tier, act.tier);
        lead.memory.acts[act.id] = (lead.memory.acts[act.id] ?? 0) + many;
        changeHeroine(ctx, "arousal", act.effects.arousal * (verdict === "eager" ? 1 : 0.5), act.id);
        changeHeroine(ctx, "energy", act.effects.energy * many, act.id);
        if (verdict === "hesitant") feel(ctx, "shame", 4 + tier);
        const tip = Gr.tipPerTier * tier * g.size;
        const till = addHerTips(ctx, tip);
        sh.tips += till;
        b.today.tips += till;
        h.traits.openness = clamp(h.traits.openness + content.consent.drift.openness * Math.max(0, tier - 1));
        h.traits.fidelity = clamp(h.traits.fidelity - content.consent.drift.fidelity * Math.max(0, tier - 1));
        ctx.log(`log.group.in.${isIntimate(act) ? "far" : "play"}.${verdict}`, { act: `act.${act.id}`, n: many, tip }, tags);
        // the same event a single guest raises, so the diary, the feelings and his reaction all see it
        ctx.emit("encounter:started", { patron: lead.id, act: act.id, loc: venue, verdict, witnessed: seen, came: false, tier: act.tier, intimate: isIntimate(act), switched: false, group: g.size });
        ctx.emit("encounter:ended", { patron: lead.id, act: act.id, loc: venue, minutes, came: 0 });
      }
    }
    // from the hall he only sees how long the door stays shut
    if (!seen && minutes >= Gr.longInside[0]) ctx.log(`log.group.long${g.sauna ? ".sauna" : ""}`);
    g.herOut = sh.tick + minutes;
    sh.awayUntil = g.herOut;
    sh.wifeFreeAt = Math.max(sh.wifeFreeAt ?? 0, g.herOut);
    ctx.state.where[WIFE] = venue;
  };
  api.actions.register({
    id: GROUP,
    labelKey: "action.group",
    describe: (a) => ({ key: `action.group.${a.payload!.do}` }),
    enumerate(state) {
      const b = bs(state);
      const g = b.shift?.group;
      if (state.time.phase !== "shift" || !g || b.caught || b.night?.sex) return [];
      if (g.pending !== undefined) return ["accept", "decline"].map((d) => ({ type: GROUP, payload: { do: d } }));
      if (g.wants === undefined) return [];
      const dos: string[] = ["ignore"];
      if (!b.encounter && g.herOut === undefined && b.heroine.energy > 0) dos.push("send_her");
      if (state.where[HUSBAND] === HALL || state.where[HUSBAND] === "cafe.bar") dos.push("self");
      return dos.map((d) => ({ type: GROUP, payload: { do: d } }));
    },
    apply(ctx, action) {
      const b = bs(ctx.state);
      const sh = b.shift!;
      const g = sh.group!;
      const what = action.payload!.do as string;
      if (what === "accept") {
        // a full back room is talked about, and they pay for every round
        g.pending = undefined;
        g.until = sh.tick + Gr.stay;
        g.nextTray = sh.tick + 5;
        addReputation(ctx, 2);
        ctx.log("log.group.accept", { n: g.size });
        return;
      }
      if (what === "decline") return void turnAway(ctx, false);
      if (what === "ignore") return void ignored(ctx, false);
      const her = what === "send_her";
      g.wants = undefined;
      g.rounds += 1;
      g.nextTray = sh.tick + Gr.trayEvery;
      g.heat = clamp(g.heat + Gr.heatPerRound);
      const round = ctx.rng.int(Gr.bill[0], Gr.bill[1]) * g.size;
      g.bill += round;
      b.stock = Math.max(0, b.stock - Math.ceil(g.size / 2));
      if (her) {
        const till = addHerTips(ctx, Math.round(round * Gr.tipHer));
        sh.tips += till;
        b.today.tips += till;
        ctx.log(`log.group.send_her${g.sauna ? ".sauna" : ""}`);
        herRound(ctx);
      } else {
        addMoney(ctx, Math.round(round * Gr.tipHusband), "tips");
        changeHim(ctx, "energy", -Gr.husbandEnergy, "tray");
        ctx.log(`log.group.self${g.sauna ? ".sauna" : ""}`, { heat: Math.round(g.heat) });
      }
      ctx.emit("group:round", { her, heat: g.heat });
    },
  });
  api.events.on("phase:exit", (ctx, e) => {
    const b = bs(ctx.state);
    const sh = b.shift;
    if (e.payload!.phase !== "shift" || !sh?.group) return;
    leave(ctx);
  }, 60);

  // === 4. sitting down with a guest ===============================================================
  api.actions.register({
    id: TABLE,
    labelKey: "action.table",
    describe: (a) => ({ key: `action.table.${a.payload!.do}`, params: { name: `@name:${a.payload!.name}`, bet: (a.payload!.bet as number) ?? 0 } }),
    enumerate(state) {
      const b = bs(state);
      const sh = b.shift;
      if (state.time.phase !== "shift" || !sh || state.where[HUSBAND] !== HALL || b.caught || b.reaction || b.deal || b.ask || b.night?.sex || (sh.tableSat ?? 0) >= F.table.perEvening) return [];
      const v = sh.visits
        .filter((x) => x.stay > 1 && x.served > 0 && b.patrons[x.patron] && b.encounter?.patron !== x.patron && !(sh.tableWith ?? []).includes(x.patron))
        .sort((x, y) => b.patrons[y.patron]!.memory.interest - b.patrons[x.patron]!.memory.interest || x.patron.localeCompare(y.patron))[0];
      if (!v) return [];
      const name = b.patrons[v.patron]!.name;
      const out: { type: string; payload: Record<string, string | number> }[] = [{ type: TABLE, payload: { do: "sit", patron: v.patron, name } }];
      for (const bet of F.table.cards.bet) if (b.money >= bet) out.push({ type: TABLE, payload: { do: "cards", patron: v.patron, name, bet } });
      return out;
    },
    apply(ctx, action) {
      const b = bs(ctx.state);
      const sh = b.shift!;
      const Tb = F.table;
      const p = b.patrons[action.payload!.patron as string]!;
      const v = sh.visits.find((x) => x.patron === p.id)!;
      const name = `@name:${p.name}`;
      sh.tableSat = (sh.tableSat ?? 0) + 1;
      sh.tableWith = [...(sh.tableWith ?? []), p.id];
      p.memory.interest = clamp(p.memory.interest - Tb.rivalCools);
      if (action.payload!.do === "cards") {
        const bet = action.payload!.bet as number;
        const win = ctx.rng.chance(clamp(Tb.cards.winChance + (v.drunk ?? 0) * Tb.cards.perDrunk, 0.1, 0.8));
        addMoney(ctx, win ? bet : -bet, "cards");
        v.stay += Tb.cards.stayTicks * 10;
        changeHim(ctx, "mood", win ? 3 : -3, "cards");
        ctx.log(`log.table.cards.${win ? "win" : "lose"}`, { name, bet });
      } else {
        // a man who has had her and has had a few says more than he means to
        const had = Object.keys(p.memory.acts).some((a) => actById(a).tier >= 5);
        const slips = had && b.mode === "hidden" && ((v.drunk ?? 0) >= Tb.slipDrunk || p.traits.honesty >= Tb.slipHonesty);
        if (slips) {
          b.suspicion = clamp(b.suspicion + Tb.slipSuspicion * content.secrecy.styleFactor[b.husband.style]);
          ctx.log(`log.table.sit.slip.${ctx.rng.int(1, 2)}`, { name });
        } else ctx.log(`log.table.sit.${p.memory.interest >= 50 ? "wants" : p.regular ? "regular" : "plain"}`, { name });
      }
      ctx.emit("floor:table", { do: action.payload!.do as string, patron: p.id });
      runUnattended(ctx, Tb.minutes);
      if (bs(ctx.state).shift) bs(ctx.state).shift!.show = { type: "table_sit", until: bs(ctx.state).shift!.tick + 2, patron: p.id };
    },
  });

  // === 5. joining her and a guest ==================================================================
  api.actions.register({
    id: JOIN,
    labelKey: "action.join",
    describe: (a) => ({ key: `action.join.${a.payload!.how}` }),
    enumerate(state) {
      const b = bs(state);
      const enc = b.encounter;
      if (state.time.phase !== "shift" || !enc || b.mode !== "open" || b.caught || enc.joined || !isIntimate(actById(enc.act)) || state.where[HUSBAND] !== enc.loc) return [];
      return ["hand", "mouth", "take"].map((how) => ({ type: JOIN, payload: { how } }));
    },
    apply(ctx, action) {
      const b = bs(ctx.state);
      const h = b.heroine;
      const enc = b.encounter!;
      const how = action.payload!.how as string;
      const actId = how === "hand" ? "handjob" : how === "mouth" ? "blowjob" : "sex";
      const res = ctx.engine.evaluate<ConsentInput>(CONSENT_FORMULA, ctx.state, { act: actId, partner: HUSBAND, loc: enc.loc, offer: 0, pressure: 0 });
      const total = res.total + F.join.consentBonus + h.arousal * 0.15;
      enc.joined = how;
      if (verdictOf(total) === "refuse") {
        annoy(ctx, F.join.refused.annoy ?? 0, "him");
        ctx.log("log.join.no");
        ctx.emit("floor:join", { how, ok: false });
        return;
      }
      enc.joinUntil = b.shift!.tick + 4;
      enc.hers = clamp(enc.hers + 10);
      enc.pleasure = clamp(enc.pleasure * F.join.hersRate);
      apply(ctx, F.join.done, null, null, "joined");
      b.power = clamp(b.power + F.join.power);
      // he does not last long like this
      changeHim(ctx, "arousal", -100, "came");
      changeHim(ctx, "mood", 4, "came");
      b.denied = 0;
      ctx.emit("cum:landed", { by: HUSBAND, act: actId, where: how === "mouth" ? "mouth" : how === "hand" ? "on_her" : "inside" });
      ctx.emit("husband:act", { act: actId, came: false, pleasure: enc.pleasure, outcome: "joined", turns: 1 });
      ctx.log(`log.join.${how}`, { name: `@name:${b.patrons[enc.patron]?.name ?? 0}` });
      ctx.emit("floor:join", { how, ok: true });
    },
  });

  api.invariants.add("floor", (s: GameState) => {
    const b = bs(s);
    if (b.deal && !b.patrons[b.deal.patron]) return "a deal with a man who does not exist";
    const g = b.shift?.group;
    if (g && (g.size < 1 || !b.patrons[g.lead])) return "a company with nobody in it";
    return null;
  });
}
