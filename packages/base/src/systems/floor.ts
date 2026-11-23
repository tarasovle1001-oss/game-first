// The floor during the evening: the small things that happen at the tables, a guest with money who goes to
// the husband first, a company that takes the back room, sitting down with a guest, joining her.
import { hasLine } from "./voice";
import { detail, glance } from "./glance";
import { changeConfidence } from "./nerve";
import type { Ctx, GameState, ModApi } from "@tc/core";
import { content } from "../content";
import { bs, clamp, HUSBAND, WIFE } from "../state";
import type { Patron, Visit } from "../state";
import { annoy } from "./annoy";
import { addHerTips, addMoney, addReputation } from "./economy";
import { actById, CONSENT_FORMULA, endEncounter, gate, isIntimate, startWith, verdictOf } from "./encounters";
import type { ConsentInput } from "./encounters";
import { changeHeroine } from "./heroine";
import { EMOTIONS, feel, trustOf } from "./mind";
import type { Emotion } from "./mind";
import { generatePatron } from "./patrons";
import { HALL, husbandSees } from "./places";
import { sizeShown } from "./taking";
import { sizeClass } from "./body";
import { changeHim } from "./rhythm";
import { attendTo, endAttend, leave as leaveVisit, runUnattended, seat } from "./shift";

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

