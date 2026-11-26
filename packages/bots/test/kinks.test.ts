import { describe, expect, it } from "vitest";
import { baseMod, bs, cleanKinks, content, offItems, pictureFrames, pictureScene, SET_KINKS } from "@tc/base";
import { createEngine } from "@tc/core";
import type { GameState } from "@tc/core";
import { awayStrategy, lovingStrategy, snoopStrategy } from "../src";

// Kink switches (27.11): what the player turns off never happens - not offered, not done, not in a picture.
const engine = createEngine([baseMod]);
const DIRS = content.kinks.directions.map((d) => d.id);

/** Play a few days with these switches off and collect everything that would break them. */
function play(off: string[], seed: number, days: number, mode: "hidden" | "open", strategy = lovingStrategy) {
  let s: GameState = engine.init(seed, { base: { preset: "hungry", mode, traits: { openness: 90, fidelity: 10 }, kinks: off } });
  const offList = offItems(s);
  const acts = new Set(offList.flatMap((i) => i.acts ?? []));
  const details = new Set(offList.flatMap((i) => i.detail ?? []));
  const bad: string[] = [];
  let roll = seed * 31;
  const rnd = () => ((roll = (roll * 1103515245 + 12345) % 2147483648) / 2147483648);
  for (let turn = 0; s.time.day <= days && turn < days * 500; turn++) {
    const list = engine.listActions(s);
    if (!list.length) break;
    for (const a of list) if (a.type === "base/night-act" && acts.has(String(a.payload?.act))) bad.push(`offered at night: ${a.payload?.act}`);
    s = engine.dispatch(s, strategy(list, s, rnd) ?? list[list.length - 1]!);
    const b = bs(s);
    if (b.encounter && acts.has(b.encounter.act)) bad.push(`guest act ${b.encounter.act}`);
    if (b.night?.sex && acts.has(b.night.sex.act)) bad.push(`bed act ${b.night.sex.act}`);
    const seen = pictureScene(engine, s);
    if (seen) for (const d of pictureFrames(s, seen).details) if (details.has(d.type)) bad.push(`close-up ${d.type}`);
  }
  return { s, bad: [...new Set(bad)] };
}

describe("kink switches", () => {
  it("keeps only known ids and folds items into an off direction", () => {
    expect(cleanKinks(["femdom", "pegging", "nonsense", "facial", 3])).toEqual(["facial", "femdom"]);
    expect(cleanKinks(null)).toEqual([]);
  });

  it("everything off: no off act, no off close-up, in either marriage", () => {
    for (const mode of ["hidden", "open"] as const)
      for (const seed of [3, 11]) {
        const { bad } = play(DIRS, seed, 8, mode, seed % 2 ? lovingStrategy : snoopStrategy);
        expect(bad, `${mode} seed ${seed}`).toEqual([]);
      }
  }, 120_000);

  it("femdom off: she never leads him into it, and he is never caged", () => {
    for (const seed of [5, 9]) {
      const { s, bad } = play(["femdom"], seed, 10, "open", awayStrategy);
      expect(bad).toEqual([]);
      expect(bs(s).husband.caged).toBeUndefined();
    }
  }, 120_000);

  it("can be changed in the middle of a game, and the cage comes off with its switch", () => {
    let s = structuredClone(engine.init(7, { base: { preset: "hungry" } }));
    bs(s).husband.caged = { day: 1 };
    s = engine.dispatch(s, { type: SET_KINKS, payload: { off: ["chastity", "anal"] } });
    expect(bs(s).kinks).toEqual(["anal", "chastity"]);
    expect(bs(s).husband.caged).toBeUndefined();
    s = engine.dispatch(s, { type: SET_KINKS, payload: { off: [] } });
    expect(bs(s).kinks).toEqual([]);
  });
});
