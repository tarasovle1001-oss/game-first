import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { baseMod, bs } from "@tc/base";
import { createEngine, loadGame } from "@tc/core";
import { lovingStrategy } from "../src";

// Old saves keep loading (27.11): every save in test/fixtures was made by a past build. A new build must load each one
// (base migrate fills what was added since) and play on without errors. Add a fixture whenever the save shape changes on purpose.
const engine = createEngine([baseMod]);
const DIR = join(import.meta.dirname, "fixtures");

describe("old saves", () => {
  for (const file of readdirSync(DIR).filter((f) => f.startsWith("save-"))) {
    it(`${file} loads and plays on for a day`, () => {
      const json = gunzipSync(readFileSync(join(DIR, file))).toString("utf8");
      let s = loadGame(json, [baseMod]).state;
      expect(engine.checkInvariants(s)).toEqual([]);
      const day = s.time.day;
      let roll = 9;
      const rnd = () => ((roll = (roll * 1103515245 + 12345) % 2147483648) / 2147483648);
      for (let t = 0; s.time.day <= day && t < 1500; t++) {
        const list = engine.listActions(s);
        expect(list.length).toBeGreaterThan(0);
        s = engine.dispatch(s, lovingStrategy(list, s, rnd) ?? list[list.length - 1]!);
        expect(engine.checkInvariants(s)).toEqual([]);
      }
      expect(s.time.day).toBe(day + 1);
      expect(bs(s).heroine.traits.openness).toBeTypeOf("number");
    });
  }
  it("a save from before the kink switches and the trait registry still loads", () => {
    const file = readdirSync(DIR).find((f) => f.startsWith("save-"))!;
    const raw = JSON.parse(gunzipSync(readFileSync(join(DIR, file))).toString("utf8"));
    delete raw.state.mods.base.kinks;
    const s = loadGame(JSON.stringify(raw), [baseMod]).state;
    expect(bs(s).kinks ?? []).toEqual([]);
    expect(engine.listActions(s).length).toBeGreaterThan(0);
  });
});
