// Cheats for testing, written as a mod. Nothing here is offered to the player or to bots:
// the actions are never enumerated, the debug panel dispatches them directly and `accepts` validates them.
import { bs } from "@tc/base";
import type { Dict, GameState, Mod } from "@tc/core";

export const CHEAT_SET = "cheats/set";
export const CHEAT_MODE = "cheats/mode";
export const CHEAT_STYLE = "cheats/husband-style";
export const CHEAT_END_SHIFT = "cheats/end-shift";

export interface CheatField {
  path: string; // inside state.mods.base
  min: number;
  max: number;
  group: "business" | "her" | "character" | "body" | "couple";
  labelKey: string;
}

const stat = (path: string, labelKey: string, group: CheatField["group"], min = 0, max = 100): CheatField => ({ path, labelKey, group, min, max });
export const CHEAT_FIELDS: CheatField[] = [
  stat("money", "ui.money", "business", 0, 1_000_000),
  stat("debt", "ui.debt", "business", 0, 1_000_000),
  stat("reputation", "ui.reputation", "business"),
  stat("stock", "ui.stock", "business", 0, 10_000),
  stat("heroine.energy", "stat.energy", "her"),
  stat("heroine.mood", "stat.mood", "her"),
  stat("heroine.arousal", "stat.arousal", "her"),
  stat("heroine.drunk", "stat.drunk", "her"),
  stat("heroine.satisfied", "stat.satisfied", "her"),
  stat("heroine.traits.openness", "trait.openness", "character"),
  stat("heroine.traits.confidence", "trait.confidence", "character"),
  stat("heroine.traits.fidelity", "trait.fidelity", "character"),
  stat("heroine.traits.honesty", "trait.honesty", "character"),
  stat("heroine.traits.libido", "trait.libido", "character"),
  stat("heroine.sizeTaste", "stat.sizeTaste", "character"),
  stat("heroine.body.vagina.stretch", "zone.vagina", "body"),
  stat("heroine.body.anus.stretch", "zone.anus", "body"),
  stat("heroine.body.mouth.stretch", "zone.mouth", "body"),
  stat("heroine.marriage.desire", "stat.desire", "couple"),
  stat("heroine.marriage.resent", "stat.resent", "couple"),
  stat("suspicion", "ui.suspicion", "couple"),
  stat("power", "ui.power", "couple"),
  stat("husband.size", "cheats.husband.size", "couple", 5, 30),
  stat("husband.minutes", "cheats.husband.minutes", "couple", 1, 60),
];
const fields = new Map(CHEAT_FIELDS.map((f) => [f.path, f]));

export const readField = (state: GameState, path: string): number =>
  path.split(".").reduce((o: any, k) => o?.[k], bs(state) as any) as number;

export const cheatsMod: Mod = {
  id: "cheats",
  version: 1,
  requires: ["base"],
  register(api) {
    api.actions.register({
      id: CHEAT_SET,
      labelKey: "cheats.set",
      enumerate: () => [],
      accepts(_state, action) {
        const f = fields.get(String(action.payload?.path));
        const v = action.payload?.value;
        return Boolean(f) && typeof v === "number" && Number.isFinite(v) && v >= f!.min && v <= f!.max;
      },
      apply(ctx, action) {
        const path = String(action.payload!.path).split(".");
        const value = action.payload!.value as number;
        const last = path.pop()!;
        const target = path.reduce((o: any, k) => o[k], bs(ctx.state) as any);
        target[last] = last === "money" || last === "debt" || last === "stock" ? Math.round(value) : value;
        if (last === "stretch") target.peak = Math.max(target.peak, value); // keep the body rule: peak >= stretch
      },
    });

    api.actions.register({
      id: CHEAT_MODE,
      labelKey: "cheats.mode",
      enumerate: () => [],
      accepts: (state, action) => ["hidden", "open"].includes(String(action.payload?.mode)) && !bs(state).caught,
      apply(ctx, action) {
        const b = bs(ctx.state);
        b.mode = action.payload!.mode as "hidden" | "open";
        b.secretKnows = false;
        if (b.mode === "open") b.suspicion = 100;
      },
    });

    api.actions.register({
      id: CHEAT_STYLE,
      labelKey: "cheats.style",
      enumerate: () => [],
      accepts: (_s, action) => ["naive", "jealous", "encouraging"].includes(String(action.payload?.style)),
      apply(ctx, action) {
        bs(ctx.state).husband.style = action.payload!.style as "naive" | "jealous" | "encouraging";
      },
    });

    // Jumps to closing time: the rest of the evening simply does not happen.
    api.actions.register({
      id: CHEAT_END_SHIFT,
      labelKey: "cheats.end_shift",
      enumerate: () => [],
      accepts: (state) => state.time.phase === "shift" && !bs(state).caught,
      apply(ctx) {
        bs(ctx.state).shift!.tick = 10_000;
      },
    });
  },
};

export const cheatsLocales: Record<string, Dict> = {
  en: {
    "cheats.set": "Set a value",
    "cheats.mode": "Switch NTR / NTS",
    "cheats.style": "Husband style",
    "cheats.end_shift": "End the shift now",
    "cheats.title": "Cheats",
    "cheats.husband.size": "Husband size, cm",
    "cheats.husband.minutes": "Husband lasts, min",
    "cheats.group.business": "Business",
    "cheats.group.her": "Her state",
    "cheats.group.character": "Her character",
    "cheats.group.body": "Her body",
    "cheats.group.couple": "The two of you",
  },
  ru: {
    "cheats.set": "Задать значение",
    "cheats.mode": "Переключить NTR / NTS",
    "cheats.style": "Стиль мужа",
    "cheats.end_shift": "Закончить смену сейчас",
    "cheats.title": "Читы",
    "cheats.husband.size": "Размер мужа, см",
    "cheats.husband.minutes": "Мужа хватает на, мин",
    "cheats.group.business": "Дела",
    "cheats.group.her": "Её состояние",
    "cheats.group.character": "Её характер",
    "cheats.group.body": "Её тело",
    "cheats.group.couple": "Вы двое",
  },
};
