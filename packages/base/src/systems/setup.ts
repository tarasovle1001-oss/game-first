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
  /** What she is made of, 0..100 each: charm, wit, stamina, composure. */
  attrs?: Partial<Record<"charm" | "wit" | "stamina" | "composure", number>>;
  /** Her name, as the menus address her. */
  name?: string;
  /** What she has a taste for, 0..100 each (50 = neither way): oral, anal, show, romance, rough, drink. From 80 it is a side of her. */
  tastes?: Partial<Record<TasteId, number>>;
}
export const TASTES = ["oral", "anal", "show", "romance", "rough", "drink"] as const;
export type TasteId = (typeof TASTES)[number];
/** The hidden side a taste turns into at the top of its slider. */
export const TASTE_LATENT: Record<TasteId, string> = { oral: "oral_fixation", anal: "anal_lover", show: "exhibitionist", romance: "romantic", rough: "likes_rough", drink: "tipsy_loose" };

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
      if (typeof setup.name === "string" && setup.name.trim()) h.name = setup.name.trim().slice(0, 24);
      for (const id of TASTES) {
        const v = setup.tastes?.[id];
        if (typeof v !== "number") continue;
        h.prefs = { ...(h.prefs ?? {}), [id]: clamp(v) };
        // the slider is the last word on that side of her: on from 80, off below
        if (v >= 80) h.latents[TASTE_LATENT[id]] = true;
        else delete h.latents[TASTE_LATENT[id]];
        // what she does with her mouth, or takes behind, starts liked or disliked accordingly
        const zone = id === "oral" ? "mouth" : id === "anal" ? "anus" : null;
        if (zone) for (const a of content.acts) if (a.zones.includes(zone)) h.tastes.acts[a.id] = Math.round((v - 50) * 0.6);
      }
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
