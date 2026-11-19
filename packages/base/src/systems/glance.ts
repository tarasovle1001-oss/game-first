// A glance: the picture of a small thing that has just happened (a touch, a word at a table). It is on screen
// until the player's next move and then gives way to whatever is going on.
import type { Ctx, GameState } from "@tc/core";
import { bs } from "../state";

export type Glance = { type: string; loc: string; who: { id: string; role: string }[]; turn: number; tags?: Record<string, string> };

export const glance = (ctx: Ctx, type: string, loc: string | undefined, who: Glance["who"], tags?: Record<string, string>) => {
  if (loc) bs(ctx.state).glance = { type, loc, who, turn: ctx.state.turn, ...(tags ? { tags } : {}) };
};
/** The glance that is still fresh: set by the move the player has just made. */
export const freshGlance = (state: GameState): Glance | null => {
  const g = bs(state).glance;
  return g && g.turn === state.turn ? g : null;
};
