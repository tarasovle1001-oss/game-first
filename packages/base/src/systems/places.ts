import type { ModApi } from "@tc/core";
import { content } from "../content";
import { HUSBAND, WIFE } from "../state";

export const PHASES = ["prep", "shift", "night", "summary"] as const;
export const ticksDone = (shift: { tick: number } | null) => !shift || shift.tick >= content.balance.shift.ticks;

/** Rooms from content, the cast, and the fallback "who is here" scene. */
export function registerPlaces(api: ModApi) {
  for (const r of content.rooms)
    api.locations.register({ id: r.id, zone: r.zone, nameKey: `loc.${r.id}`, links: r.links, tags: r.tags, meta: { map: r.map } });

  api.events.on("game:init", (ctx) => {
    ctx.state.where[WIFE] = "cafe.bar";
    ctx.state.where[HUSBAND] = "cafe.hall";
    ctx.state.mods.core.controllable.push(HUSBAND);
  });

  // Fallback scene: who shares the room with the viewer. Specific scenes outrank it.
  api.scenes.register({
    id: "base.idle",
    priority: -1000,
    match(state) {
      const at = state.where[HUSBAND];
      if (!at) return null;
      const here = Object.entries(state.where)
        .filter(([, loc]) => loc === at)
        .map(([id]) => ({ id, role: id === WIFE || id === HUSBAND ? id : "patron" }));
      return { type: "idle", location: at, participants: here };
    },
  });

  api.invariants.add("cast-placed", (s) => (s.where[WIFE] && s.where[HUSBAND] ? null : "wife or husband has no location"));
}
