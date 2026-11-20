import { describe, expect, it } from "vitest";
import { baseMod, content } from "@tc/base";
import { createEngine } from "@tc/core";
import { cheatsMod, runScenario, SCENARIOS } from "../../mods/cheats/src";

const engine = createEngine([baseMod, cheatsMod]);

describe("test starts", () => {
  for (const sc of SCENARIOS)
    it(`${sc.id}: gets to its moment, and the game is sound there`, () => {
      const run = runScenario(engine, sc);
      expect(run.problem ?? "").toBe("");
      expect(run.ok).toBe(true);
      // the moves alone give the same game again: that is what the move record and the bookmarks rely on
      let s = engine.init(run.seed, { base: run.setup as never });
      for (const a of run.actions) s = engine.dispatch(s, a);
      expect(JSON.stringify(s)).toBe(JSON.stringify(run.state));
    });
  it("with another wife and mode picked by hand they still run", () => {
    for (const preset of content.presets.map((p) => p.id)) {
      const run = runScenario(engine, SCENARIOS.find((x) => x.id === "hot_guest")!, { preset, mode: "open" });
      expect(engine.checkInvariants(run.state)).toEqual([]);
    }
  });
});
