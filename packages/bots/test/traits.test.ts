import { describe, expect, it } from "vitest";
import { baseMod, bs, content, TRAITS, traitOf } from "@tc/base";
import { createEngine } from "@tc/core";

// The trait registry (27.11, traits.yaml): every trait of a game comes from there; a trait missing in an old save reads as its default.
const engine = createEngine([baseMod]);

describe("trait registry", () => {
  it("has the five the code reads by name", () => {
    for (const id of ["openness", "confidence", "fidelity", "honesty", "libido"]) expect(TRAITS.find((t) => t.id === id)?.builtIn).toBe(true);
  });
  it("a new game has every trait of the registry", () => {
    const s = engine.init(4, { base: { preset: "ordinary" } });
    for (const t of TRAITS) expect(typeof bs(s).heroine.traits[t.id]).toBe("number");
  });
  it("a trait the save does not have reads as its default, and setup takes only known ids", () => {
    const s = structuredClone(engine.init(4, { base: { traits: { openness: 77, nonsense: 5 } } }));
    expect(bs(s).heroine.traits.openness).toBe(77);
    expect(bs(s).heroine.traits.nonsense).toBeUndefined();
    delete (bs(s).heroine.traits as Record<string, number>).honesty;
    expect(traitOf(bs(s).heroine, "honesty")).toBe(content.traits.find((t) => t.id === "honesty")!.default);
  });
});
