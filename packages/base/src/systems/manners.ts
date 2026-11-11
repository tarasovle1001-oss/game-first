// How she carries herself tonight: what she wears, what her husband asked of her, and the tastes she picks up.
import type { GameState, ModApi } from "@tc/core";
import { content } from "../content";
import type { Outfit } from "../content/schema";
import { bs, clamp } from "../state";
import type { Directive } from "../state";
import { actById, CONSENT_FORMULA } from "./encounters";
import type { ConsentInput } from "./encounters";
import { TIP_FORMULA } from "./shift";
import type { TipInput } from "./shift";

export const SET_DIRECTIVE = "base/directive";
export const ASK_OUTFIT = "base/ask-outfit";
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
    const own = ownChoice(b.heroine.traits.openness, b.owned);
    if (own.id !== b.heroine.outfit && ctx.state.time.day > 1) ctx.log("log.outfit.own", { outfit: `outfit.${own.id}` });
    b.heroine.outfit = own.id;
    b.directive = "natural";
    b.outfitAsked = false;
  });

  api.actions.register({
    id: SET_DIRECTIVE,
    labelKey: "action.directive",
    describe: (a) => ({ key: `action.directive.${a.payload!.value}` }),
    enumerate(state) {
      if (state.time.phase !== "prep") return [];
      return (Object.keys(M.directives) as Directive[]).filter((d) => d !== bs(state).directive).map((value) => ({ type: SET_DIRECTIVE, payload: { value } }));
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
  api.events.on("husband:act", (ctx, e) => {
    const t = bs(ctx.state).heroine.tastes;
    const { act, came } = e.payload as { act: string; came: boolean };
    t.acts[act] = clamp((t.acts[act] ?? 0) + (came ? M.taste.came : M.taste.hesitant), M.taste.min, M.taste.max);
  });

  // The outfit is part of the picture key, so image packs can vary by it.
  api.invariants.add("outfit-known", (s) => (outfits.some((o) => o.id === bs(s).heroine.outfit) ? null : `unknown outfit "${bs(s).heroine.outfit}"`));
}
