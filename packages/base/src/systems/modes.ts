// NTR and NTS in one place (27.11). NTR = the hidden marriage (she hides it, he does not know), NTS = the open one (he knows, lets it be).
// Any log line can have a wording per mode without code: add "<key>@ntr" and/or "<key>@nts" to the locales and the line
// written in that mode is the variant (the plain key stays the fallback). For behaviour, systems ask ntr() / nts().
import type { GameState, ModApi } from "@tc/core";
import { content } from "../content";
import { bs } from "../state";

export const ntr = (state: GameState) => bs(state).mode === "hidden";
export const nts = (state: GameState) => bs(state).mode === "open";

const EN = content.locales.en ?? {};
const HAS = new Set(Object.keys(EN).filter((k) => k.endsWith("@ntr") || k.endsWith("@nts")));
/** The key of a line as it is written in this mode: its NTR / NTS wording when there is one. */
export function modeKey(state: GameState, key: string): string {
  if (!HAS.size || key.includes("@")) return key;
  const v = `${key}@${ntr(state) ? "ntr" : "nts"}`;
  return HAS.has(v) ? v : key;
}

export function registerModes(api: ModApi) {
  api.lines.resolve(modeKey);
}
