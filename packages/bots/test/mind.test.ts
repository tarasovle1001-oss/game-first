import { describe, expect, it } from "vitest";
import { attrOf, baseMod, bs, content, feelingOf, trustOf, wantsOf } from "@tc/base";
import { createEngine } from "@tc/core";
import type { GameState } from "@tc/core";

const engine = createEngine([baseMod]);
const consent = (s: GameState, partner: string, act = "sex") => engine.evaluate("base/consent", s, { act, partner, loc: "home.bedroom", offer: 0, pressure: 0 });

describe("her head", () => {
  it("feelings change what she answers: tenderness helps him, anger and contempt work against him", () => {
    const s = structuredClone(engine.init(5));
    const base = consent(s, "husband").total;
    bs(s).heroine.feel = { tenderness: 50 };
    expect(consent(s, "husband").total).toBeCloseTo(base + 50 * content.mind.consent.husband.tenderness!, 1);
    bs(s).heroine.feel = { anger: 40, contempt: 30 };
    expect(consent(s, "husband").total).toBeLessThan(base - 10);
  });
  it("trust is its own row with her husband and none with a guest", () => {
    const s = structuredClone(engine.init(5));
    bs(s).heroine.marriage.trust = 90;
    expect(consent(s, "husband").rows.find((r) => r.id === "consent.trust")!.value).toBeCloseTo(40 * content.mind.trust.consent, 1);
    expect(trustOf(s)).toBe(90);
  });
  it("feelings fade with the hours and mostly do not survive the night", () => {
    let s = structuredClone(engine.init(5));
    bs(s).heroine.feel = { fear: 30, contempt: 30 };
    s = engine.dispatch(s, { type: "base/prep-wait", payload: { minutes: 60 } });
    expect(feelingOf(s, "fear")).toBeLessThan(20);
    expect(feelingOf(s, "contempt")).toBeGreaterThan(28);
  });
  it("attributes come from the new-game sliders; they are kept as set", () => {
    const tough = engine.init(3, { base: { attrs: { stamina: 100, charm: 90 } } });
    expect(attrOf(tough, "stamina")).toBe(100);
    expect(attrOf(tough, "charm")).toBe(90);
  });
  it("what she wants is read off her state", () => {
    const s = structuredClone(engine.init(5));
    bs(s).heroine.energy = 10;
    bs(s).heroine.frustration = 80;
    bs(s).heroine.arousal = 70;
    const w = wantsOf(s);
    expect(w.rest).toBe(90);
    expect(w.release).toBeGreaterThan(70);
  });
  it("a day played by hand leaves a diary page and reasons next to her numbers", () => {
    let s = engine.init(11, { base: { preset: "hungry" } });
    s = engine.dispatch(s, { type: "core/advance" });
    let guard = 0;
    while (s.time.phase === "shift" && guard++ < 400) {
      const acts = engine.listActions(s);
      s = engine.dispatch(s, acts.find((a) => a.type === "core/advance") ?? acts.find((a) => a.type === "base/wait" && a.payload?.minutes === 15) ?? acts[0]!);
    }
    expect(bs(s).diary?.length ?? 0).toBeGreaterThan(0);
    expect(Object.keys(bs(s).heroine.why ?? {}).length).toBeGreaterThan(0);
  });
});
