import type { LogEntry, Params } from "@tc/core";
import { content } from "./content";

type T = (key: string, params?: Params) => string;

/**
 * Log params may carry references instead of ready text, so the log re-renders in any language:
 *   "@name:12"  -> a patron first name from content.names
 *   "some.key"  -> a translation key (used when the string is a known key)
 */
export function renderParams(params: Params | undefined, t: T, lang: string): Params | undefined {
  if (!params) return undefined;
  const out: Params = {};
  for (const [k, v] of Object.entries(params)) {
    if (typeof v !== "string") out[k] = v;
    else if (v.startsWith("@name:")) {
      const entry = content.names[Number(v.slice(6))];
      out[k] = entry ? ((entry as Record<string, string>)[lang] ?? entry.en) : "?";
    } else out[k] = t(v);
  }
  return out;
}

/**
 * A line as the player reads it. A key with several wordings ("key", "key#2", "key#3") shows one of them, picked by
 * when the line was logged: the same entry always reads the same, the next one of its kind reads differently.
 * The game itself rolls nothing for this, so adding wordings never shifts a seed.
 */
export const renderLog = (e: LogEntry, t: T, lang: string) => {
  const text = t(e.key.includes("#") ? e.key : variantKey(e.key, (n) => wordingOf(e) % n), renderParams(e.params, t, lang));
  return lang === "ru" ? declineRu(text) : text;
};

// --- Russian: a guest's name after a preposition takes its case ("к Феликсу", "у Павла", "с Адамом") ---------------------
// The lines carry {name} in one form; rather than a case mark in every template, the finished line is read once:
// a known name right after a preposition (or after a few nouns that take the genitive) is put in the case that word asks for.
type Case = "gen" | "dat" | "acc" | "ins" | "prep";
const RU_NAMES = new Set(content.names.map((n) => (n as Record<string, string>).ru).filter((x): x is string => !!x));
const STEMS: Record<string, string> = { Пётр: "Петр", Павел: "Павл" };
const PREP: Record<string, Case> = {
  к: "dat", ко: "dat", у: "gen", от: "gen", для: "gen", без: "gen", до: "gen", из: "gen", после: "gen", возле: "gen", около: "gen", мимо: "gen", против: "gen",
  с: "ins", со: "ins", за: "ins", перед: "ins", над: "ins", под: "ins", рядом: "ins", между: "ins", на: "acc", про: "acc", через: "acc", о: "prep", об: "prep",
  // a couple of verbs that take him as their object ("берёт Дениса за руку", "позволяет Игорю")
  берёт: "acc", позволяет: "dat",
};
const NOUN_GEN = ["столу", "столика", "столик", "столиком", "стола", "стол", "номер", "номере", "комнату", "комнате", "куртку", "взгляд", "руку", "рука", "руке", "ладонь", "пальцы", "колени", "коленях", "бугор", "член", "голос", "плечо", "шею", "лицо", "дверь"];
export function declineName(name: string, c: Case): string {
  const last = name.slice(-1);
  if ("оеэиуюы".includes(last)) return name; // Лео, Бруно, Генри: they stay as they are
  if (last === "а") return name.slice(0, -1) + { gen: "гкхжшчщ".includes(name.slice(-2, -1)) ? "и" : "ы", dat: "е", acc: "у", ins: "ой", prep: "е" }[c];
  if (last === "я") return name.slice(0, -1) + { gen: "и", dat: "е", acc: "ю", ins: "ей", prep: "е" }[c];
  if (last === "й") return name.slice(0, -1) + { gen: "я", dat: "ю", acc: "я", ins: "ем", prep: name.endsWith("ий") ? "и" : "е" }[c];
  if (last === "ь") return name.slice(0, -1) + { gen: "я", dat: "ю", acc: "я", ins: "ем", prep: "е" }[c];
  const stem = STEMS[name] ?? name;
  return stem + { gen: "а", dat: "у", acc: "а", ins: "жшчщц".includes(last) ? "ем" : "ом", prep: "е" }[c];
}
const cap = (w: string) => w[0]!.toUpperCase() + w.slice(1);
const WORDS = [...Object.keys(PREP), ...NOUN_GEN].flatMap((w) => [w, cap(w)]).sort((x, y) => y.length - x.length);
const NAME_AFTER = new RegExp(`(^|[^А-Яа-яЁё])(${WORDS.join("|")})(\\s+)([А-ЯЁ][а-яё]+)(?![а-яё])`, "g");
export function declineRu(text: string): string {
  return text.replace(NAME_AFTER, (m, pre: string, word: string, gap: string, name: string) => {
    if (!RU_NAMES.has(name)) return m;
    const c = PREP[word.toLowerCase()] ?? "gen";
    return `${pre}${word}${gap}${declineName(name, c)}`;
  });
}
function wordingOf(e: LogEntry): number {
  const text = `${e.key}|${e.day}|${e.minute}|${e.turn}`;
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return (h >>> 7) >>> 0;
}
export const patronName = (nameIndex: number, lang: string) => {
  const entry = content.names[nameIndex];
  return entry ? ((entry as Record<string, string>)[lang] ?? entry.en) : "?";
};

const variantCount = new Map<string, number>();
for (const key of Object.keys(content.locales.en ?? {})) {
  const [base, n] = key.split("#");
  if (n) variantCount.set(base!, Math.max(variantCount.get(base!) ?? 1, Number(n)));
}
/**
 * A line can have several wordings: "some.key", "some.key#2", "some.key#3" in the locale files.
 * Picks one with the given roll (0..count-1 -> index) so the log does not repeat itself.
 */
export function variantKey(key: string, roll: (count: number) => number): string {
  const count = variantCount.get(key) ?? 1;
  if (count <= 1) return key;
  const i = roll(count);
  return i === 0 ? key : `${key}#${i + 1}`;
}
