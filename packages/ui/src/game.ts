// One place where the UI learns which mods make up the game.
import { baseLocales, baseMod } from "@tc/base";
import { createEngine, createTranslator } from "@tc/core";
import type { Params } from "@tc/core";
import { cheatsLocales, cheatsMod } from "@tc/mod-cheats";
import { exampleLocales, exampleMod } from "@tc/mod-example";

export const mods = [baseMod, exampleMod, cheatsMod];
export const engine = createEngine(mods);
export type Lang = "en" | "ru";
export type T = (key: string, params?: Params) => string;

const dicts = { en: [baseLocales.en!, exampleLocales.en!, cheatsLocales.en!], ru: [baseLocales.ru!, exampleLocales.ru!, cheatsLocales.ru!] };
export const translator = (lang: Lang): T => createTranslator(dicts, lang);

export const SAVE_KEY = "test-city.save";
/** The only non-deterministic input of the whole game, kept outside the core. */
export const newSeed = () => (Date.now() % 2147483647) | 0;
