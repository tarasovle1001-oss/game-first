import { describe, expect, it } from "vitest";
import { baseLocales, baseMod } from "@tc/base";
import { createEngine } from "@tc/core";
import type { GameState } from "@tc/core";
import { randomStrategy } from "../src";

const engine = createEngine([baseMod]);
const ru = baseLocales.ru!;
const en = baseLocales.en!;
const looksLikeKey = (v: unknown): v is string => typeof v === "string" && /^[a-z]+(\.[a-z0-9_]+)+$/.test(v) && !v.startsWith("@");

/** Plays with a bot that presses everything, and collects every text key the game shows on the way. */
function keysOfRun(seed: number, setup: Record<string, unknown>, days: number): Set<string> {
  const keys = new Set<string>();
  let s: GameState = engine.init(seed, { base: setup as never });
  let x = seed * 7919;
  const roll = () => ((x = (x * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  let seen = 0;
  for (let i = 0; i < 6000 && s.time.day <= days; i++) {
    const actions = engine.listActions(s);
    for (const a of actions) {
      const def = engine.actionDef(a.type);
      if (!def) continue;
      keys.add(def.labelKey);
      const d = def.describe?.(a);
      if (d) {
        keys.add(d.key);
        for (const v of Object.values(d.params ?? {})) if (looksLikeKey(v)) keys.add(v);
      }
    }
    s = engine.dispatch(s, randomStrategy(actions, s, roll));
    const fresh = s.log.filter((e) => e.turn > seen);
    for (const e of fresh) {
      keys.add(e.key);
      for (const v of Object.values(e.params ?? {})) if (looksLikeKey(v)) keys.add(v);
    }
    seen = s.turn;
  }
  return keys;
}

describe("every text the game can show exists", () => {
  it("in both languages, across a few very different games played by a bot that presses everything", () => {
    const keys = new Set<string>();
    for (const [seed, setup] of [
      [3, { preset: "hungry", mode: "open" }],
      [5, { preset: "curious" }],
      [8, { preset: "hungry", traits: { confidence: 80 }, husband: { size: 9 } }],
      [11, { preset: "ordinary" }],
    ] as [number, Record<string, unknown>][])
      for (const k of keysOfRun(seed, setup, 9)) keys.add(k);
    const missing = [...keys].filter((k) => !(k in ru) || !(k in en)).sort();
    expect(missing).toEqual([]);
    expect(keys.size).toBeGreaterThan(400);
    // the run really went through the newer parts of the game, not just the first afternoon
    const reached = (prefix: string) => [...keys].some((k) => k.startsWith(prefix));
    const parts = ["log.moment.", "log.fin.", "log.bed.", "thought.", "log.morning.", "action.wish.", "action.allow.", "log.group.", "log.night."];
    expect(parts.filter((p) => !reached(p))).toEqual([]);
  });
});
