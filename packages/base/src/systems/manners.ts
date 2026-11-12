// How she carries herself tonight: what she wears, what her husband asked of her, and the tastes she picks up.
import type { GameState, ModApi } from "@tc/core";
import { content } from "../content";
import type { Outfit } from "../content/schema";
import { bs, clamp } from "../state";
import type { Directive } from "../state";
import { actById, CONSENT_FORMULA } from "./encounters";
import type { ConsentInput } from "./encounters";
import { HALL, husbandSees } from "./places";
import { TIP_FORMULA } from "./shift";
import type { TipInput } from "./shift";

import { dressShift } from "./bodystate";
export const SET_DIRECTIVE = "base/directive";
export const ASK_OUTFIT = "base/ask-outfit";
export const OUTFIT_BACK = "base/outfit-back";
export const ORDER = "base/order";
const M = content.manners;
const outfits = content.outfits.slice().sort((a, b) => a.order - b.order);
const outfitOf = (state: GameState): Outfit => outfits.find((o) => o.id === bs(state).heroine.outfit) ?? outfits[0]!;
/** The most revealing thing she would put on by herself today. */
const ownChoice = (openness: number, owned: string[]): Outfit => [...outfits].reverse().find((o) => owned.includes(o.id) && openness >= o.openness) ?? outfits[0]!;

