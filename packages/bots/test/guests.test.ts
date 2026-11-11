import { describe, expect, it } from "vitest";
import { baseMod, bs } from "@tc/base";
import { CORE_ADVANCE, createEngine } from "@tc/core";
import type { GameState } from "@tc/core";

const engine = createEngine([baseMod]);
const wait = (s: GameState, minutes: number) => engine.dispatch(s, { type: "base/wait", payload: { minutes } });
const toShift = (seed: number, setup?: Parameters<typeof engine.init>[1]): GameState => {
  let s = engine.init(seed, setup);
  while (s.time.phase !== "shift") s = engine.dispatch(s, { type: CORE_ADVANCE });
  for (const to of ["cafe.bar", "cafe.kitchen"]) {
    const move = engine.listActions(s).find((a) => a.type === "core/move" && a.payload?.to === to);
    if (move) s = engine.dispatch(s, move);
  }
  return s;
};

describe("a guest's evening", () => {
  it("men who have been served get drunker as the night goes on, and the keen ones get worked up", () => {
    let s = toShift(3);
    for (let i = 0; i < 12 && !bs(s).shift!.visits.some((v) => v.served > 0); i++) s = wait(s, 15);
    for (let i = 0; i < 4; i++) s = wait(s, 15);
    const visits = bs(s).shift!.visits;
    expect(visits.some((v) => (v.drunk ?? 0) > 0)).toBe(true);
    for (const v of visits) {
      expect(v.drunk ?? 0).toBeGreaterThanOrEqual(0);
      expect(v.drunk ?? 0).toBeLessThanOrEqual(100);
      expect(v.heat ?? 0).toBeLessThanOrEqual(100);
    }
  });
  it("a wife who wants it starts things with a man she likes; a calm one does not", () => {
    const count = (tune: (b: ReturnType<typeof bs>) => void) => {
      let started = 0;
      for (const seed of [1, 2, 3]) {
        let s = structuredClone(toShift(seed, { base: { preset: "hungry" } }));
        for (let i = 0; i < 24 && s.time.phase === "shift" && !engine.listActions(s).some((a) => a.type === CORE_ADVANCE); i++) {
          s = structuredClone(s);
          tune(bs(s));
          for (const p of Object.values(bs(s).patrons)) p.memory.affinity = 60;
          s = wait(s, 15);
        }
        started += s.log.filter((e) => e.key.startsWith("log.her.starts.")).length;
        expect(engine.checkInvariants(s)).toEqual([]);
        expect(bs(s).shift?.herMoves ?? 0).toBeLessThanOrEqual(3);
      }
      return started;
    };
    const hot = count((b) => {
      b.heroine.arousal = 95;
      b.heroine.frustration = 80;
    });
    const calm = count((b) => {
      b.heroine.arousal = 0;
      b.heroine.frustration = 0;
      b.heroine.drunk = 0;
      b.heroine.latents = {};
    });
    expect(hot).toBeGreaterThan(0);
    expect(calm).toBe(0);
  });
});
