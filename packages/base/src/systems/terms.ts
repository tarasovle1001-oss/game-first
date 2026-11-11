// What is agreed between the two of them. What he says he wants from her today; what he allows and forbids,
// one thing at a time; what she asks him before she does it; where he stands on a particular man; dares;
// talking over what happened; promises that are kept or not; pushing after a "no".
import type { Ctx, GameState, ModApi } from "@tc/core";
import { content } from "../content";
import { bs, clamp, HUSBAND, WIFE } from "../state";
import type { Bare } from "../state";
import { annoy } from "./annoy";
import { together } from "./couple";
import { bareMargin, eyesOn } from "./dress";
import { actById, CONSENT_FORMULA, gate, startWith, verdictOf } from "./encounters";
import type { ConsentInput } from "./encounters";
import { expectOf } from "./expectations";
import { changeHeroine } from "./heroine";
import { feel, trustOf } from "./mind";
import type { Emotion } from "./mind";
import { EMOTIONS } from "./mind";
import { HALL, husbandSees } from "./places";
import { TIP_FORMULA } from "./shift";
import type { TipInput } from "./shift";

export const WISH = "base/wish";
export const ALLOW = "base/allow";
export const PERMIT = "base/permit";
export const STANCE = "base/stance";
export const DARE = "base/dare";
export const ABOUT = "base/about";
export const PROMISE = "base/promise";
export const PRESS = "base/press";
const T = content.terms;
const E = content.consent.expect;
type Fx = Record<string, number>;

/** Apply a bag of numbers: her fast stats, the marriage, trust, feelings, annoyance at him. */
function fx(ctx: Ctx, bag: Fx, reason: string, scale = 1) {
  const h = bs(ctx.state).heroine;
  for (const [k, raw] of Object.entries(bag)) {
    const v = raw * scale;
    if (k === "resent" || k === "desire") h.marriage[k] = clamp(h.marriage[k] + v);
    else if (k === "trust") h.marriage.trust = clamp(trustOf(ctx.state) + v);
    else if (k === "annoy") annoy(ctx, v, "him");
    else if ((EMOTIONS as readonly string[]).includes(k)) feel(ctx, k as Emotion, v);
    else if (k === "mood" || k === "arousal" || k === "energy" || k === "drunk") changeHeroine(ctx, k, v, reason);
  }
}
export const wished = (state: GameState, id: string) => bs(state).wishes?.includes(id) ?? false;
const honestyShare = (state: GameState) => bs(state).heroine.traits.honesty / 100;
const stamp = (state: GameState) => `${state.time.day}:${state.time.phase}`;
const said = (ctx: Ctx, key: string, params?: Record<string, string | number>) => {
  const b = bs(ctx.state);
  b.told.push({ day: ctx.state.time.day, key, ...(params ? { params } : {}) });
  if (b.told.length > 10) b.told.shift();
};
/** The men he has something to say about: the ones he saw with her today. */
const seenToday = (state: GameState): string[] => {
  const b = bs(state);
  const page = b.diary?.find((d) => d.day === state.time.day);
  return page ? Object.keys(page.with).filter((id) => id !== HUSBAND && b.patrons[id] && (page.seen[id] || b.mode === "open") && Object.keys(page.with[id]!).some((a) => actById(a).tier >= 2)) : [];
};
const promise = (ctx: Ctx, kind: string, topic?: string) => {
  const b = bs(ctx.state);
  b.promises = (b.promises ?? []).filter((p) => p.kind !== kind);
  b.promises.push({ kind, day: ctx.state.time.day, due: ctx.state.time.day + T.promises[kind]!.days, ...(topic ? { topic } : {}) });
};
const settle = (ctx: Ctx, kind: string, kept: boolean) => {
  const b = bs(ctx.state);
  const p = b.promises?.find((x) => x.kind === kind);
  if (!p) return;
  b.promises = b.promises!.filter((x) => x !== p);
  const P = T.promises[kind]!;
  b.heroine.marriage.trust = clamp(trustOf(ctx.state) + (kept ? P.kept : P.broken));
  if (!kept) feel(ctx, "contempt", P.contempt);
  ctx.log(`log.promise.${kept ? "kept" : "broken"}.${kind}`);
  ctx.emit("promise:settled", { kind, kept });
};

