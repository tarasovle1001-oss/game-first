// Cheats for testing, written as a mod. Nothing here is offered to the player or to bots:
// the actions are never enumerated, the debug panel dispatches them directly and `accepts` validates them.
import { attendTo, bs, clamp, content, generatePatron, HOTEL_ROOMS, seat } from "@tc/base";
import { CHEAT_STAGE } from "./scenarios";
export { CHEAT_STAGE, SCENARIOS, runScenario } from "./scenarios";
export type { Scenario } from "./scenarios";
import type { Dict, GameState, Mod } from "@tc/core";

export const CHEAT_SET = "cheats/set";
export const CHEAT_MODE = "cheats/mode";
export const CHEAT_STYLE = "cheats/husband-style";
export const CHEAT_END_SHIFT = "cheats/end-shift";
export const CHEAT_PRESET = "cheats/preset";
export const CHEAT_PRESETS = ["fresh", "sober", "calm", "nofeel"] as const;

export interface CheatField {
  path: string; // inside state.mods.base
  min: number;
  max: number;
  group: "business" | "her" | "character" | "body" | "couple" | "him";
  labelKey: string;
}

const stat = (path: string, labelKey: string, group: CheatField["group"], min = 0, max = 100): CheatField => ({ path, labelKey, group, min, max });
export const CHEAT_FIELDS: CheatField[] = [
  stat("money", "ui.money", "business", 0, 1_000_000),
  stat("debt", "ui.debt", "business", 0, 1_000_000),
  stat("reputation", "ui.reputation", "business"),
  stat("stock", "ui.stock", "business", 0, 10_000),
  stat("clean", "ui.clean", "business"),
  stat("gossip", "ui.gossip", "business"),
  stat("heroine.energy", "stat.energy", "her"),
  stat("heroine.mood", "stat.mood", "her"),
  stat("heroine.arousal", "stat.arousal", "her"),
  stat("heroine.drunk", "stat.drunk", "her"),
  stat("heroine.satisfied", "stat.satisfied", "her"),
  stat("heroine.frustration", "stat.frustration", "her"),
  stat("heroine.annoyance", "ui.annoy.guests", "her"),
  stat("heroine.annoyHim", "ui.annoy.him", "her"),
  stat("heroine.traits.openness", "trait.openness", "character"),
  stat("heroine.traits.confidence", "trait.confidence", "character"),
  stat("heroine.traits.fidelity", "trait.fidelity", "character"),
  stat("heroine.traits.honesty", "trait.honesty", "character"),
  stat("heroine.traits.libido", "trait.libido", "character"),
  stat("heroine.sizeTaste", "stat.sizeTaste", "character"),
  stat("heroine.body.vagina.stretch", "zone.vagina", "body"),
  stat("heroine.body.anus.stretch", "zone.anus", "body"),
  stat("heroine.body.mouth.stretch", "zone.mouth", "body"),
  stat("heroine.marriage.trust", "ui.trust", "couple"),
  stat("heroine.marriage.desire", "stat.desire", "couple"),
  stat("heroine.marriage.resent", "stat.resent", "couple"),
  stat("suspicion", "ui.suspicion", "couple"),
  stat("power", "ui.power", "couple"),
  stat("heroine.feel.pity", "emotion.pity", "couple"),
  stat("husband.size", "cheats.husband.size", "couple", 5, 30),
  stat("husband.minutes", "cheats.husband.minutes", "couple", 1, 60),
  stat("husband.stretch", "cheats.husband.stretch", "him"),
  stat("husband.energy", "inspect.him.energy", "him"),
  stat("husband.mood", "inspect.him.mood", "him"),
  stat("husband.arousal", "inspect.him.arousal", "him"),
];
const fields = new Map(CHEAT_FIELDS.map((f) => [f.path, f]));

