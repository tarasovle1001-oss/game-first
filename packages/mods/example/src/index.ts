// Example third-party mod. Uses only the public API of @tc/core:
// own state slice, an event handler with a seeded roll, an action, a formula factor, an invariant.
import type { Dict, Mod } from "@tc/core";

export const EXAMPLE_ID = "example";
export const EXAMPLE_FORMULA = "example/luck";

interface ExampleState {
  rainyDays: number;
  rainToday: boolean;
  umbrella: boolean;
}

export const exampleMod: Mod = {
  id: EXAMPLE_ID,
  version: 1,
  requires: ["base"],
  initState: () => ({ rainyDays: 0, rainToday: false, umbrella: false }),
  register(api) {
    api.events.on("day:start", (ctx) => {
      const s = ctx.state.mods[EXAMPLE_ID] as ExampleState;
      s.rainToday = ctx.rng.chance(0.3);
      if (s.rainToday) {
        s.rainyDays += 1;
        ctx.log("example.log.rain");
      }
    });

    api.actions.register({
      id: "example/toggle-umbrella",
      labelKey: "example.action.umbrella",
      enumerate: (state) => (state.time.phase === "prep" ? [{ type: "example/toggle-umbrella" }] : []),
      apply(ctx) {
        const s = ctx.state.mods[EXAMPLE_ID] as ExampleState;
        s.umbrella = !s.umbrella;
      },
    });

    api.formulas.addFactor(EXAMPLE_FORMULA, {
      id: "example.base",
      labelKey: "example.factor.base",
      order: 0,
      eval: () => 10,
    });
    api.formulas.addFactor(EXAMPLE_FORMULA, {
      id: "example.rain",
      labelKey: "example.factor.rain",
      order: 10,
      eval(state) {
        const s = state.mods[EXAMPLE_ID] as ExampleState;
        if (!s.rainToday) return null; // row hidden when not applicable
        return s.umbrella ? -1 : -5;
      },
    });

    api.invariants.add("rain-count", (state) => {
      const s = state.mods[EXAMPLE_ID] as ExampleState;
      return s.rainyDays <= state.time.day ? null : "more rainy days than days";
    });
  },
};

export const exampleLocales: Record<string, Dict> = {
  en: {
    "example.log.rain": "It is raining today.",
    "example.action.umbrella": "Take or leave the umbrella",
    "example.factor.base": "Base",
    "example.factor.rain": "Rain",
  },
  ru: {
    "example.log.rain": "Сегодня дождь.",
    "example.action.umbrella": "Взять или оставить зонт",
    "example.factor.base": "База",
    "example.factor.rain": "Дождь",
  },
};
