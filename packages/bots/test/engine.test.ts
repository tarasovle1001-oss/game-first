import { describe, expect, it } from "vitest";
import { baseMod } from "@tc/base";
import { exampleMod, EXAMPLE_FORMULA } from "@tc/mod-example";
import { CORE_ADVANCE, CORE_MOVE, createEngine, createTranslator, loadGame, saveGame, sceneKey } from "@tc/core";
import type { Mod } from "@tc/core";

const mods = [baseMod, exampleMod];
const engine = createEngine(mods);
const advance = { type: CORE_ADVANCE };

describe("day cycle", () => {
  it("walks phases and rolls the day over", () => {
    let s = engine.init(1);
    expect(s.time).toEqual({ day: 1, phase: "prep" });
    const seen = [];
    for (let i = 0; i < 4; i++) {
      s = engine.dispatch(s, advance);
      seen.push(s.time.phase);
    }
    expect(seen).toEqual(["shift", "night", "summary", "prep"]);
    expect(s.time.day).toBe(2);
    expect(s.mods.base.daysPlayed).toBe(1);
  });

  it("does not mutate the previous state", () => {
    const a = engine.init(1);
    const snapshot = JSON.stringify(a);
    engine.dispatch(a, advance);
    expect(JSON.stringify(a)).toBe(snapshot);
  });
});

describe("determinism", () => {
  const play = (seed: number) => {
    let s = engine.init(seed);
    for (let i = 0; i < 60; i++) s = engine.dispatch(s, advance);
    return s;
  };
  it("same seed -> same state", () => expect(play(42)).toEqual(play(42)));
  it("different seed -> different rolls", () => expect(play(42).mods.example).not.toEqual(play(43).mods.example));
});

describe("actions", () => {
  it("rejects unknown and unavailable actions", () => {
    const s = engine.init(1);
    expect(() => engine.dispatch(s, { type: "nope" })).toThrow(/unknown action/);
    expect(() => engine.dispatch(s, { type: CORE_MOVE, actor: "husband", payload: { to: "home.bathroom" } })).toThrow(/not available/);
  });
  it("moves along links only", () => {
    let s = engine.init(1);
    s = engine.dispatch(s, { type: CORE_MOVE, actor: "husband", payload: { to: "cafe.bar" } });
    expect(s.where.husband).toBe("cafe.bar");
  });
});

describe("formula", () => {
  it("returns named rows and hides inapplicable ones", () => {
    let s = engine.init(1);
    while (!s.mods.example.rainToday) s = engine.dispatch(s, advance);
    const rainy = engine.evaluate(EXAMPLE_FORMULA, s, {});
    expect(rainy.rows.map((r) => r.id)).toEqual(["example.base", "example.rain"]);
    expect(rainy.total).toBe(5);
    while (s.mods.example.rainToday) s = engine.dispatch(s, advance);
    expect(engine.evaluate(EXAMPLE_FORMULA, s, {}).rows).toHaveLength(1);
  });
});

describe("scene", () => {
  it("is derived from state and follows the viewer", () => {
    let s = engine.init(1);
    expect(sceneKey(engine.currentScene(s)!)).toBe("idle/husband/cafe.hall");
    s = engine.dispatch(s, { type: CORE_MOVE, actor: "husband", payload: { to: "cafe.bar" } });
    expect(sceneKey(engine.currentScene(s)!)).toBe("idle/husband+wife/cafe.bar");
  });
});

describe("save", () => {
  it("round-trips mid-day and continues identically", () => {
    let a = engine.init(7);
    for (let i = 0; i < 6; i++) a = engine.dispatch(a, advance);
    let b = loadGame(saveGame(a, engine), mods).state;
    expect(b).toEqual(a);
    for (let i = 0; i < 20; i++) {
      a = engine.dispatch(a, advance);
      b = engine.dispatch(b, advance);
    }
    expect(b).toEqual(a);
  });

  it("migrates a mod slice and initializes a newly added mod", () => {
    const save = saveGame(engine.init(1), createEngine([baseMod]));
    const base2: Mod = { ...baseMod, version: 2, migrate: (slice) => ({ ...slice, added: true }) };
    const { state, warnings } = loadGame(save, [base2, exampleMod]);
    expect(state.mods.base.added).toBe(true);
    expect(state.mods.example.rainyDays).toBeDefined();
    expect(warnings.join()).toMatch(/example/);
  });
});

describe("mods", () => {
  it("fails on a missing dependency and on duplicate ids", () => {
    expect(() => createEngine([exampleMod])).toThrow(/requires missing mod "base"/);
    const dup: Mod = { id: "dup", version: 1, requires: ["base"], register: (api) => api.phases.register({ id: "prep", labelKey: "x", order: 9 }) };
    expect(() => createEngine([baseMod, dup])).toThrow(/registered twice/);
  });
  it("stops runaway event loops", () => {
    const loop: Mod = { id: "loop", version: 1, requires: ["base"], register: (api) => api.events.on("day:start", (ctx) => ctx.emit("day:start")) };
    expect(() => createEngine([baseMod, loop]).init(1)).toThrow(/event loop/);
  });
});

describe("i18n", () => {
  it("interpolates and falls back to english, then to the key", () => {
    const t = createTranslator({ en: [{ a: "Day {day}", b: "only en" }], ru: [{ a: "День {day}" }] }, "ru");
    expect(t("a", { day: 3 })).toBe("День 3");
    expect(t("b")).toBe("only en");
    expect(t("missing.key")).toBe("missing.key");
  });
});
