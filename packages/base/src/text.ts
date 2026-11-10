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
