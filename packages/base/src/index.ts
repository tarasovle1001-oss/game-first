import type { Dict, LocationDef, Mod } from "@tc/core";
import en from "../locales/en.json";
import ru from "../locales/ru.json";

export const BASE_ID = "base";
export const WIFE = "wife";
export const HUSBAND = "husband";

export const PHASES = ["prep", "shift", "night", "summary"] as const;

// Stage 2 moves rooms to YAML content files. Kept inline until the content pipeline exists.
const room = (id: string, zone: string, links: string[]): LocationDef => ({
  id,
  zone,
  nameKey: `base.room.${id}`,
  links,
});
export const ROOMS: LocationDef[] = [
  room("cafe.hall", "cafe", ["cafe.bar", "cafe.toilet", "home.bedroom"]),
  room("cafe.bar", "cafe", ["cafe.hall", "cafe.kitchen"]),
  room("cafe.kitchen", "cafe", ["cafe.bar", "cafe.staff"]),
  room("cafe.staff", "cafe", ["cafe.kitchen"]),
  room("cafe.toilet", "cafe", ["cafe.hall"]),
  room("home.bedroom", "home", ["home.bathroom", "cafe.hall"]),
  room("home.bathroom", "home", ["home.bedroom"]),
];

export interface BaseState {
  daysPlayed: number;
}

export const baseMod: Mod = {
  id: BASE_ID,
  version: 1,
  initState: (): BaseState & Record<string, never> => ({ daysPlayed: 0 }) as any,
  register(api) {
    PHASES.forEach((id, i) => api.phases.register({ id, labelKey: `base.phase.${id}`, order: i }));
    ROOMS.forEach((r) => api.locations.register(r));

    api.events.on("game:init", (ctx) => {
      ctx.state.where[WIFE] = "cafe.bar";
      ctx.state.where[HUSBAND] = "cafe.hall";
      ctx.state.mods.core.controllable.push(HUSBAND);
    });

    api.events.on("phase:enter", (ctx, e) => {
      const phase = e.payload!.phase as string;
      ctx.log("base.log.phase", { day: ctx.state.time.day, phase: `base.phase.${phase}` });
      // Placeholder routine until the schedule system lands: she works the shift, sleeps at home.
      if (phase === "shift") ctx.state.where[WIFE] = "cafe.bar";
      if (phase === "night") ctx.state.where[WIFE] = "home.bedroom";
    });

    api.events.on("day:end", (ctx) => {
      (ctx.state.mods[BASE_ID] as BaseState).daysPlayed += 1;
    });

    // Fallback scene: who is in the room with the viewer. Real scene types arrive with stage 4.
    api.scenes.register({
      id: "base.idle",
      priority: -1000,
      match(state) {
        const at = state.where[HUSBAND];
        if (!at) return null;
        const here = Object.entries(state.where)
          .filter(([, loc]) => loc === at)
          .map(([id]) => ({ id, role: id }));
        return { type: "idle", location: at, participants: here };
      },
    });

    api.invariants.add("cast-placed", (s) =>
      s.where[WIFE] && s.where[HUSBAND] ? null : "wife or husband has no location",
    );
  },
};

export const baseLocales: Record<string, Dict> = { en, ru };
