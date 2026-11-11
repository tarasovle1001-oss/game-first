import { describe, expect, it } from "vitest";
import { baseMod, bs, inspect, resetTracer, tracer, WAIT } from "@tc/base";
import { CORE_ADVANCE, createEngine } from "@tc/core";
import type { GameState } from "@tc/core";

const play = (traced: boolean, seed: number) => {
  const engine = createEngine([baseMod]);
  let state = engine.init(seed);
  const steps: [GameState, GameState][] = [];
  const act = (pick: (list: ReturnType<typeof engine.listActions>) => ReturnType<typeof engine.listActions>[number] | undefined) => {
    const a = pick(engine.listActions(state));
    if (!a) return;
    resetTracer();
    engine.setTracer(traced ? tracer : null);
    const next = engine.dispatch(state, a);
    steps.push([state, next]);
    state = next;
  };
  act((l) => l.find((a) => a.type === CORE_ADVANCE)); // into the shift
  for (let i = 0; i < 12; i++) act((l) => l.find((a) => a.type === WAIT && !a.payload?.until) ?? l.find((a) => a.type === WAIT));
  return { state, steps };
};
const bare = (s: GameState) => {
  const copy = structuredClone(s);
  delete bs(copy).trace;
  return copy;
};

describe("inspector", () => {
  it("does not change how the game plays", () => {
    const plain = play(false, 7).state;
    const traced = play(true, 7).state;
    expect(bare(traced)).toEqual(bare(plain));
  });

  it("puts every change of her fast stats down to somebody", () => {
    const { steps } = play(true, 11);
    let rows = 0;
    for (const [prev, next] of steps) {
      const ins = inspect(prev, next);
      expect(ins.minutes).toBeGreaterThanOrEqual(0);
      for (const r of ins.rows) {
        expect(r.delta).not.toBe(0);
        if (!r.id.startsWith("her.") || Math.abs(r.delta) < 0.3) continue;
        rows += 1;
        const explained = r.via.reduce((s, v) => s + (v.amount ?? 0), 0);
        // the sources add up to the change, give or take rounding
        expect(Math.abs(explained - r.delta)).toBeLessThan(0.35);
      }
    }
    expect(rows).toBeGreaterThan(0);
  });

  it("says nothing changed when nothing did", () => {
    const engine = createEngine([baseMod]);
    const state = engine.init(3);
    expect(inspect(state, state).rows).toEqual([]);
  });
});
