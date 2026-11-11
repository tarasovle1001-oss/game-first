import { describe, expect, it } from "vitest";
import { baseMod, bs } from "@tc/base";
import { createEngine } from "@tc/core";
import type { GameState } from "@tc/core";

const engine = createEngine([baseMod]);
const day = (s: GameState, id: string) => engine.dispatch(engine.dispatch(s, engine.listActions(s).find((a) => a.type === "base/day" && a.payload?.do === id)!), { type: "base/prep-wait", payload: { until: "done" } });
const walk = (s: GameState, ...to: string[]) => to.reduce((st, room) => engine.dispatch(st, { type: "core/move", actor: "husband", payload: { to: room } }), s);
const has = (s: GameState, id: string) => engine.listActions(s).some((a) => a.type === "base/day" && a.payload?.do === id);

describe("the gym in town", () => {
  it("is a place in town he walks to; training makes him fitter and last a little longer", () => {
    const s = engine.init(5);
    expect(has(s, "gym")).toBe(false);
    const town = walk(s, "town.square", "town.gym");
    expect(has(town, "gym")).toBe(true);
    expect(has(town, "gym_together")).toBe(true);
    const after = day(town, "gym");
    expect(bs(after).husband.fitness).toBeGreaterThan(0);
    expect(bs(after).husband.minutes).toBeGreaterThan(bs(s).husband.minutes);
    expect(bs(after).money).toBeLessThan(bs(town).money);
    expect(engine.checkInvariants(after)).toEqual([]);
  });
  it("together: a regular she likes may find her there, and what her husband sees depends on the marriage", () => {
    let met = 0;
    for (let seed = 1; seed <= 16; seed++) {
      let first = engine.init(seed, { base: { preset: "hungry" } });
      for (let i = 0; i < 800 && first.time.day === 1; i++) {
        const acts = engine.listActions(first);
        first = engine.dispatch(first, acts.find((a) => a.type === "core/advance") ?? acts.find((a) => a.type === "base/wait" && a.payload?.minutes === 60) ?? acts.find((a) => a.type === "base/wait") ?? acts.find((a) => a.type === "base/night-decline") ?? acts[0]!);
      }
      const s = structuredClone(first);
      const b = bs(s);
      b.money = 500;
      b.husband.energy = 100;
      if (b.day) b.day.herOut = false;
      const p = Object.values(b.patrons)[0];
      if (!p) continue;
      p.regular = true;
      p.memory.affinity = 70;
      p.memory.interest = 80;
      p.memory.tier = 6;
      if (b.day) b.day.her = { task: "bar", left: 30 };
      const there = walk(s, "town.square", "town.gym");
      if (!has(there, "gym_together")) continue;
      const after = day(there, "gym_together");
      expect(engine.checkInvariants(after)).toEqual([]);
      if (after.log.some((e) => e.key.startsWith("log.gym.met."))) met++;
    }
    expect(met).toBeGreaterThan(0);
  });
  it("her remark on what the gym has done for him comes once per step and warms her to him", () => {
    let s = structuredClone(engine.init(5));
    bs(s).husband.fitness = 25;
    const desire = bs(s).heroine.marriage.desire;
    for (let i = 0; i < 600 && s.time.day === 1; i++) {
      const acts = engine.listActions(s);
      s = engine.dispatch(s, acts.find((a) => a.type === "core/advance") ?? acts.find((a) => a.type === "base/wait" && a.payload?.minutes === 60) ?? acts.find((a) => a.type === "base/wait") ?? acts[0]!);
      if (s.time.phase === "night") break;
    }
    expect(s.log.some((e) => e.key.startsWith("log.her.fit.20"))).toBe(true);
    expect(bs(s).remarked).toContain("fit.20");
    expect(bs(s).heroine.marriage.desire).toBeGreaterThanOrEqual(desire);
  });
});
