// How she says it. The same answer sounds different when she is drunk, worn out, cold with him or glad of him;
// a "no" has a reason and says it; and what she last answered is kept for the card under the scene.
import type { Ctx, GameState } from "@tc/core";
import { content } from "../content";
import { bs } from "../state";
import type { Verdict } from "../state";

export type Voice = "drunk" | "tired" | "cold" | "warm" | "plain";
const V = { drunk: 50, tired: 25, coldResent: 45, coldMood: 30, coldAnger: 30, warmMood: 70, warmDesire: 55, warmTender: 30 };

/** The state that colours her words right now. One at a time: the strongest wins. */
export function voiceOf(state: GameState): Voice {
  const h = bs(state).heroine;
  if (h.drunk >= V.drunk) return "drunk";
  if (h.energy < V.tired) return "tired";
  if (h.marriage.resent >= V.coldResent || h.mood < V.coldMood || (h.feel?.anger ?? 0) >= V.coldAnger) return "cold";
  if ((h.mood >= V.warmMood && h.marriage.desire >= V.warmDesire) || (h.feel?.tenderness ?? 0) >= V.warmTender) return "warm";
  return "plain";
}
const has = (key: string) => content.locales.ru?.[key] !== undefined;
/** The line for her state, when the texts have one; otherwise the plain line. */
export function voiced(state: GameState, key: string): string {
  const v = voiceOf(state);
  return v !== "plain" && has(`${key}.${v}`) ? `${key}.${v}` : key;
}
/** Tags for a line of hers that has no drunk variant of its own: the screen slurs her quotes. */
export const slurTags = (state: GameState, key: string, tags?: string[]): string[] | undefined => (voiceOf(state) === "drunk" && !key.endsWith(".drunk") ? [...(tags ?? []), "slur"] : tags);

// which reason a row of the consent formula stands for, when it is the one that tipped her into "no"
const WHY: Record<string, string> = {
  tired: "tired", sore: "sore", resent: "resent", annoyed: "annoyed", fed_up: "annoyed", mood: "mood", satisfied: "sated", asleep: "asleep",
  feelings: "feelings", trust: "trust", desire: "cold", power_denies: "power", act: "not_her", openness: "not_her", taste: "not_her", jump: "too_fast",
  fidelity: "faithful", witnesses: "public", plain_sight: "public", crowd: "public", husband: "husband", expect: "forbidden", stance: "forbidden", directive: "forbidden",
  affinity: "him", stranger: "him", type_taste: "him", drunk_guest: "him", pressure: "pushed", work: "work", size: "size",
};
/** Why she said no: the row that pulled hardest against it. */
export function refusalWhy(rows: { id: string; value: number }[]): string {
  const worst = rows.filter((r) => r.value < 0).sort((a, b) => a.value - b.value)[0];
  if (!worst) return "plain";
  return WHY[worst.id.replace(/^consent\./, "")] ?? "plain";
}
/** The reason-specific version of a refusal line, when the texts have one. */
export function refusalKey(base: string, rows: { id: string; value: number }[]): string {
  const key = `${base}.${refusalWhy(rows)}`;
  return has(key) ? key : base;
}

export type Outcome = "wants" | "agrees" | "unsure" | "away" | "upset";
export const outcomeOf = (verdict: Verdict): Outcome => (verdict === "eager" ? "wants" : verdict === "hesitant" ? "unsure" : "away");
/** Remember how she took the last thing asked of her, for the card under the scene. `seen`: her husband could tell. */
export function setOutcome(ctx: Ctx, how: Outcome, who: string, seen = true) {
  bs(ctx.state).outcome = { turn: ctx.state.turn, day: ctx.state.time.day, minute: ctx.state.time.minute, how, who, seen };
}
