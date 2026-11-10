import type { Params } from "./types";

export type Dict = Record<string, string>;

/** Flat key lookup with {name} placeholders. Falls back to `fallback` language, then to the key itself. */
export function createTranslator(dicts: Record<string, Dict[]>, lang: string, fallback = "en") {
  const merge = (l: string) => Object.assign({}, ...(dicts[l] ?? [])) as Dict;
  const main = merge(lang);
  const back = merge(fallback);
  return (key: string, params?: Params): string => {
    const raw = main[key] ?? back[key] ?? key;
    return params ? raw.replace(/\{(\w+)\}/g, (m, name) => (name in params ? String(params[name]) : m)) : raw;
  };
}

/** Keys present in `from` but missing in `to`. Used by the build check. */
export function missingKeys(from: Dict, to: Dict): string[] {
  return Object.keys(from).filter((k) => !(k in to));
}
