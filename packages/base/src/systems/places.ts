import type { GameState, ModApi } from "@tc/core";
import { content } from "../content";
import { HUSBAND, WIFE } from "../state";

export const HALL = "cafe.hall";
export const PHASES = ["prep", "shift", "night", "summary"] as const;
const sb = content.balance.shift;
export const TICKS_PER_SHIFT = Math.round((sb.hours * 60) / sb.minutesPerTick);
/** Minutes -> ticks, at least one. */
export const ticks = (minutes: number) => Math.max(1, Math.round(minutes / sb.minutesPerTick));
export const ticksDone = (shift: { tick: number } | null) => !shift || shift.tick >= TICKS_PER_SHIFT;
/** "18:40" from a minute of the day. */
export const clockText = (minute: number) => {
  const m = ((minute % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
};

const sight = new Map(content.rooms.map((r) => [r.id, new Set([r.id, ...r.sees])]));
const linked = new Map(content.rooms.map((r) => [r.id, new Set(r.links)]));
/** True when the husband has `loc` in view: he is in it, or in a room that looks onto it. */
export const husbandSees = (state: GameState, loc: string) => sight.get(state.where[HUSBAND] ?? "")?.has(loc) ?? false;
/** True when he is in the room itself, close enough to touch. */
export const husbandIn = (state: GameState, loc: string) => state.where[HUSBAND] === loc;
/** True when he is next door: he sees nothing but may hear. */
export const husbandNextTo = (state: GameState, loc: string) => !husbandSees(state, loc) && (linked.get(state.where[HUSBAND] ?? "")?.has(loc) ?? false);

/** Rooms from content, the cast, and the fallback "who is here" scene. */
export function registerPlaces(api: ModApi) {
  for (const r of content.rooms)
    api.locations.register({ id: r.id, zone: r.zone, nameKey: `loc.${r.id}`, links: r.links, tags: r.tags, meta: { map: r.map } });

  api.events.on("game:init", (ctx) => {
    ctx.state.where[WIFE] = "cafe.bar";
    ctx.state.where[HUSBAND] = "cafe.hall";
    ctx.state.mods.core.controllable.push(HUSBAND);
    for (const n of [1, 2, 3]) ctx.log(`log.intro.${n}`);
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
