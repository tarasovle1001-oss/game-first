// One place where the UI learns which mods make up the game, including mods loaded from files at runtime.
import * as base from "@tc/base";
import * as core from "@tc/core";
import type { Dict, Engine, GameState, Mod, Params } from "@tc/core";
import { cheatsLocales, cheatsMod } from "@tc/mod-cheats";

export type Lang = "en" | "ru";
export type T = (key: string, params?: Params) => string;

/** A mod as the UI sees it: the mod itself plus its texts. */
export interface ModPack {
  mod: Mod;
  locales?: Record<string, Dict>;
  builtIn?: boolean;
}

const builtIn: ModPack[] = [
  { mod: base.baseMod, locales: base.baseLocales, builtIn: true },
  { mod: cheatsMod, locales: cheatsLocales, builtIn: true },
];

export interface Game {
  packs: ModPack[];
  mods: Mod[];
  engine: Engine;
  translator(lang: Lang): T;
}

export function makeGame(extra: ModPack[] = []): Game {
  const packs = [...builtIn, ...extra];
  const mods = packs.map((p) => p.mod);
  const dicts: Record<string, Dict[]> = { en: [], ru: [] };
  for (const p of packs) for (const [lang, d] of Object.entries(p.locales ?? {})) (dicts[lang] ??= []).push(d);
  return { packs, mods, engine: core.createEngine(mods), translator: (lang) => core.createTranslator(dicts, lang) };
}

/** The game the UI is showing right now. Replaced as a whole when the set of mods changes. */
export let game: Game = makeGame();
export let engine: Engine = game.engine;
export function setGame(next: Game) {
  game = next;
  engine = next.engine;
}

/**
 * Runs a mod file picked by the player. The file calls TestCity.defineMod({ mod, locales }) and can use
 * everything the built-in mods use: TestCity.core and TestCity.base are the same modules.
 */
export function readModFile(source: string): ModPack {
  let pack: ModPack | null = null;
  const TestCity = { core, base, defineMod: (p: ModPack) => void (pack = p) };
  new Function("TestCity", source)(TestCity);
  const got = pack as ModPack | null;
  if (!got || !got.mod || typeof got.mod.id !== "string" || typeof got.mod.register !== "function")
    throw new Error("the file did not call TestCity.defineMod({ mod, locales })");
  if (builtIn.some((b) => b.mod.id === got.mod.id)) throw new Error(`mod id "${got.mod.id}" is taken by a built-in mod`);
  return { mod: got.mod, locales: got.locales };
}

/** Moves a running game onto a new set of mods: new mods get their starting state, the rest is kept. */
export function carryOver(state: GameState, from: Game, to: Game): GameState {
  return core.loadGame(core.saveGame(state, from.engine), to.mods).state;
}

export const SAVE_KEY = "test-city.save";
export const AUTOSAVE_KEY = "test-city.autosave";
/** The only non-deterministic input of the whole game, kept outside the core. */
export const newSeed = () => (Date.now() % 2147483647) | 0;

export function downloadText(name: string, text: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}
