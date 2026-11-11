import { describe, expect, it } from "vitest";
import { baseMod, bs, describeScene } from "@tc/base";
import { createEngine } from "@tc/core";

const engine = createEngine([baseMod]);

describe("the scene in words", () => {
  it("says what she has on, how she looks and where she is", () => {
    const s = engine.init(3);
    const w = describeScene(s, true);
    expect(w.heroine[0]).toBe("1girl");
    expect(w.heroine).toContain("plain work dress");
    expect(w.environment.length).toBe(1);
    expect(w.prompt.startsWith("1girl")).toBe(true);
  });
  it("what her body has become, what is on her and what is off all show", () => {
    const s = structuredClone(engine.init(3));
    const h = bs(s).heroine;
    h.bare = "all";
    h.body.anus = { stretch: 90, peak: 90 };
    h.body.vagina = { stretch: 50, peak: 50 };
    h.cum = { face: 10, inside: 100 };
    h.after = { sweat: 5 };
    h.drunk = 70;
    const tags = describeScene(s, true).heroine;
    for (const t of ["completely nude", "extreme anal gape", "loose pussy", "cum on face", "cum in pussy", "sweat", "drunk"]) expect(tags).toContain(t);
  });
  it("marks fade with time, and what is inside ends up on her thighs", () => {
    let s = structuredClone(engine.init(3));
    bs(s).heroine.cum = { face: 12, inside: 240 };
    bs(s).day!.her = { task: "bar", left: 999 }; // not the afternoon she takes a bath
    for (let i = 0; i < 3; i++) s = engine.dispatch(s, { type: "base/prep-wait", payload: { minutes: 15 } });
    expect(bs(s).heroine.cum?.face).toBeUndefined();
    expect(bs(s).heroine.cum?.inside).toBeGreaterThan(0);
    expect(bs(s).heroine.cum?.thighs).toBeGreaterThan(0);
    expect(engine.checkInvariants(s)).toEqual([]);
  });
});
