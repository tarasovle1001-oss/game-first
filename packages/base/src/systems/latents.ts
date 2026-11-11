// Hidden sides of her. Rolled once from the seed. Each adds its own row to the consent formula;
// until the player has seen it at work often enough, the row carries a vague label.
import type { GameState, ModApi } from "@tc/core";
import { content } from "../content";
import type { Act, Latent } from "../content/schema";
import { bs, HUSBAND } from "../state";
import type { Patron } from "../state";
import { actById, CONSENT_FORMULA, isIntimate } from "./encounters";
import type { ConsentInput } from "./encounters";
import { HALL } from "./places";

type Rule = (state: GameState, input: ConsentInput, act: Act, p: Patron, l: Latent) => number | null;

/** What each trait does. The numbers come from content/latents.yaml (strength). */
const RULES: Record<string, Rule> = {
  // other guests watching: cancels the "witnesses" wall and then some
  exhibitionist(state, input, act, _p, l) {
    const others = (bs(state).shift?.visits.length ?? 0) - 1;
    if (input.loc !== HALL || act.tier < 3 || others <= 0) return null;
    return (100 - bs(state).heroine.traits.openness) * content.consent.witnesses * l.strength;
  },
  submissive: (_s, input, _a, _p, l) => (input.pressure > 0 ? l.strength : null),
  size_queen(state, _i, act, p, l) {
    if (!p.memory.sizeKnown || !(act.zones.includes("vagina") || act.zones.includes("anus"))) return null;
    return (p.size - bs(state).husband.size) * content.consent.size * l.strength;
  },
  guilt_thrill: (state, input, act, _p, l) => (bs(state).mode === "hidden" && isIntimate(act) && state.where[HUSBAND] !== input.loc ? l.strength : null),
  likes_watched: (state, input, act, _p, l) => (bs(state).mode === "open" && act.tier >= 2 && state.where[HUSBAND] === input.loc ? l.strength : null),
};

export function registerLatents(api: ModApi) {
  api.events.on(
    "game:init",
    (ctx) => {
      const h = bs(ctx.state).heroine;
      for (const l of content.latents) if (RULES[l.id] && ctx.rng.chance(l.chance)) h.latents[l.id] = { fired: 0, noticed: false };
    },
    -10,
  );

  const valueOf = (state: GameState, input: ConsentInput, l: Latent): number | null => {
    const mine = bs(state).heroine.latents[l.id];
    const p = bs(state).patrons[input.partner];
    if (!mine || !p) return null;
    return RULES[l.id]!(state, input, actById(input.act), p, l);
  };

  for (const l of content.latents) {
    if (!RULES[l.id]) continue;
    // two rows per trait: a named one once the player has figured it out, a vague one before that
    api.formulas.addFactor<ConsentInput>(CONSENT_FORMULA, {
      id: `consent.latent.${l.id}`,
      labelKey: `latent.${l.id}`,
      order: 50,
      eval: (state, input) => (bs(state).heroine.latents[l.id]?.noticed ? valueOf(state, input, l) : null),
    });
    api.formulas.addFactor<ConsentInput>(CONSENT_FORMULA, {
      id: `consent.latent.unknown.${l.id}`,
      labelKey: "factor.consent.latent",
      order: 51,
      eval: (state, input) => (bs(state).heroine.latents[l.id]?.noticed === false ? valueOf(state, input, l) : null),
    });
  }

  // Each time a trait tips an accepted act in front of him (or once it is all in the open), he gets closer to seeing it.
  api.events.on("encounter:proposed", (ctx, e) => {
    const b = bs(ctx.state);
    if (e.payload!.verdict === "refuse") return;
    const { seen, rowIds } = e.payload as { seen: boolean; rowIds: string[] };
    if (!seen && b.mode !== "open") return;
    for (const l of content.latents) {
      const mine = b.heroine.latents[l.id];
      if (!mine || mine.noticed) continue;
      if (!rowIds.includes(`consent.latent.unknown.${l.id}`)) continue;
      mine.fired += 1;
      if (mine.fired >= l.noticeAfter) {
        mine.noticed = true;
        ctx.log(`log.latent.${l.id}`);
        ctx.emit("latent:noticed", { id: l.id });
      }
    }
  });

  api.invariants.add("latents-known", (s) => {
    for (const id of Object.keys(bs(s).heroine.latents)) if (!RULES[id]) return `unknown latent "${id}"`;
    return null;
  });
}
