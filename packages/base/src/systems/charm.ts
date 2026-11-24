import type { GameState, ModApi } from "@tc/core";
import { content } from "../content";
import { bs, clamp, WIFE } from "../state";
import { HALL } from "./places";
import { bareOf } from "./dress";
import { sheerOf, wearOf } from "./bodystate";
import { TIP_FORMULA, type TipInput } from "./shift";

const C = content.manners.charm;
/** How hard she is to look away from right now, 0..100: what she wears, what she has taken off, and what the evening has left on her. */
export const charmParts = (state: GameState): [string, number][] => {
  const h = bs(state).heroine;
  const bare = bareOf(state);
  const worn = wearOf(state);
  const W = content.intimacy.wear;
  const work = content.outfits.find((o) => o.id === worn);
  // naked is naked whatever she took off; a see-through thing with nothing under it is a little more than that
  const outfit = bare === "all" ? C.nakedAllure : (work?.allure ?? W.allure[worn] ?? 0) + (sheerOf(worn) && h.panties === "off" ? W.noPantiesAllure : 0);
  const orders = bare === "all" || !work ? 0 : content.manners.orders.filter((o) => bs(state).orders.includes(o.id)).reduce((s, o) => s + o.allure, 0);
  const marks = Math.min(C.marksMax, (Object.keys(h.cum ?? {}).length + Object.keys(h.after ?? {}).length) * C.perMark);
  return [
    ["base", C.base],
    ["nature", ((h.attrs?.charm ?? 50) - 50) * C.nature],
    ["outfit", outfit * C.perAllure],
    ["orders", orders * C.perAllure],
    ["bare", bare === "none" || bare === "all" ? 0 : content.manners.talk.bare.allure[bare]! * C.perAllure],
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
