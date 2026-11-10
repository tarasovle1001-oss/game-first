import type { Ctx, ModApi } from "@tc/core";
import { content } from "../content";
import { bs, clamp } from "../state";
import type { Heroine } from "../state";

export const newHeroine = (): Heroine => ({
  energy: 80,
  mood: 60,
  arousal: 10,
  drunk: 0,
  traits: { openness: 30, confidence: 45, fidelity: 80, honesty: 70, libido: 45 },
});

type StateKey = "energy" | "mood" | "arousal" | "drunk";

/** The only way to change her fast stats: clamps and tells mods. */
export function changeHeroine(ctx: Ctx, key: StateKey, amount: number, reason: string) {
  const h = bs(ctx.state).heroine;
  const before = h[key];
  h[key] = clamp(before + amount);
  if (h[key] !== before) ctx.emit("heroine:changed", { key, amount: h[key] - before, reason });
}

export function registerHeroine(api: ModApi) {
  // Small seeded spread so that two seeds do not start with the same woman.
  api.events.on("game:init", (ctx) => {
    const t = bs(ctx.state).heroine.traits;
    for (const k of Object.keys(t) as (keyof typeof t)[]) t[k] = clamp(t[k] + ctx.rng.int(-8, 8));
  });

  api.events.on("phase:enter", (ctx, e) => {
    const h = bs(ctx.state).heroine;
    if (e.payload!.phase === "night") {
      // sleep: energy back, alcohol out, mood and arousal drift to their resting levels
      changeHeroine(ctx, "energy", 65, "sleep");
      changeHeroine(ctx, "drunk", -h.drunk, "sleep");
      changeHeroine(ctx, "mood", Math.round((55 - h.mood) * 0.3), "sleep");
      changeHeroine(ctx, "arousal", Math.round((h.traits.libido * 0.3 - h.arousal) * 0.5), "sleep");
    }
  });

  // During the evening things cool down on their own when nothing feeds them.
  api.events.on("shift:tick", (ctx) => {
    const b = bs(ctx.state);
    const h = b.heroine;
    const rest = h.traits.libido * 0.3;
    if (!b.encounter && h.arousal > rest) h.arousal = Math.max(rest, h.arousal - content.balance.heroine.arousalCoolPerTick);
    h.mood += (55 - h.mood) * content.balance.heroine.moodSettlePerTick;
    h.drunk = Math.max(0, h.drunk - content.balance.heroine.soberPerTick);
  });

  api.invariants.add("heroine-bounds", (s) => {
    const h = bs(s).heroine;
    for (const [k, v] of Object.entries({ energy: h.energy, mood: h.mood, arousal: h.arousal, drunk: h.drunk, ...h.traits }))
      if (v < 0 || v > 100) return `${k} out of range: ${v}`;
    return null;
  });
}