export function registerManners(api: ModApi) {
  // Every morning she dresses as her own openness allows; the husband's wishes last one day.
  api.events.on("phase:enter", (ctx, e) => {
    if (e.payload!.phase !== "prep") return;
    const b = bs(ctx.state);
    const own = ownChoice(b.heroine.traits.openness + (ctx.state.time.day > 1 ? dressShift(ctx.state) : 0), b.owned);
    if (own.id !== b.heroine.outfit && ctx.state.time.day > 1) ctx.log("log.outfit.own", { outfit: `outfit.${own.id}` });
    b.heroine.outfit = own.id;
    // what he said he wants of her stands until it fades or he says otherwise
    b.directive = b.wishes?.includes("tone_down") ? "reserved" : b.wishes?.includes("friendlier") ? "friendly" : "natural";
    b.outfitAsked = false;
    b.changed = null;
    b.orders = [];
    b.ordersAsked = [];
  });

  // Single things about her dress, asked before opening. Each can be asked once a day.
  const active = (state: GameState) => M.orders.filter((o) => bs(state).orders.includes(o.id));
  api.actions.register({
    id: ORDER,
    labelKey: "action.order",
    describe: (a) => ({ key: `action.order.${a.payload!.id}` }),
    enumerate: (state) => (state.time.phase === "prep" ? M.orders.filter((o) => !bs(state).ordersAsked.includes(o.id)).map((o) => ({ type: ORDER, payload: { id: o.id } })) : []),
    apply(ctx, action) {
      const b = bs(ctx.state);
      const o = M.orders.find((x) => x.id === action.payload!.id)!;
      b.ordersAsked.push(o.id);
      const ok = b.heroine.traits.openness + M.askOutfitBonus + b.heroine.arousal / 10 >= o.openness;
      if (ok) {
        b.orders.push(o.id);
        b.told.push({ day: ctx.state.time.day, key: `told.order.${o.id}` });
        if (b.told.length > 10) b.told.shift();
        // it tells her how he wants her seen
        for (const a of content.acts) if (a.tier <= 2) b.expect[a.id] = Math.max(b.expect[a.id] ?? 0, 40);
      } else b.heroine.marriage.resent = clamp(b.heroine.marriage.resent + 0.5);
      ctx.log(`log.order.${o.id}.${ok ? "yes" : "no"}`);
    },
  });
  api.events.on("patron:arrived", (ctx, e) => {
    const p = bs(ctx.state).patrons[e.payload!.id as string];
    if (p) p.memory.interest = clamp(p.memory.interest + active(ctx.state).reduce((s, o) => s + o.allure, 0));
  });
  api.events.on("shift:tick", (ctx) => {
    const add = active(ctx.state).reduce((s, o) => s + o.arousal, 0);
    if (add > 0) bs(ctx.state).heroine.arousal = clamp(bs(ctx.state).heroine.arousal + add);
  });
  api.formulas.addFactor<TipInput>(TIP_FORMULA, {
    id: "tip.orders",
    labelKey: "factor.tip.orders",
    order: 30.5,
    eval: (state, { bill }) => (bill * active(state).reduce((s, o) => s + o.tip, 0)) / 4 || null,
  });
  api.formulas.addFactor<ConsentInput>(CONSENT_FORMULA, {
    id: "consent.orders",
    labelKey: "factor.consent.orders",
    order: 43.5,
    eval: (state, input) => (input.partner !== "husband" && actById(input.act).tier >= 3 ? active(state).reduce((s, o) => s + o.consent, 0) || null : null),
  });

  // In the middle of the evening she may slip away and come back in something bolder:
  // because she feels like it, or because a guest asked. If her husband is looking, she needs a reason.
  api.events.on("shift:tick", (ctx) => {
    const b = bs(ctx.state);
    const h = b.heroine;
    const C = M.change;
    if (!b.shift || b.changed || b.encounter || b.caught) return;
    const now = outfitOf(ctx.state);
    const next = outfits.find((o) => o.order === now.order + 1 && b.owned.includes(o.id));
    if (!next) return;
    const asker = b.shift.visits
      .map((v) => b.patrons[v.patron]!)
      .find((p) => p.memory.interest >= C.guestInterest && ctx.rng.chance(C.guestChance));
    const own = (h.arousal >= C.arousalFrom || h.drunk >= C.drunkFrom) && h.traits.openness + C.margin + (b.wishes?.includes("dress_bold") ? (content.terms.wishes.dress_bold?.outfit ?? 0) : 0) >= next.openness && ctx.rng.chance(C.chancePerTick);
    const forHim = asker && h.traits.openness + C.guestMargin + h.arousal / 5 >= next.openness;
    if (asker && !forHim && !own) {
      ctx.log("log.outfit.guest.no", { name: `@name:${asker.name}` }, husbandSees(ctx.state, HALL) ? undefined : ["unseen"]);
      return;
    }
    if (!own && !forHim) return;
    b.changed = { from: now.id, by: forHim ? asker!.id : null };
    h.outfit = next.id;
    const seen = husbandSees(ctx.state, HALL);
    const params = { outfit: `outfit.${next.id}`, name: forHim ? `@name:${asker!.name}` : "" };
    if (b.mode === "open") ctx.log(forHim ? "log.outfit.change.open.guest" : "log.outfit.change.open", params);
    else if (seen) {
      // she owes him a reason, and the reason is never the real one
      ctx.log(`log.outfit.change.excuse.${ctx.rng.int(1, 3)}`, params);
      if (forHim) ctx.log("log.outfit.change.why", params, ["unseen"]);
      b.suspicion = clamp(b.suspicion + C.suspicion * content.secrecy.styleFactor[b.husband.style]);
    } else ctx.log(forHim ? "log.outfit.change.unseen.guest" : "log.outfit.change.unseen", params, ["unseen"]);
    if (forHim) asker!.memory.interest = clamp(asker!.memory.interest + 6);
    for (const v of b.shift.visits) {
      const p = b.patrons[v.patron]!;
      p.memory.interest = clamp(p.memory.interest + Math.max(0, next.allure - now.allure));
    }
    b.shift.interrupt = true;
    ctx.emit("outfit:changed", { to: next.id, by: b.changed.by });
  });

  // He can send her back to change.
  api.actions.register({
    id: OUTFIT_BACK,
    labelKey: "action.outfit.back",
    enumerate: (state) => {
      const b = bs(state);
      return state.time.phase === "shift" && b.changed && b.heroine.outfit !== b.changed.from && !b.encounter && !b.caught && state.where.husband === state.where.wife ? [{ type: OUTFIT_BACK }] : [];
    },
    apply(ctx) {
      const b = bs(ctx.state);
      const h = b.heroine;
      const was = outfitOf(ctx.state);
      h.outfit = b.changed!.from;
      const minds = h.traits.openness >= was.openness - 10;
      if (minds) h.marriage.resent = clamp(h.marriage.resent + M.change.backResent);
      // it tells her something about everything else too
      for (const a of content.acts) if (a.tier >= 2) b.expect[a.id] = Math.max(-100, (b.expect[a.id] ?? 0) - 10);
      b.told.push({ day: ctx.state.time.day, key: "told.outfit.back" });
      if (b.told.length > 10) b.told.shift();
      ctx.log(minds ? "log.outfit.back.sulk" : "log.outfit.back", { outfit: `outfit.${h.outfit}` });
    },
  });

  api.actions.register({
    id: SET_DIRECTIVE,
    labelKey: "action.directive",
    describe: (a) => ({ key: `action.directive.${a.payload!.value}` }),
    accepts: (state, a) => state.time.phase === "prep" && (a.payload?.value as string) in M.directives,
    enumerate(state) {
      void state;
      return []; // said through "what I want from you today" now; kept so old saves and mods can still dispatch it
    },
    apply(ctx, action) {
      const value = action.payload!.value as Directive;
      bs(ctx.state).directive = value;
      ctx.log(`log.directive.${value}`);
    },
  });

  api.actions.register({
    id: ASK_OUTFIT,
    labelKey: "action.outfit",
    describe: (a) => ({ key: "action.outfit.ask", params: { outfit: `outfit.${a.payload!.outfit}` } }),
    enumerate(state) {
      const b = bs(state);
      if (state.time.phase !== "prep" || b.outfitAsked) return [];
      return outfits.filter((o) => o.id !== b.heroine.outfit && b.owned.includes(o.id)).map((o) => ({ type: ASK_OUTFIT, payload: { outfit: o.id } }));
    },
    apply(ctx, action) {
      const b = bs(ctx.state);
      const o = outfits.find((x) => x.id === action.payload!.outfit)!;
      b.outfitAsked = true;
      // something more modest is never a problem; something bolder needs her to be open enough, his asking helps
      const ok = o.order < outfitOf(ctx.state).order || b.heroine.traits.openness + M.askOutfitBonus >= o.openness;
      if (ok) b.heroine.outfit = o.id;
      ctx.log(ok ? "log.outfit.yes" : "log.outfit.no", { outfit: `outfit.${o.id}` });
    },
  });

  // A guest notices what she is wearing.
  api.events.on("patron:arrived", (ctx, e) => {
    const b = bs(ctx.state);
    const p = b.patrons[e.payload!.id as string];
    if (p) p.memory.interest = clamp(p.memory.interest + outfitOf(ctx.state).allure);
  });

  api.formulas.addFactor<TipInput>(TIP_FORMULA, {
    id: "tip.outfit",
    labelKey: "factor.tip.outfit",
    order: 30,
    eval: (state, { bill }) => (bill * outfitOf(state).tip) / 4 || null,
  });
  api.formulas.addFactor<TipInput>(TIP_FORMULA, {
    id: "tip.directive",
    labelKey: "factor.tip.directive",
    order: 31,
    eval: (state, { bill }) => (bill * M.directives[bs(state).directive]!.tip) / 4 || null,
  });

  api.formulas.addFactor<ConsentInput>(CONSENT_FORMULA, {
    id: "consent.directive",
    labelKey: "factor.consent.directive",
    order: 43,
    eval(state, input) {
      if (input.partner === "husband") return null;
      const d = M.directives[bs(state).directive]!;
      return d.consent !== 0 && actById(input.act).tier <= d.maxTier ? d.consent : null;
    },
  });

  // --- tastes: what she has learned to like ---
  api.formulas.addFactor<ConsentInput>(CONSENT_FORMULA, {
    id: "consent.taste",
    labelKey: "factor.consent.taste",
    order: 23,
    eval: (state, input) => bs(state).heroine.tastes.acts[input.act] || null,
  });
  api.formulas.addFactor<ConsentInput>(CONSENT_FORMULA, {
    id: "consent.type_taste",
    labelKey: "factor.consent.type_taste",
    order: 24,
    eval(state, input) {
      const p = bs(state).patrons[input.partner];
      return (p && bs(state).heroine.tastes.types[p.type]) || null;
    },
  });
  api.events.on("encounter:started", (ctx, e) => {
    const b = bs(ctx.state);
    const { patron, act, verdict, came, tier } = e.payload as { patron: string; act: string; verdict: string; came: boolean; tier: number };
    if (tier < 2) return;
    const t = b.heroine.tastes;
    const move = (came ? M.taste.came : 0) + (verdict === "eager" ? M.taste.eager : M.taste.hesitant);
    t.acts[act] = clamp((t.acts[act] ?? 0) + move, M.taste.min, M.taste.max);
    const type = b.patrons[patron]?.type;
    if (type && verdict === "eager") t.types[type] = clamp((t.types[type] ?? 0) + M.taste.typeEager * tier, M.taste.min, M.taste.max);
  });
  // what made her come, she comes to like
  api.events.on("encounter:came", (ctx, e) => {
    const t = bs(ctx.state).heroine.tastes;
    const act = e.payload!.act as string;
    t.acts[act] = clamp((t.acts[act] ?? 0) + M.taste.came, M.taste.min, M.taste.max);
  });
  api.events.on("husband:act", (ctx, e) => {
    const t = bs(ctx.state).heroine.tastes;
    const { act, came } = e.payload as { act: string; came: boolean };
    t.acts[act] = clamp((t.acts[act] ?? 0) + (came ? M.taste.came : M.taste.hesitant), M.taste.min, M.taste.max);
  });

  // The outfit is part of the picture key, so image packs can vary by it.
  api.invariants.add("outfit-known", (s) => (outfits.some((o) => o.id === bs(s).heroine.outfit) ? null : `unknown outfit "${bs(s).heroine.outfit}"`));
}