/** Where a guest may finish, as far as she keeps to what her husband said. */
export function cumPlaces(ctx: Ctx, options: string[]): string[] {
  const b = bs(ctx.state);
  const banned = T.items.filter((it) => it.where && b.perm?.[it.id] === "forbid").flatMap((it) => it.where!);
  if (banned.length === 0) return options;
  const keeps = b.mode === "open" || ctx.rng.chance(T.cumObeys + honestyShare(ctx.state) * (1 - T.cumObeys));
  if (!keeps) return options;
  const left = options.filter((o) => !banned.includes(o));
  if (left.length > 0) return left;
  const other = ["body", "hands", "thighs"].filter((o) => !banned.includes(o));
  return other.length > 0 ? [other[0]!] : options;
}

export function registerTerms(api: ModApi) {
  // --- 1. what he wants from her today -----------------------------------------------------------
  api.events.on("phase:enter", (ctx, e) => {
    if (e.payload!.phase === "prep") bs(ctx.state).wishes = [];
  });
  api.actions.register({
    id: WISH,
    labelKey: "action.wish",
    describe: (a) => ({ key: `action.wish.${a.payload!.id}` }),
    enumerate(state) {
      const b = bs(state);
      if (!together(state) || b.night?.herAsleep || b.complaint) return [];
      return Object.keys(T.wishes)
        .filter((id) => !wished(state, id))
        .map((id) => ({ type: WISH, payload: { id } }));
    },
    apply(ctx, action) {
      const b = bs(ctx.state);
      const h = b.heroine;
      const id = action.payload!.id as string;
      const w = T.wishes[id]!;
      // the opposite said earlier today no longer stands
      const undo = [...(T.against[id] ?? []), ...Object.entries(T.against).filter(([, list]) => list.includes(id)).map(([k]) => k)];
      b.wishes = [...(b.wishes ?? []).filter((x) => !undo.includes(x)), id];
      b.directive = wished(ctx.state, "tone_down") ? "reserved" : wished(ctx.state, "friendlier") ? "friendly" : "natural";
      said(ctx, `told.wish.${id}`);
      // said day after day it stops being a wish and becomes nagging
      const run = (b.wishRun = b.wishRun ?? {});
      const r = run[id];
      run[id] = { n: r && ctx.state.time.day - r.day <= 1 ? (r.day === ctx.state.time.day ? r.n : r.n + 1) : 1, day: ctx.state.time.day };
      const stale = run[id]!.n > T.staleAfter;
      if (stale) {
        annoy(ctx, T.staleAnnoy, "him");
        ctx.log("log.wish.stale");
      }
      const over = w.needs - h.traits.openness;
      if (over > 15) {
        fx(ctx, T.wishShock, "told");
        ctx.log(`log.wish.${id}.shock`);
      } else {
        if (w.needs > 0 && !stale) fx(ctx, T.wishGlad, "told");
        ctx.log(`log.wish.${id}`);
        if (w.expectAll) for (const a of content.acts) if (!a.only) b.expect[a.id] = Math.max(b.expect[a.id] ?? 0, w.expectAll);
        if (w.expect) for (const a of content.acts) if (!a.only && a.tier <= (w.upTo ?? 99)) b.expect[a.id] = Math.max(b.expect[a.id] ?? 0, w.expect);
        if (id === "cover_up") {
          if (h.bare && h.bare !== "none") {
            if (b.bareOwn) fx(ctx, { resent: content.manners.talk.bare.backResent }, "told");
            h.bare = "none";
            b.bareOwn = false;
          }
          b.orders = [];
        }
      }
      ctx.emit("couple:wish", { id, shock: over > 15 });
    },
  });
  api.formulas.addFactor<ConsentInput>(CONSENT_FORMULA, {
    id: "consent.wish",
    labelKey: "factor.consent.wish",
    order: 21,
    eval: (state, { act, partner, loc, offer }) => {
      if (partner === HUSBAND) return null;
      const tier = actById(act).tier;
      let total = 0;
      for (const id of bs(state).wishes ?? []) {
        const w = T.wishes[id]!;
        // "friendlier" and "tone it down" already count through the old directive row
        if (id === "friendlier" || id === "tone_down") continue;
        if (w.consent && tier <= (w.upTo ?? 99) && (!w.seen || husbandSees(state, loc))) total += w.consent;
        if (w.offer && offer > 0) total += offer * w.offer * content.consent.money;
      }
      return total ? Math.round(total * 10) / 10 : null;
    },
  });
  api.formulas.addFactor<TipInput>(TIP_FORMULA, {
    id: "tip.wish",
    labelKey: "factor.tip.wish",
    order: 35,
    eval: (state, { bill }) => {
      const share = (bs(state).wishes ?? []).filter((id) => id !== "friendlier" && id !== "tone_down").reduce((s, id) => s + (T.wishes[id]!.tip ?? 0), 0);
      return share ? Math.round(bill * share * 10) / 40 : null;
    },
  });

  // --- 2. allowed and forbidden, one thing at a time ---------------------------------------------
  api.actions.register({
    id: ALLOW,
    labelKey: "action.allow",
    describe: (a) => ({ key: `action.allow.${a.payload!.say}`, params: { what: `item.${a.payload!.item}` } }),
    enumerate(state) {
      const b = bs(state);
      if (!together(state) || state.time.phase === "shift" || b.night?.herAsleep) return [];
      return T.items.flatMap((it) => (["allow", "forbid"] as const).filter((say) => b.perm?.[it.id] !== say).map((say) => ({ type: ALLOW, payload: { item: it.id, say } })));
    },
    apply(ctx, action) {
      const b = bs(ctx.state);
      const h = b.heroine;
      const it = T.items.find((x) => x.id === action.payload!.item)!;
      const say = action.payload!.say as "allow" | "forbid";
      b.perm = { ...(b.perm ?? {}), [it.id]: say };
      const acts = (it.acts ?? []).map(actById);
      for (const a of acts) b.expect[a.id] = say === "allow" ? E.approve : E.forbid;
      said(ctx, `told.say.${say}`, { what: `item.${it.id}` });
      const top = Math.max(0, ...acts.map((a) => a.tier));
      if (say === "allow" && top >= content.manners.talk.shockFromTier && h.traits.fidelity >= content.manners.talk.shockAtFidelity) {
        fx(ctx, { mood: -3, resent: 2 }, "told");
        ctx.log("log.tell.allow.shock", { what: `item.${it.id}` });
      } else if (say === "forbid" && acts.some((a) => (h.skills[a.id] ?? 0) > 0)) {
        const grudge = (100 - h.traits.fidelity) / 20;
        h.marriage.resent = clamp(h.marriage.resent + grudge);
        ctx.log(`log.tell.forbid${grudge >= 2 ? ".grudge" : ""}`, { what: `item.${it.id}` });
      } else ctx.log(`log.tell.${say}`, { what: `item.${it.id}` });
      ctx.emit("couple:allow", { item: it.id, say });
    },
  });
  // --- 3. she asks him first -----------------------------------------------------------------------
  gate.ask = (ctx, v, p, input) => {
    const b = bs(ctx.state);
    const h = b.heroine;
    const act = actById(input.act);
    const A = T.ask;
    if (b.ask || act.tier < A.fromTier || (b.asksToday ?? 0) >= A.perDay) return false;
    if (Math.abs(expectOf(ctx.state, act.id)) >= A.maxSure || b.patrons[p.id]?.memory.stance === "free") return false;
    // in the open she always asks; while she hides things only for the milder ones, and only if she trusts him
    if (b.mode === "hidden" && (act.tier > A.upToTierHidden || h.traits.honesty < A.honesty || trustOf(ctx.state) < A.trust)) return false;
    // he has to be somewhere she can walk to
    if (ctx.state.where[HUSBAND]?.startsWith("town.")) return false;
    b.ask = { patron: p.id, act: act.id, tick: b.shift?.tick ?? 0 };
    b.asksToday = (b.asksToday ?? 0) + 1;
    v.retry = act.id;
    v.cooldownUntil = (b.shift?.tick ?? 0) + 10;
    if (b.shift) b.shift.interrupt = true;
    ctx.log("log.ask.her", { name: `@name:${p.name}`, act: `act.${act.id}` });
    ctx.emit("her:asked", { patron: p.id, act: act.id });
    return true;
  };
  api.events.on("phase:enter", (ctx, e) => {
    const b = bs(ctx.state);
    if (e.payload!.phase === "prep") b.asksToday = 0;
    if (e.payload!.phase !== "shift") {
      b.ask = undefined;
      b.askWhy = undefined;
    }
  });
  // he said nothing: after a while she takes that for "not now"
  api.events.on("shift:tick", (ctx) => {
    const b = bs(ctx.state);
    if (!b.ask || (b.shift?.tick ?? 0) - (b.ask.tick ?? 0) < 20) return;
    const v = b.shift?.visits.find((x) => x.patron === b.ask!.patron);
    if (v) v.retry = null;
    b.ask = undefined;
    fx(ctx, { trust: -1, resent: 0.5 }, "asked");
    ctx.log("log.ask.unanswered");
  });
  api.actions.register({
    id: PERMIT,
    labelKey: "action.permit",
    describe: (a) => (a.payload!.name !== undefined ? { key: `action.permit.${a.payload!.say}`, params: { name: `@name:${a.payload!.name}`, act: `act.${a.payload!.act}` } } : { key: `action.permit.${a.payload!.say}` }),
    enumerate(state) {
      const b = bs(state);
      if (b.askWhy) return ["explain", "because", "relent"].map((say) => ({ type: PERMIT, payload: { say } }));
      if (!b.ask) return [];
      const name = b.patrons[b.ask.patron]?.name ?? 0;
      return ["yes", "later", "no"].map((say) => ({ type: PERMIT, payload: { say, name, act: b.ask!.act } }));
    },
    accepts: (state, a) => (bs(state).askWhy ? ["explain", "because", "relent"] : bs(state).ask ? ["yes", "later", "no"] : []).includes(a.payload?.say as string),
    apply(ctx, action) {
      const b = bs(ctx.state);
      const A = T.ask;
      const say = action.payload!.say as "yes" | "later" | "no" | "explain" | "because" | "relent";
      if (b.askWhy) {
        const { act } = b.askWhy;
        b.askWhy = undefined;
        fx(ctx, A[say as "explain"], "asked");
        if (say === "relent") b.expect[act] = E.approve;
        ctx.log(`log.ask.${say}`);
        ctx.emit("couple:permit", { say, act });
        return;
      }
      const { patron, act } = b.ask!;
      b.ask = undefined;
      const v = b.shift?.visits.find((x) => x.patron === patron);
      const want = verdictOf(ctx.engine.evaluate<ConsentInput>(CONSENT_FORMULA, ctx.state, { act, partner: patron, loc: HALL, offer: 0, pressure: 0 }).total);
      said(ctx, `told.permit.${say}`, { what: `act.${act}` });
      if (say === "yes") {
        b.expect[act] = E.approve;
        fx(ctx, A.yes, "asked");
        if (v) v.cooldownUntil = 0;
        ctx.log("log.ask.yes");
      } else if (say === "later") {
        if (want === "eager") fx(ctx, A.later, "asked");
        if (v) v.retry = null;
        ctx.log("log.ask.later");
      } else {
        b.expect[act] = E.forbid;
        if (v) v.retry = null;
        if (want === "eager") {
          // she wanted it, and she wants to know why not
          fx(ctx, A.no, "asked");
          b.askWhy = { patron, act };
          ctx.log("log.ask.no.why");
        } else {
          fx(ctx, { tenderness: 3, trust: 1 }, "asked");
          ctx.log("log.ask.no.relief");
        }
      }
      ctx.emit("couple:permit", { say, act, patron });
    },
  });

  // --- 4. where he stands on one man --------------------------------------------------------------
  api.actions.register({
    id: STANCE,
    labelKey: "action.stance",
    describe: (a) => ({ key: `action.stance.${a.payload!.say}`, params: { name: `@name:${a.payload!.name}` } }),
    enumerate(state) {
      const b = bs(state);
      if (!together(state) || b.night?.herAsleep || b.complaint) return [];
      return seenToday(state)
        .filter((id) => !(b.stanceSaid ?? []).includes(`${state.time.day}:${id}`))
        .slice(0, 2)
        .flatMap((id) => ["praise", "free", "polite", "away", "own"].map((say) => ({ type: STANCE, payload: { say, patron: id, name: b.patrons[id]!.name } })));
    },
    apply(ctx, action) {
      const b = bs(ctx.state);
      const say = action.payload!.say as string;
      const p = b.patrons[action.payload!.patron as string]!;
      const S = T.stance;
      b.stanceSaid = [...(b.stanceSaid ?? []).filter((x) => x.startsWith(`${ctx.state.time.day}:`)), `${ctx.state.time.day}:${p.id}`];
      const name = `@name:${p.name}`;
      said(ctx, `told.stance.${say}`, { name });
      if (say === "praise") fx(ctx, S.praise, "husband");
      else if (say === "own") {
        fx(ctx, S.own, "husband");
        delete p.memory.stance;
      } else {
        p.memory.stance = say as "free" | "polite" | "away";
        if (say !== "free" && p.memory.affinity >= S.likedFrom) fx(ctx, { resent: S.likedResent * (say === "away" ? 1.5 : 1), anger: 4 }, "husband");
        if (say === "free") changeHeroine(ctx, "arousal", 3, "told");
      }
      ctx.log(`log.stance.${say}`, { name });
      ctx.emit("couple:stance", { patron: p.id, say });
    },
  });
  api.formulas.addFactor<ConsentInput>(CONSENT_FORMULA, {
    id: "consent.stance",
    labelKey: "factor.consent.stance",
    order: 22,
    eval: (state, { partner, act }) => {
      const b = bs(state);
      const st = partner === HUSBAND ? undefined : b.patrons[partner]?.memory.stance;
      if (!st) return null;
      const S = T.stance[st];
      if (st === "free") return S.consent!;
      if (actById(act).tier < S.fromTier!) return null;
      // behind his back a "no" binds her only as far as she is honest
      const binds = b.mode === "open" ? 1 : T.stance.hidden + honestyShare(state) * (1 - T.stance.hidden);
      return Math.round(S.consent! * binds * 10) / 10;
    },
  });

  // --- 5. dares -------------------------------------------------------------------------------------
  const dareTargets = (state: GameState): { id: string; name: number }[] => {
    const b = bs(state);
    return (b.shift?.visits ?? [])
      .filter((v) => v.stay > 0 && !v.blocked && b.patrons[v.patron])
      .sort((a, c) => b.patrons[c.patron]!.memory.interest - b.patrons[a.patron]!.memory.interest || a.patron.localeCompare(c.patron))
      .slice(0, 2)
      .map((v) => ({ id: v.patron, name: b.patrons[v.patron]!.name }));
  };
  api.actions.register({
    id: DARE,
    labelKey: "action.dare",
    describe: (a) => ({ key: `action.dare.${a.payload!.id}`, params: { who: a.payload!.patron === "pick" ? "dare.pick" : `@name:${a.payload!.name}`, why: `dare.why.${a.payload!.why}` } }),
    enumerate(state) {
      const b = bs(state);
      if (state.time.phase !== "shift" || !together(state) || b.ask || b.askWhy || b.reaction || (b.daresToday ?? 0) >= T.dares.perEvening) return [];
      const targets = dareTargets(state);
      if (targets.length === 0) return [];
      const out: { type: string; payload: Record<string, string | number> }[] = [];
      for (const d of T.dares.list) {
        if ((b.dared ?? []).includes(d.id)) continue;
        if (d.bare) out.push({ type: DARE, payload: { id: d.id, patron: "all", name: 0, why: "just" } });
        else
          for (const who of [...targets.slice(0, 1), { id: "pick", name: 0 }])
            for (const why of ["just", "coin"]) out.push({ type: DARE, payload: { id: d.id, patron: who.id, name: who.name, why } });
      }
      return out;
    },
    accepts: (state, a) => state.time.phase === "shift" && together(state) && T.dares.list.some((d) => d.id === a.payload?.id) && a.payload?.why !== undefined && (a.payload.why as string) in T.dares.reasons,
    apply(ctx, action) {
      const b = bs(ctx.state);
      const h = b.heroine;
      const D = T.dares;
      const d = D.list.find((x) => x.id === action.payload!.id)!;
      const why = action.payload!.why as string;
      b.dared = [...(b.dared ?? []), d.id];
      b.daresToday = (b.daresToday ?? 0) + 1;
      said(ctx, "told.dare", { what: `dare.${d.id}` });
      const bonus = D.fromHim + (D.reasons[why] ?? 0) + (why === "curious" ? Math.max(0, h.traits.openness - 50) * D.curiousPerOpenness : 0) + (why === "hostess" && wished(ctx.state, "friendlier") ? 4 : 0);
      const no = () => {
        fx(ctx, D.refused, "dare");
        ctx.log(`log.dare.no.${ctx.rng.int(1, 2)}`, { what: `dare.${d.id}` });
        ctx.emit("couple:dare", { id: d.id, ok: false });
      };
      if (d.bare) {
        // a look, not a way of working: easier than staying like that
        const where = eyesOn(ctx.state, HALL);
        if (bareMargin(ctx.state, d.bare as Exclude<Bare, "none">, where) + (d.margin ?? 0) + bonus < 0) return no();
        for (const v of b.shift!.visits) {
          const p = b.patrons[v.patron];
          if (!p) continue;
          v.heat = clamp((v.heat ?? 0) + D.flashHeat);
          v.sawBare = d.bare as Bare;
          p.memory.interest = clamp(p.memory.interest + content.manners.talk.bare.allure[d.bare]!);
        }
        b.gossip = clamp(b.gossip + content.manners.talk.bare.gossip[d.bare]!);
        if (d.id === "walk_naked") h.bare = "all";
        h.traits.openness = clamp(h.traits.openness + content.manners.talk.bare.openness.hall);
        fx(ctx, D.done, "dare", h.latents.exhibitionist ? 1 : 0.6);
        if (h.latents.exhibitionist) feel(ctx, "shame", -D.done.shame!);
        ctx.log(`log.dare.${d.id}`);
        ctx.emit("couple:dare", { id: d.id, ok: true });
        return;
      }
      // with a man: the one he named, or the one she would pick herself
      const targets = dareTargets(ctx.state);
      const pick = action.payload!.patron === "pick";
      const target = pick ? targets.slice().sort((a, c) => b.patrons[c.id]!.memory.affinity - b.patrons[a.id]!.memory.affinity)[0] : targets.find((x) => x.id === action.payload!.patron);
      if (!target || b.encounter) return no();
      const res = ctx.engine.evaluate<ConsentInput>(CONSENT_FORMULA, ctx.state, { act: d.act!, partner: target.id, loc: HALL, offer: 0, pressure: 0 });
      const total = res.total + bonus + (pick ? D.herPick : 0);
      const verdict = verdictOf(total);
      if (verdict === "refuse") return no();
      // his own word for it: this much he plainly allows
      b.expect[d.act!] = Math.max(b.expect[d.act!] ?? 0, E.approve);
      if (!startWith(ctx, target.id, d.act!, verdict)) return no();
      fx(ctx, { pride: D.done.pride!, arousal: D.done.arousal! }, "dare");
      ctx.log("log.dare.done", { name: `@name:${target.name}`, what: `dare.${d.id}` });
      ctx.emit("couple:dare", { id: d.id, ok: true, patron: target.id });
    },
  });
  api.events.on("phase:enter", (ctx, e) => {
    if (e.payload!.phase !== "shift") return;
    bs(ctx.state).dared = [];
    bs(ctx.state).daresToday = 0;
  });

  // --- 6. talking over what happened ----------------------------------------------------------------
  /** The furthest thing with a guest today that he knows of, and what there is that he does not. */
  const todays = (state: GameState) => {
    const b = bs(state);
    const page = b.diary?.find((d) => d.day === state.time.day);
    const known: string[] = [];
    const hiddenFrom: string[] = [];
    for (const [id, acts] of Object.entries(page?.with ?? {})) {
      if (id === HUSBAND) continue;
      const list = Object.keys(acts).filter((a) => actById(a).tier >= 2);
      if (list.length === 0) continue;
      if (page!.seen[id] || b.mode === "open") known.push(...list);
      else hiddenFrom.push(id);
    }
    return { page, known: [...new Set(known)], hiddenFrom };
  };
  api.actions.register({
    id: ABOUT,
    labelKey: "action.about",
    describe: (a) => ({ key: `action.about.${a.payload!.say}` }),
    enumerate(state) {
      const b = bs(state);
      if (!together(state) || state.time.phase === "shift" || b.night?.herAsleep || b.complaint || b.aboutSaid === state.time.day) return [];
      const { known } = todays(state);
      const says = known.length > 0 ? ["liked", "disliked", "never", "protect", "tell_all"] : ["tell_all"];
      return says.map((say) => ({ type: ABOUT, payload: { say } }));
    },
    apply(ctx, action) {
      const b = bs(ctx.state);
      const h = b.heroine;
      const A = T.about;
      const say = action.payload!.say as string;
      b.aboutSaid = ctx.state.time.day;
      const { page, known, hiddenFrom } = todays(ctx.state);
      const liked = known.some((a) => (h.tastes.acts[a] ?? 0) > 0) || h.traits.fidelity < 50;
      said(ctx, `told.about.${say}`);
      if (say === "liked") {
        for (const a of known) b.expect[a] = clamp(Math.max(b.expect[a] ?? 0, 0) + A.liked.expect, -100, 100);
        const shock = h.traits.fidelity >= A.liked.shockFidelity && known.some((a) => actById(a).tier >= 3);
        if (shock) fx(ctx, A.liked.shock, "told");
        else changeHeroine(ctx, "arousal", A.liked.arousal, "told");
        ctx.log(`log.about.liked${shock ? ".shock" : ""}`);
      } else if (say === "disliked") {
        for (const a of known) b.expect[a] = clamp(Math.min(b.expect[a] ?? 0, 0) + A.disliked.expect!, -100, 100);
        feel(ctx, "guilt", A.disliked.guilt!);
        if (liked) fx(ctx, { resent: A.disliked.resentIfLiked! }, "told");
        ctx.log(`log.about.disliked${liked ? ".sulk" : ""}`);
      } else if (say === "never") {
        for (const a of known) b.expect[a] = E.forbid;
        if (liked) fx(ctx, { resent: A.never.resentIfLiked!, anger: 5 }, "told");
        ctx.log(`log.about.never${liked ? ".sulk" : ""}`);
      } else if (say === "protect") {
        fx(ctx, A.protect, "told");
        promise(ctx, "protect");
        ctx.log("log.about.protect");
      } else {
        // "tell me everything": she does, or she does not, by how honest she is and how far she trusts him
        const clears = h.traits.honesty + (trustOf(ctx.state) - 50) * A.tell.trust! >= A.tell.honesty! + (hiddenFrom.length > 0 ? 15 : 0);
        if (hiddenFrom.length === 0) ctx.log("log.about.tell.nothing");
        else if (clears) {
          for (const id of hiddenFrom) page!.seen[id] = true;
          const id = hiddenFrom[0]!;
          const top = Object.keys(page!.with[id]!).sort((x, y) => actById(y).tier - actById(x).tier)[0]!;
          ctx.log("log.about.tell.truth", { name: `@name:${b.patrons[id]?.name ?? 0}`, act: `act.${top}` });
          fx(ctx, { guilt: -10, trust: 2 }, "told");
          b.expect[top] = b.expect[top] ?? 0;
          ctx.emit("her:confessed", { patron: id, act: top });
        } else {
          ctx.log("log.about.tell.nothing");
          ctx.log("log.about.tell.lie", undefined, ["unseen"]);
          h.traits.honesty = clamp(h.traits.honesty - A.tell.liePenalty!);
          feel(ctx, "guilt", 4);
        }
      }
      ctx.emit("couple:about", { say });
    },
  });

  // --- 7. promises -----------------------------------------------------------------------------------
  api.actions.register({
    id: PROMISE,
    labelKey: "action.promise",
    describe: (a) => ({ key: `action.promise.${a.payload!.kind}` }),
    enumerate(state) {
      const b = bs(state);
      if (!together(state) || state.time.phase === "shift" || b.night?.herAsleep || b.complaint) return [];
      return (b.promises ?? []).some((p) => p.kind === "date") ? [] : [{ type: PROMISE, payload: { kind: "date" } }];
    },
    apply(ctx) {
      promise(ctx, "date");
      changeHeroine(ctx, "mood", 2, "husband");
      ctx.log("log.promise.made.date");
    },
  });
  api.events.on("couple:heard", (ctx, e) => {
    if (e.payload!.how === "promise") promise(ctx, "complaint", e.payload!.topic as string);
  });
  api.events.on("day:did", (ctx, e) => {
    const what = e.payload!.do as string;
    if (what === "date") settle(ctx, "date", true);
    if (what === "her_chores" && bs(ctx.state).promises?.some((p) => p.kind === "complaint" && p.topic === "tired")) settle(ctx, "complaint", true);
  });
  api.events.on("reaction", (ctx, e) => {
    if (e.payload!.how === "stop") settle(ctx, "protect", true);
  });
  api.events.on("couple:guest", (ctx, e) => {
    const what = e.payload!.do as string;
    if (what === "throw_out" || what === "join") settle(ctx, "protect", true);
    if (what === "encourage" && bs(ctx.state).promises?.some((p) => p.kind === "complaint" && p.topic === "pushed")) settle(ctx, "complaint", false);
  });
  // he said he would step in, and he stood there
  api.events.on("encounter:pushed", (ctx, e) => {
    const b = bs(ctx.state);
    if (b.promises?.some((p) => p.kind === "protect") && b.encounter && husbandSees(ctx.state, b.encounter.loc) && e.payload!.far) settle(ctx, "protect", false);
  });
  api.events.on("bed:ended", (ctx, e) => {
    const b = bs(ctx.state);
    const p = b.promises?.find((x) => x.kind === "complaint");
    if (!p) return;
    if (p.topic === "neglect") settle(ctx, "complaint", true);
    if (p.topic === "bed" && e.payload!.came) settle(ctx, "complaint", true);
  });
  api.events.on("couple:tell", (ctx, e) => {
    if (e.payload!.say === "forbid" && bs(ctx.state).promises?.some((p) => p.kind === "complaint" && p.topic === "control")) settle(ctx, "complaint", false);
  });
  api.events.on("couple:allow", (ctx, e) => {
    if (e.payload!.say === "forbid" && bs(ctx.state).promises?.some((p) => p.kind === "complaint" && p.topic === "control")) settle(ctx, "complaint", false);
  });
  api.events.on("day:start", (ctx) => {
    const b = bs(ctx.state);
    for (const p of [...(b.promises ?? [])]) {
      if (ctx.state.time.day <= p.due) continue;
      // some promises are kept by not doing a thing; the rest are broken by letting the days run out
      const quiet = p.kind === "complaint" && (p.topic === "control" || p.topic === "pushed" || (p.topic === "money" && b.purseShare > 0));
      settle(ctx, p.kind, quiet || p.kind === "protect");
    }
  });

  // --- 8. pushing after a "no" -----------------------------------------------------------------------
  api.events.on("husband:refused", (ctx, e) => {
    const n = bs(ctx.state).night;
    if (n) n.refused = e.payload!.act as string;
  });
  api.actions.register({
    id: PRESS,
    labelKey: "action.press",
    enumerate(state) {
      const n = bs(state).night;
      return state.time.phase === "night" && n && n.refused && !n.sex && !n.pressed && !n.counter ? [{ type: PRESS }] : [];
    },
    apply(ctx) {
      const b = bs(ctx.state);
      const h = b.heroine;
      const n = b.night!;
      const P = T.press;
      n.pressed = true;
      const chance = P.base + Math.max(0, 60 - h.traits.confidence) * P.perLowConfidence + (h.latents.submissive ? P.submissive : 0) + (trustOf(ctx.state) - 50) * P.perTrust;
      if (ctx.rng.chance(clamp(chance, 0, 0.9))) {
        fx(ctx, P.gaveIn, "pushed");
        n.counter = n.refused; // she lets him: this, and nothing else
        n.asked = false;
        n.scene = "wants_him";
        ctx.log("log.press.gave_in");
        ctx.emit("couple:press", { ok: true });
      } else {
        fx(ctx, P.snapped, "pushed");
        ctx.log(`log.press.snapped.${ctx.rng.int(1, 2)}`);
        ctx.emit("couple:press", { ok: false });
      }
    },
  });

  // reaching for her counts even when she says no
  for (const ev of ["husband:refused", "bed:started", "her:answered", "couple:wish", "couple:about", "bare:asked"])
    api.events.on(ev, (ctx) => {
      bs(ctx.state).reachedDay = ctx.state.time.day;
    });
  // --- 9. the morning after ---------------------------------------------------------------------------
  api.events.on(
    "phase:exit",
    (ctx, e) => {
      if (e.payload!.phase !== "night") return;
      const b = bs(ctx.state);
      b.ignoredHer = b.talked.length === 0 && b.reachedDay !== ctx.state.time.day && !b.diary?.find((d) => d.day === ctx.state.time.day)?.with[HUSBAND];
    },
    40,
  );
  api.events.on(
    "phase:enter",
    (ctx, e) => {
      const b = bs(ctx.state);
      if (e.payload!.phase !== "prep" || !b.ignoredHer || ctx.state.time.day <= 2) return;
      b.ignoredHer = false;
      if (b.heroine.marriage.desire < T.morning.ignoredDesire || ctx.state.time.day - (b.ignoredSaid ?? -9) < 3) return;
      b.ignoredSaid = ctx.state.time.day;
      fx(ctx, T.morning.ignored, "ignored");
      ctx.log("log.morning.ignored");
    },
    -40,
  );

  // --- 10. a hard word ---------------------------------------------------------------------------------
  api.events.on("couple:talk", (ctx, e) => {
    if (e.payload!.do !== "demean") return;
    const b = bs(ctx.state);
    const h = b.heroine;
    const likes = (h.latents.submissive !== undefined || h.latents.likes_rough !== undefined) && (b.mode === "open" || h.traits.openness >= 60);
    if (likes) fx(ctx, { arousal: 8, shame: 6 }, "demeaned");
    else fx(ctx, { anger: 10, resent: 3, trust: -5, mood: -4 }, "demeaned");
    ctx.log(likes ? "log.demean.likes" : "log.demean.hurt");
  });

  api.invariants.add("terms", (s) => {
    const b = bs(s);
    for (const id of b.wishes ?? []) if (!T.wishes[id]) return `unknown wish: ${id}`;
    if (b.ask && !b.patrons[b.ask.patron]) return "she asks about a man who does not exist";
    for (const p of Object.values(b.patrons)) if (p.memory.stance && !["free", "polite", "away"].includes(p.memory.stance)) return `bad stance on ${p.id}`;
    void WIFE;
    return null;
  });
}