export const readField = (state: GameState, path: string): number =>
  (path.split(".").reduce((o: any, k) => o?.[k], bs(state) as any) as number | undefined) ?? 0;

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
        if (last === "stretch" && typeof target.peak === "number") target.peak = Math.max(target.peak, value); // her body keeps peak >= stretch; his has no peak
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

    // One-click resets, so that a test starts from a known woman.
    api.actions.register({
      id: CHEAT_PRESET,
      labelKey: "cheats.preset",
      describe: (a) => ({ key: `cheats.preset.${a.payload!.id}` }),
      enumerate: () => [],
      accepts: (_s, action) => (CHEAT_PRESETS as readonly string[]).includes(String(action.payload?.id)),
      apply(ctx, action) {
        const h = bs(ctx.state).heroine;
        const id = action.payload!.id as (typeof CHEAT_PRESETS)[number];
        if (id === "fresh") {
          h.energy = 100;
          h.mood = Math.max(h.mood, 70);
          h.sore = {};
        } else if (id === "sober") h.drunk = 0;
        else if (id === "calm") {
          h.annoyance = 0;
          h.annoyHim = 0;
        } else if (id === "nofeel") for (const e of ["anger", "contempt", "guilt", "shame", "disgust", "fear"] as const) delete h.feel?.[e];
      },
    });

    // "Stage": what a test start cannot simply wait for. Only scenarios use it (see scenarios.ts).
    const STAGES = ["group", "tray_now", "guest_hot", "ask_reluctant", "lodger_up", "her_to_lodger", "sauna", "sauna_guest", "rich", "drinker", "toys", "solo_soon", "her_wants", "restless"];
    api.actions.register({
      id: CHEAT_STAGE,
      labelKey: "cheats.stage",
      enumerate: () => [],
      accepts: (state, action) => {
        const what = String(action.payload?.what);
        if (!STAGES.includes(what)) return false;
        const sh = bs(state).shift;
        if (["group", "tray_now", "guest_hot", "ask_reluctant", "lodger_up", "her_to_lodger", "sauna_guest", "rich"].includes(what)) return state.time.phase === "shift" && !!sh;
        if (what === "solo_soon") return state.time.phase === "prep" && !!bs(state).day;
        if (what === "her_wants" || what === "restless") return state.time.phase === "night" && !!bs(state).night;
        return true;
      },
      apply(ctx, action) {
        const b = bs(ctx.state);
        const h = b.heroine;
        const sh = b.shift;
        const what = String(action.payload!.what);
        const guest = (tune: (p: ReturnType<typeof generatePatron>) => void, at?: string) => {
          const p = generatePatron(ctx);
          p.memory.visits = 2;
          p.memory.lastDay = ctx.state.time.day;
          tune(p);
          seat(ctx, p, false, { ...(at ? { at } : {}), stay: 240 });
          const v = sh!.visits.find((x) => x.patron === p.id)!;
          v.served = 1;
          v.sinceOrder = 0;
          return { p, v };
        };
        switch (what) {
          case "group":
            if (action.payload!.sauna && !b.upgrades.includes("sauna")) b.upgrades.push("sauna");
            sh!.groupAt = sh!.tick + 1;
            break;
          case "tray_now":
            if (sh!.group) sh!.group.nextTray = sh!.tick;
            break;
          case "guest_hot": {
            const { v } = guest((p) => {
              p.memory.interest = 85;
              p.memory.affinity = 40;
              p.memory.tier = Math.max(p.memory.tier, 2);
            });
            v.heat = 50;
            v.tier = 2;
            break;
          }
          case "ask_reluctant": {
            const v = sh!.visits.find((x) => !x.group) ?? guest((p) => void (p.memory.interest = 80)).v;
            b.ask = { patron: v.patron, act: "grope", tick: sh!.tick, tone: "reluctant" };
            ctx.state.where.wife = ctx.state.where.husband!;
            ctx.log("log.ask.her.reluctant", { name: `@name:${b.patrons[v.patron]!.name}`, act: "act.grope" });
            break;
          }
          case "lodger_up": {
            const room = HOTEL_ROOMS.find((r) => !b.lodgers[r]) ?? HOTEL_ROOMS[0]!;
            const { p, v } = guest((x) => {
              x.memory.interest = 70;
              x.memory.affinity = 35;
            }, room);
            b.lodgers[room] = { patron: p.id, nights: 2 };
            v.atUntil = sh!.tick + 90;
            break;
          }
          case "her_to_lodger": {
            const entry = Object.entries(b.lodgers).find(([room, l]) => ctx.state.where[l.patron] === room);
            if (entry) attendTo(ctx, entry[0], 10, "room", entry[1].patron);
            break;
          }
          case "sauna":
            if (!b.upgrades.includes("sauna")) b.upgrades.push("sauna");
            break;
          case "sauna_guest": {
            if (!b.upgrades.includes("sauna")) b.upgrades.push("sauna");
            const { v } = guest((p) => {
              p.memory.interest = 75;
              p.memory.affinity = 30;
            }, "cafe.sauna");
            v.atUntil = sh!.tick + 60;
            v.heat = 60;
            v.drunk = 45;
            v.sinceOrder = content.balance.shift.orderEveryMinutes; // he wants his next one now
            break;
          }
          case "rich":
            guest((p) => {
              p.rich = true;
              p.approach = "pay";
              p.traits.generosity = 95;
              p.memory.interest = 70;
            });
            break;
          case "drinker":
            h.latents.likes_drink = true;
            break;
          case "toys":
            for (const t of content.day.shop.toys) if (!b.toys.includes(t.id)) b.toys.push(t.id);
            break;
          case "solo_soon":
            b.soloDay = undefined;
            b.solo = { at: b.day!.left - 1, zone: "vagina" };
            h.frustration = Math.max(h.frustration, 40);
            break;
          case "her_wants":
            b.night!.wants = true;
            b.night!.scene = "wants_him";
            b.night!.herAsleep = undefined;
            h.arousal = Math.max(h.arousal, 60);
            h.marriage.desire = Math.max(h.marriage.desire, 70);
            h.energy = Math.max(h.energy, 60);
            break;
          case "restless":
            h.arousal = clamp(Math.max(h.arousal, 70));
            h.satisfied = 0;
            h.frustration = Math.max(h.frustration, 50);
            b.night!.smallAt = (b.night!.minute ?? 0) + 70;
            break;
        }
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
    "cheats.group.him": "You",
    "cheats.preset": "Reset",
    "cheats.preset.fresh": "Fresh",
    "cheats.preset.sober": "Sober",
    "cheats.preset.calm": "Annoyance 0",
    "cheats.preset.nofeel": "Clear bad feelings",
    "cheats.hint": "F9 closes · Backspace undoes",
    "cheats.stage": "Stage a moment",
    "cheats.scenarios": "Test starts",
    "cheats.scenarios.hint": "A new game, played up to the moment. Wife and mode: as in the scenario, or your pick",
    "cheats.scenario.wife": "Wife",
    "cheats.scenario.mode": "Mode",
    "cheats.scenario.own": "as in the scenario",
    "cheats.scenario.failed": "Did not get there: {why}",
    "cheats.bookmarks": "Bookmarks",
    "cheats.bookmark.add": "Bookmark this moment",
    "cheats.bookmark.go": "Back to it",
    "cheats.bookmark.del": "Delete",
    "cheats.bookmark.none": "None yet",
    "cheats.scenario.company_lounge": "Company at the door (back room)",
    "cheats.scenario.company_sauna": "Company at the door (sauna)",
    "cheats.scenario.company_tray": "Company calls for a tray",
    "cheats.scenario.hot_guest": "A worked-up guest in the hall",
    "cheats.scenario.reluctant_ask": "\"I don't like it, what do I do?\"",
    "cheats.scenario.lodger_up": "Lodger upstairs, she goes to him",
    "cheats.scenario.sauna_guest": "A guest in the sauna, she brings a drink",
    "cheats.scenario.husband_away": "You are in town, the evening started without you",
    "cheats.scenario.rich_guest": "A rich guest",
    "cheats.scenario.drunk_evening": "A drinking evening",
    "cheats.scenario.her_solo": "Her alone in the afternoon",
    "cheats.scenario.his_solo": "You alone, toys in the drawer",
    "cheats.scenario.night_wants": "Night: she wants you",
    "cheats.scenario.femdom": "Night: femdom",
    "cheats.scenario.small_hours": "Night: the small hours (sleep by steps)",
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
    "cheats.group.him": "Ты",
    "cheats.preset": "Сброс",
    "cheats.preset.fresh": "Свежая",
    "cheats.preset.sober": "Трезвая",
    "cheats.preset.calm": "Раздражение 0",
    "cheats.preset.nofeel": "Убрать плохие чувства",
    "cheats.hint": "F9 закрыть · Backspace отменить",
    "cheats.stage": "Подстроить момент",
    "cheats.scenarios": "Тест-старты",
    "cheats.scenarios.hint": "Новая игра, сразу доигранная до момента. Жена и режим: как в сценарии или свои",
    "cheats.scenario.wife": "Жена",
    "cheats.scenario.mode": "Режим",
    "cheats.scenario.own": "как в сценарии",
    "cheats.scenario.failed": "Не дошло до момента: {why}",
    "cheats.bookmarks": "Закладки",
    "cheats.bookmark.add": "Запомнить этот момент",
    "cheats.bookmark.go": "Вернуться",
    "cheats.bookmark.del": "Удалить",
    "cheats.bookmark.none": "Пока нет",
    "cheats.scenario.company_lounge": "Компания у двери (малый зал)",
    "cheats.scenario.company_sauna": "Компания у двери (сауна)",
    "cheats.scenario.company_tray": "Компания зовёт с подносом",
    "cheats.scenario.hot_guest": "Заведённый гость в зале",
    "cheats.scenario.reluctant_ask": "\"Мне не нравится, что делать?\"",
    "cheats.scenario.lodger_up": "Постоялец наверху, она идёт к нему",
    "cheats.scenario.sauna_guest": "Гость в сауне, она несёт напиток",
    "cheats.scenario.husband_away": "Ты в городе, смена началась без тебя",
    "cheats.scenario.rich_guest": "Богатый гость",
    "cheats.scenario.drunk_evening": "Пьяный вечер",
    "cheats.scenario.her_solo": "Её сольное днём",
    "cheats.scenario.his_solo": "Твоё сольное, игрушки в ящике",
    "cheats.scenario.night_wants": "Ночь: она хочет тебя",
    "cheats.scenario.femdom": "Ночь: фемдом",
    "cheats.scenario.small_hours": "Ночь: мелкие часы (сон по шагам)",
  },
};
