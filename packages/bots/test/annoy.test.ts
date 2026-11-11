import { describe, expect, it } from "vitest";
import { annoyanceOf, baseMod, bs, TALK } from "@tc/base";
import { CORE_MOVE, createEngine } from "@tc/core";

const engine = createEngine([baseMod]);
const atBar = (seed: number, setup?: Parameters<typeof engine.init>[1]) => engine.dispatch(engine.init(seed, setup), { type: CORE_MOVE, actor: "husband", payload: { to: "cafe.bar" } });

describe("she has had enough", () => {
  it("his touches add up; past the line she turns the next one down, and it wears off with time", () => {
    let s = structuredClone(atBar(5));
    bs(s).heroine.annoyHim = 45;
    const mood = bs(s).heroine.mood;
    s = engine.dispatch(s, { type: TALK, payload: { do: "hug", group: "touch" } });
    expect(s.log.at(-1)!.key.startsWith("log.annoyed.tired")).toBe(true);
    expect(bs(s).heroine.mood).toBeLessThan(mood);
    const before = annoyanceOf(s, "him");
    s = engine.dispatch(s, { type: "base/prep-wait", payload: { minutes: 60 } });
    expect(annoyanceOf(s, "him")).toBeLessThan(before);
  });
  it("it counts against every ask, his and theirs", () => {
    const s = structuredClone(atBar(5));
    const row = (st: typeof s) => engine.evaluate("base/consent", st, { act: "kiss", partner: "husband", loc: "cafe.bar", offer: 0, pressure: 0 }).total;
    const calm = row(s);
    bs(s).heroine.annoyance = 60;
    const guests = engine.evaluate("base/consent", s, { act: "kiss", partner: Object.keys(bs(s).patrons)[0] ?? "nobody", loc: "cafe.bar", offer: 0, pressure: 0 }).rows.find((r) => r.id === "consent.annoyed")?.value ?? 0;
    // what guests did counts against him only in part
    expect(row(s)).toBeLessThan(calm - 2);
    if (Object.keys(bs(s).patrons).length > 0) expect(guests).toBeLessThan(row(s) - calm);
    bs(s).heroine.annoyHim = 60;
    expect(row(s)).toBeLessThan(calm - 8);
  });
  it("the new-game tastes: a high slider is a side of her, a low one takes it away and sours the acts", () => {
    const likes = engine.init(3, { base: { preset: "ordinary", name: "Vera", tastes: { oral: 90, anal: 10 } } });
    expect(bs(likes).heroine.name).toBe("Vera");
    expect(bs(likes).heroine.latents.oral_fixation).toBe(true);
    expect(bs(likes).heroine.latents.anal_lover).toBeUndefined();
    expect(bs(likes).heroine.tastes.acts.blowjob).toBeGreaterThan(0);
    expect(bs(likes).heroine.tastes.acts.anal).toBeLessThan(0);
  });
});