/** The small things at a table have no act behind them: each borrows the picture closest to it. */
const MOMENT_SCENE: Record<string, string> = {
  leans_close: "patron_flirting", brushes_hand: "patron_flirting", whispers_price: "patron_flirting", asks_closing: "patron_flirting", leaves_number: "patron_flirting", small_gift: "patron_flirting",
  hand_on_waist: "patron_touching", invites_drink: "patron_drinking", toasts_her: "patron_drinking", sings_along: "patron_drinking", drunk_loud: "patron_drinking",
  stares: "serving", watches_bend: "serving", complains_slow: "serving", argues_bill: "serving", big_tip: "serving", helps_carry: "serving",
};

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
      if (m.hers && !(p.memory.affinity >= (m.likeAffinity ?? F.moments.likeAffinity) && h.traits.openness >= (m.needOpen ?? 0))) return false; // her own move: only when she is up for it
      if (m.reveals && p.memory.sizeKnown) return false;
      if (m.perEvening !== undefined && (sh.momentsSeen ?? []).filter((x) => x.endsWith(`:${m.id}`)).length >= m.perEvening) return false; // once an evening is an event, three times is a habit
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
    const m = ctx.rng.weighted(fits.map((x) => ({ item: x, weight: x.weight ?? 1 })));
    sh.momentsSeen = [...(sh.momentsSeen ?? []), `${p.id}:${m.id}`];
    // the same thing lands differently from a man she likes, and on a woman who is up for it
    const well = !!m.good && p.memory.affinity >= (m.likeAffinity ?? F.moments.likeAffinity) && h.traits.openness >= (m.needOpen ?? 0);
    const side = well || !m.bad ? "good" : "bad";
    const tip = apply(ctx, side === "good" ? m.good : m.bad, p, v, m.id);
    if (b.mode === "hidden" && b.secretActsToday > 0) apply(ctx, m.secret, p, v, m.id);
    const seen = husbandSees(ctx.state, HALL) || b.mode === "open";
    ctx.log(`log.moment.${m.id}${m.good && m.bad ? `.${side}` : ""}`, { name: `@name:${p.name}`, tip }, seen ? undefined : ["unseen"]);
    // he showed her: from now on his size counts in what she agrees to (the "size" row of consent)
    if (m.reveals) {
      p.memory.sizeKnown = true;
      sizeShown(ctx, p.size);
      detail(ctx, { id: m.shows ?? "guest_flash", who: p.id, secret: !seen, ...(m.shows === "bulge" ? { tags: { size: String(sizeClass(p.size)) } } : {}) });
    }
    if (m.hers) detail(ctx, { id: "touch_bulge", who: p.id, secret: !seen });
    glance(ctx, MOMENT_SCENE[m.id] ?? "patron_chatting", HALL, [{ id: WIFE, role: "wife" }, { id: p.id, role: "patron" }]);
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
    // in his own words where they are written, not the name of the act off the menu
    const own = act.tier < 7 && hasLine(`deal.his.${act.id}`);
    ctx.log(`log.deal.asks${act.tier >= 7 ? ".hour" : own ? ".own" : ""}`, { name: `@name:${p.name}`, act: own ? `deal.his.${act.id}` : `act.${act.id}`, price: b.deal.price });
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
      if (!d || state.time.phase !== "shift" || bs(state).night?.sex) return []; // not while he is in bed with her himself
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
    const venue = g.sauna ? SAUNA : LOUNGE;
    if (b.encounter && b.encounter.loc === venue) endEncounter(ctx);
    if (sh.attend?.loc === venue) endAttend(ctx);
    sh.group = undefined;
    // they get up and go, all of them
    const members = sh.visits.filter((v) => v.group);
    for (const v of members) leaveVisit(ctx, v, "done");
    sh.visits = sh.visits.filter((v) => !v.group);
    if (g.rounds === 0) {
      addReputation(ctx, -2 * Gr.restlessReputation);
      ctx.log(`log.group.leave.nothing${g.sauna ? ".sauna" : ""}`);
      return;
    }
    addMoney(ctx, g.bill, "group");
    sh.income += g.bill;
    b.today.income += g.bill;
    ctx.log(`log.group.leave${g.sauna ? ".sauna" : ""}`, { bill: g.bill, n: g.size });
  };
  /** The company is sent off at the door, or left standing there until it leaves. */
  const turnAway = (ctx: Ctx, waited: boolean) => {
    const b = bs(ctx.state);
    const sh = b.shift!;
    const lead = sh.group?.lead;
    sh.group = undefined;
    if (lead && !sh.visits.some((v) => v.patron === lead)) delete b.patrons[lead];
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
    ctx.log(`${g.ignored >= 2 ? "log.group.ignored.again" : waited ? "log.group.ignored.waited" : "log.group.ignored"}${g.sauna ? ".sauna" : ""}`);
  };
  /** How worked up the company is shows in every one of them. */
  const warmMembers = (ctx: Ctx) => {
    const sh = bs(ctx.state).shift!;
    const g = sh.group!;
    for (const v of sh.visits) if (v.group) v.heat = Math.max(v.heat ?? 0, g.heat);
  };
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
    const venue = g.sauna ? SAUNA : LOUNGE;
    // a round nobody brought: they notice, and it costs the house
    if (g.wants !== undefined && sh.tick - g.wants >= 20) ignored(ctx, true);
    const inside = sh.attend?.loc === venue;
    if (sh.tick >= g.until && !inside && b.encounter?.loc !== venue) {
      leave(ctx);
      return;
    }
    if (!g.wants && !inside && sh.tick >= g.nextTray && sh.tick < g.until - 10) {
      g.wants = sh.tick;
      sh.interrupt = true;
      ctx.log(`log.group.wants${g.sauna ? ".sauna" : ""}`);
    }
    if (g.wants !== undefined && sh.tick - g.wants === Gr.trayWait) {
      addReputation(ctx, -Gr.restlessReputation);
      g.heat = clamp(g.heat - 5);
      warmMembers(ctx);
      ctx.log(`log.group.restless${g.sauna ? ".sauna" : ""}`);
    }
  });
  // She comes back out of the back room: what he can see of it from the hall is how long the door stayed shut.
  api.events.on("attend:ended", (ctx, e) => {
    const b = bs(ctx.state);
    const g = b.shift?.group;
    if (!g || e.payload!.why !== "tray") return;
    const venue = g.sauna ? SAUNA : LOUNGE;
    if (e.payload!.loc !== venue) return;
    ctx.log(`log.group.her_back${g.sauna ? ".sauna" : ""}`);
  });
  api.actions.register({
    id: GROUP,
    labelKey: "action.group",
    describe: (a) => ({ key: `action.group.${a.payload!.do}${a.payload!.sauna ? ".sauna" : ""}` }),
    enumerate(state) {
      const b = bs(state);
      const sh = b.shift;
      const g = sh?.group;
      if (state.time.phase !== "shift" || !sh || !g || b.caught || b.night?.sex) return [];
      const pay = (d: string) => ({ type: GROUP, payload: (g.sauna ? { do: d, sauna: 1 } : { do: d }) as Record<string, string | number> });
      if (g.pending !== undefined) return ["accept", "decline"].map(pay);
      const venue = g.sauna ? SAUNA : LOUNGE;
      // he has walked in while she is in there with them: he can take her out with him
      if (sh.attend?.loc === venue && state.where[HUSBAND] === venue) return [pay("pull_out")];
      if (g.wants === undefined) return [];
      const dos: string[] = ["ignore"];
      if (!b.encounter && !sh.attend && b.heroine.energy > 0) dos.push("send_her");
      if (state.where[HUSBAND] === HALL || state.where[HUSBAND] === "cafe.bar") dos.push("self");
      return dos.map(pay);
    },
    apply(ctx, action) {
      const b = bs(ctx.state);
      const sh = b.shift!;
      const g = sh.group!;
      const venue = g.sauna ? SAUNA : LOUNGE;
      const what = action.payload!.do as string;
      if (what === "accept") {
        // a full back room is talked about, and they pay for every round. They sit down in there, all of them
        g.pending = undefined;
        g.until = sh.tick + Gr.stay;
        g.nextTray = sh.tick + 5;
        addReputation(ctx, 2);
        const lead = b.patrons[g.lead]!;
        seat(ctx, lead, false, { at: venue, stay: Gr.stay + 30, group: true, quiet: true });
        for (let i = 1; i < g.size; i++) {
          const m = generatePatron(ctx);
          b.patrons[m.id] = m;
          m.memory.visits = 1;
          m.memory.lastDay = ctx.state.time.day;
          seat(ctx, m, false, { at: venue, stay: Gr.stay + 30, group: true, quiet: true });
        }
        warmMembers(ctx);
        ctx.log(g.sauna ? "log.group.accept.sauna" : "log.group.accept", { n: g.size });
        return;
      }
      if (what === "decline") return void turnAway(ctx, false);
      if (what === "pull_out") {
        g.heat = clamp(g.heat - Gr.beats.pullOutHeat);
        warmMembers(ctx);
        if (b.encounter?.loc === venue) endEncounter(ctx);
        endAttend(ctx);
        ctx.state.where[WIFE] = ctx.state.where[HUSBAND]!;
        ctx.log("log.group.pull_out");
        ctx.emit("group:pulled_out", { heat: g.heat });
        return;
      }
      if (what === "ignore") return void ignored(ctx, false);
      const her = what === "send_her";
      g.wants = undefined;
      g.rounds += 1;
      g.nextTray = sh.tick + Gr.trayEvery;
      g.heat = clamp(g.heat + Gr.heatPerRound + (her ? Gr.heatHer : 0));
      warmMembers(ctx);
      const round = ctx.rng.int(Gr.bill[0], Gr.bill[1]) * g.size;
      g.bill += round;
      b.stock = Math.max(0, b.stock - Math.ceil(g.size / 2));
      for (const v of sh.visits) if (v.group) v.served += 1;
      if (her) {
        const till = addHerTips(ctx, Math.round(round * Gr.tipHer));
        sh.tips += till;
        b.today.tips += till;
        ctx.log(`log.group.send_her${g.sauna ? ".sauna" : ""}`);
        // she goes in with the tray and stays a while: from here it is the same evening as at any table,
        // only with a whole company at it (see consent.company)
        attendTo(ctx, venue, ctx.rng.int(Gr.inside[0], Gr.inside[1]), "tray", g.lead);
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
      const asked = action.payload!.how as string;
      // a wife who has him under her thumb does not stop for him: he gets a hand, and she does not look round
      const lazy = b.power >= F.join.lazyPower;
      const how = lazy && asked !== "hand" && ctx.rng.chance(F.join.downgrade) ? "hand" : asked;
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
      const name = `@name:${b.patrons[enc.patron]?.name ?? 0}`;
      if (how === "hand" && lazy) {
        if (how !== asked) ctx.log("log.join.downgrade", { name });
        // the second roll: she lets go at the last moment
        if (ctx.rng.chance(Math.min(F.join.ruinMax, F.join.ruinBase + b.power * F.join.ruinPerPower))) {
          changeHim(ctx, "arousal", -content.body.his.ruinedRelief, "ruined");
          changeHim(ctx, "mood", F.join.ruined.mood, "ruined");
          changeConfidence(ctx, F.join.ruined.confidence, "ruined");
          b.power = clamp(b.power + F.join.ruined.power);
          b.denied = 0;
          detail(ctx, { id: "join_ruined", who: HUSBAND });
          ctx.emit("husband:act", { act: actId, came: false, pleasure: enc.pleasure, outcome: "ruined", turns: 1 });
          ctx.log("log.join.hand.ruined", { name });
          ctx.emit("floor:join", { how, ok: true, ruined: true });
          return;
        }
        detail(ctx, { id: "join_hand_lazy", who: HUSBAND });
      }
      // he does not last long like this
      changeHim(ctx, "arousal", -100, "came");
      changeHim(ctx, "mood", 4, "came");
      b.denied = 0;
      ctx.emit("cum:landed", { by: HUSBAND, act: actId, where: how === "mouth" ? "mouth" : how === "hand" ? "on_her" : "inside" });
      ctx.emit("husband:act", { act: actId, came: false, pleasure: enc.pleasure, outcome: "joined", turns: 1 });
      ctx.log(`log.join.${how}${how === "hand" && lazy ? ".lazy" : ""}`, { name });
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
