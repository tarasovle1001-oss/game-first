import type { GameState, ModApi } from "@tc/core";
import { content } from "../content";
import { bs, clamp, WIFE } from "../state";
import { HALL } from "./places";
import { bareOf } from "./dress";
import { TIP_FORMULA, type TipInput } from "./shift";

const C = content.manners.charm;
/** How hard she is to look away from right now, 0..100: what she wears, what she has taken off, and what the evening has left on her. */
export const charmParts = (state: GameState): [string, number][] => {
  const h = bs(state).heroine;
  const outfit = content.outfits.find((o) => o.id === h.outfit) ?? content.outfits[0]!;
  const orders = content.manners.orders.filter((o) => bs(state).orders.includes(o.id)).reduce((s, o) => s + o.allure, 0);
  const bare = bareOf(state);
  const marks = Math.min(C.marksMax, (Object.keys(h.cum ?? {}).length + Object.keys(h.after ?? {}).length) * C.perMark);
  return [
    ["base", C.base],
    ["nature", ((h.attrs?.charm ?? 50) - 50) * C.nature],
    ["outfit", outfit.allure * C.perAllure],
    ["orders", orders * C.perAllure],
    ["bare", bare === "none" ? 0 : content.manners.talk.bare.allure[bare]! * C.perAllure],
    ["marks", marks],
    ["flushed", (h.arousal / 100) * C.arousal + (h.drunk / 100) * C.drunk],
  ];
};
export const charmOf = (state: GameState) => clamp(charmParts(state).reduce((s, [, v]) => s + v, 0));

export function registerCharm(api: ModApi) {
  // the room tips a woman it cannot stop looking at
  api.formulas.addFactor<TipInput>(TIP_FORMULA, {
    id: "tip.looks",
    labelKey: "factor.tip.looks",
    order: 34,
    eval: (state, { bill }) => {
      const d = charmOf(state) - C.base;
      return d === 0 || state.where[WIFE] !== HALL ? null : (bill * d * C.tip) / 100;
    },
  });
  // and every ten minutes of looking at her does its work on the men in the hall
  api.events.on("shift:tick", (ctx) => {
    const b = bs(ctx.state);
    const d = charmOf(ctx.state) - C.base;
    if (d <= 0 || ctx.state.where[WIFE] !== HALL || !b.shift) return;
    for (const v of b.shift.visits) {
      const p = b.patrons[v.patron];
      if (p && v.stay > 0) p.memory.interest = clamp(p.memory.interest + d * C.interest);
    }
  });
}
