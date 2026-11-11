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

export const renderLog = (e: LogEntry, t: T, lang: string) => t(e.key, renderParams(e.params, t, lang));
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
