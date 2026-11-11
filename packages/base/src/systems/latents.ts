// Hidden sides of her. Rolled once from the seed. Each adds its own row to the consent formula;
// until the player has seen it at work often enough, the row carries a vague label.
import type { GameState, ModApi } from "@tc/core";
import { content } from "../content";
import type { Act, Latent } from "../content/schema";
import { bs } from "../state";
import type { Patron } from "../state";
import { actById, CONSENT_FORMULA, isIntimate } from "./encounters";
import type { ConsentInput } from "./encounters";
import { HALL, husbandSees } from "./places";

type Rule = (state: GameState, input: ConsentInput, act: Act, p: Patron, l: Latent) => number | null;

/** What each trait does. The numbers come from content/latents.yaml (strength). */
const RULES: Record<string, Rule> = {
  // other guests watching: cancels the "witnesses" wall and then some
  exhibitionist(state, input, act, _p, l) {
    const others = (bs(state).shift?.visits.length ?? 0) - 1;
    if (input.loc !== HALL || act.tier < 3) return null;
    const eyes = others > 0 ? (100 - bs(state).heroine.traits.openness) * content.consent.witnesses * l.strength : 0;
    // on the floor in front of everyone is exactly her thing: most of that wall is gone
    return eyes + (isIntimate(act) ? content.consent.inPlainSight * 0.8 : 0) || null;
  },
  submissive: (_s, input, _a, _p, l) => (input.pressure > 0 ? l.strength : null),
  size_queen(state, _i, act, p, l) {
    if (!p.memory.sizeKnown || !(act.zones.includes("vagina") || act.zones.includes("anus"))) return null;
    return (p.size - bs(state).husband.size) * content.consent.size * l.strength;
  },
  guilt_thrill: (state, input, act, _p, l) => (bs(state).mode === "hidden" && isIntimate(act) && !husbandSees(state, input.loc) ? l.strength : null),
  likes_watched: (state, input, act, _p, l) => (bs(state).mode === "open" && act.tier >= 2 && husbandSees(state, input.loc) ? l.strength : null),
};

export function registerLatents(api: ModApi) {
  api.events.on(
    "game:init",
    (ctx) => {
      const h = bs(ctx.state).heroine;
      for (const l of content.latents) if (RULES[l.id] && ctx.rng.chance(l.chance)) h.latents[l.id] = true;
    },
    -10,
  );

  const valueOf = (state: GameState, input: ConsentInput, l: Latent): number | null => {
    const mine = bs(state).heroine.latents[l.id];
    const p = bs(state).patrons[input.partner];
    if (!mine || !p) return null;
    return RULES[l.id]!(state, input, actById(input.act), p, l);
  };

  // One row per trait. Its id starts with "consent.latent.": an immersive UI shows such rows without naming them.
  for (const l of content.latents) {
    if (!RULES[l.id]) continue;
    api.formulas.addFactor<ConsentInput>(CONSENT_FORMULA, {
      id: `consent.latent.${l.id}`,
      labelKey: `latent.${l.id}`,
      order: 50,
      eval: (state, input) => valueOf(state, input, l),
    });
  }

  api.invariants.add("latents-known", (s) => {
    for (const id of Object.keys(bs(s).heroine.latents)) if (!RULES[id]) return `unknown latent "${id}"`;
    return null;
  });
}
