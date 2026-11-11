// New-game choices: a preset or hand-set sliders. Applied once, at the very end of game:init.
import type { ModApi } from "@tc/core";
import { content } from "../content";
import { bs, clamp } from "../state";
import type { Husband, Mode } from "../state";

/** What the new-game screen can pass to engine.init(seed, { base: setup }). Every field is optional. */
export interface BaseSetup {
  preset?: string;
  traits?: Partial<Record<"openness" | "confidence" | "fidelity" | "honesty" | "libido", number>>;
  sizeTaste?: number;
  /** Exact set of hidden sides. Omit to let the preset and the dice decide. */
  latents?: string[];
  husband?: Partial<Husband>;
  mode?: Mode;
  desire?: number;
}

export function registerSetup(api: ModApi) {
  api.events.on(
    "game:init",
    (ctx, e) => {
      const setup = (e.payload?.setup as Record<string, unknown> | undefined)?.base as BaseSetup | undefined;
      if (!setup) return;
      const b = bs(ctx.state);
      const h = b.heroine;
      const preset = content.presets.find((p) => p.id === setup.preset);
      if (preset) {
        Object.assign(h.traits, preset.traits);
        h.sizeTaste = preset.sizeTaste;
        if (preset.noRandomLatents) h.latents = {};
        for (const id of preset.latents) h.latents[id] = true;
      }
      for (const [k, v] of Object.entries(setup.traits ?? {})) if (typeof v === "number") h.traits[k as keyof typeof h.traits] = clamp(v);
      if (typeof setup.sizeTaste === "number") h.sizeTaste = clamp(setup.sizeTaste);
      if (setup.latents) {
        h.latents = {};
        for (const id of setup.latents) if (content.latents.some((l) => l.id === id)) h.latents[id] = true;
      }
      if (typeof setup.desire === "number") h.marriage.desire = clamp(setup.desire);
      if (setup.husband) {
        const u = setup.husband;
        if (typeof u.size === "number") b.husband.size = clamp(u.size, 5, 30);
        if (typeof u.minutes === "number") b.husband.minutes = clamp(u.minutes, 1, 60);
        if (typeof u.stamina === "number") b.husband.stamina = clamp(Math.round(u.stamina), 1, 5);
        if (u.style === "naive" || u.style === "jealous" || u.style === "encouraging") b.husband.style = u.style;
      }
      if (setup.mode === "open") {
        b.mode = "open";
        b.suspicion = 100;
      }
    },
    -100, // after every system has rolled its own starting values
  );
}
