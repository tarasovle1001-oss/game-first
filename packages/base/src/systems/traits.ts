// Her character traits as a registry (27.11, content/traits.yaml). The five built-in ones are read by name across the code;
// a new trait acts only through what the registry gives it: a consent row, her urge on the floor, where she goes, a tips row.
// No new code for a new trait - a line in traits.yaml and its texts.
import type { Ctx, GameState, ModApi } from "@tc/core";
import { content } from "../content";
import type { TraitDef } from "../content/schema";
import { bs, HUSBAND } from "../state";
import type { Heroine } from "../state";
import { actById, CONSENT_FORMULA, isIntimate } from "./encounters";
import type { ConsentInput } from "./encounters";
import { TIP_FORMULA } from "./shift";
import type { TipInput } from "./shift";

export const TRAITS: readonly TraitDef[] = content.traits;
const byId = new Map(TRAITS.map((t) => [t.id, t]));
const ROWS = TRAITS.filter((t) => t.consent);
const URGE = TRAITS.filter((t) => t.initiative);
const TRIPS = TRAITS.filter((t) => t.trips && Object.keys(t.trips).length);

/** Her value of a trait; a trait added after the save was made starts at its default. */
export const traitOf = (h: Heroine, id: string): number => h.traits[id] ?? byId.get(id)?.default ?? 50;
/** Every trait of the registry at its default: a new heroine. */
export const defaultTraits = () => Object.fromEntries(TRAITS.map((t) => [t.id, t.default])) as Heroine["traits"];

/** What the registry's traits add to her urge to make a move herself (0 when no trait has a say). */
export function traitUrge(state: GameState): number {
  const h = bs(state).heroine;
  return URGE.reduce((s, t) => s + (traitOf(h, t.id) - 50) * t.initiative!, 0);
}

/** Where she goes in her free time: the plain pick, or weighted by traits that care where she goes. */
export function pickTrip(ctx: Ctx, trips: readonly string[]): string {
  if (!TRIPS.length) return ctx.rng.pick(trips as string[]);
  const h = bs(ctx.state).heroine;
  return ctx.rng.weighted(trips.map((place) => ({ item: place, weight: Math.max(0.05, TRIPS.reduce((w, t) => w + ((t.trips![place] ?? 0) * (traitOf(h, t.id) - 50)) / 50, 1)) })));
}

export function registerTraits(api: ModApi) {
  for (const t of ROWS) {
    const c = t.consent!;
    api.formulas.addFactor<ConsentInput>(CONSENT_FORMULA, {
      id: `consent.trait_${t.id}`,
      labelKey: `factor.consent.trait_${t.id}`,
      order: 23,
      eval(state, input) {
        const act = actById(input.act);
        if (act.tier < c.from || (c.guest && input.partner === HUSBAND)) return null;
        const depth = c.depth ? (isIntimate(act) ? 1 : 0.3 + act.tier / 10) : 1;
        const v = (traitOf(bs(state).heroine, t.id) - 50) * c.per * depth;
        return Math.abs(v) < 0.05 ? null : v;
      },
    });
  }
  for (const t of TRAITS.filter((x) => x.tips !== undefined))
    api.formulas.addFactor<TipInput>(TIP_FORMULA, {
      id: `tip.trait_${t.id}`,
      labelKey: `factor.tip.trait_${t.id}`,
      order: 35,
      eval: (state, { bill }) => {
        const v = ((traitOf(bs(state).heroine, t.id) - 50) * t.tips! * bill) / 100;
        return Math.abs(v) < 0.05 ? null : v;
      },
    });
}
