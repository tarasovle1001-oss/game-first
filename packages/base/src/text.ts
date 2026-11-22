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
export const renderLog = (e: LogEntry, t: T, lang: string) => t(e.key.includes("#") ? e.key : variantKey(e.key, (n) => wordingOf(e) % n), renderParams(e.params, t, lang));
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
