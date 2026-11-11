import { describe, expect, it } from "vitest";
import { baseMod } from "@tc/base";
import { exampleMod, EXAMPLE_FORMULA } from "@tc/mod-example";
import { CORE_ADVANCE, CORE_MOVE, createEngine, createTranslator, loadGame, saveGame, sceneKey } from "@tc/core";
import type { GameState, Mod } from "@tc/core";
import { WAIT } from "@tc/base";

const mods = [baseMod, exampleMod];
const engine = createEngine(mods);
const advance = { type: CORE_ADVANCE };
const wait = (minutes: number) => ({ type: WAIT, payload: { minutes } });
const canAdvance = (s: GameState) => engine.listActions(s).some((a) => a.type === CORE_ADVANCE);
/** Moves to the next phase, waiting through shift ticks when the phase cannot be left yet. */
const nextPhase = (s: GameState) => {
  while (!canAdvance(s)) s = engine.dispatch(s, wait(60));
  return engine.dispatch(s, advance);
};

describe("day cycle", () => {
  it("walks phases and rolls the day over", () => {
    let s = engine.init(1);
    expect(s.time).toEqual({ day: 1, phase: "prep", minute: 960 });
    const seen = [];
    for (let i = 0; i < 4; i++) {
      s = nextPhase(s);
      seen.push(s.time.phase);
    }
    expect(seen).toEqual(["shift", "night", "summary", "prep"]);
    expect(s.time.day).toBe(2);
    expect(s.mods.base.daysPlayed).toBe(1);
  });

  it("does not mutate the previous state", () => {
    const a = engine.init(1);
    const snapshot = JSON.stringify(a);
    nextPhase(nextPhase(a));
    expect(JSON.stringify(a)).toBe(snapshot);
  });
});

describe("determinism", () => {
  const play = (seed: number) => {
    let s = engine.init(seed);
    for (let i = 0; i < 40; i++) s = nextPhase(s);
    return s;
  };
  it("same seed -> same state", () => expect(play(42)).toEqual(play(42)));
  it("different seed -> different rolls", () => expect(play(42).mods.base.patrons).not.toEqual(play(43).mods.base.patrons));
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
    while (!s.mods.example.rainToday) s = nextPhase(s);
    const rainy = engine.evaluate(EXAMPLE_FORMULA, s, {});
    expect(rainy.rows.map((r) => r.id)).toEqual(["example.base", "example.rain"]);
    expect(rainy.total).toBe(5);
    while (s.mods.example.rainToday) s = nextPhase(s);
    expect(engine.evaluate(EXAMPLE_FORMULA, s, {}).rows).toHaveLength(1);
  });
});

describe("scene", () => {
  it("is derived from state and follows the viewer", () => {
    let s = engine.init(1);
    expect(sceneKey(engine.currentScene(s)!)).toBe("idle/husband/cafe.hall");
    expect(engine.currentScene(s)!.participants.map((p) => p.id)).toEqual(["husband"]);
    s = engine.dispatch(s, { type: CORE_MOVE, actor: "husband", payload: { to: "cafe.bar" } });
    expect(sceneKey(engine.currentScene(s)!)).toBe("idle/husband+wife/cafe.bar");
  });
});

describe("save", () => {
  it("round-trips mid-day and continues identically", () => {
    let a = engine.init(7);
    a = nextPhase(a);
    for (let i = 0; i < 14; i++) a = engine.dispatch(a, wait(10)); // stop in the middle of a shift
    let b = loadGame(saveGame(a, engine), mods).state;
    expect(b).toEqual(a);
    for (let i = 0; i < 12; i++) {
      a = nextPhase(a);
      b = nextPhase(b);
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

describe("shift and economy", () => {
  it("cannot leave the shift before its ticks are done", () => {
    const s = nextPhase(engine.init(3));
    expect(s.time.phase).toBe("shift");
    expect(canAdvance(s)).toBe(false);
  });
  it("guests arrive, get served, pay, and are gone after closing", () => {
    let s = nextPhase(engine.init(3));
    const moneyBefore = s.mods.base.money;
    while (!canAdvance(s)) s = engine.dispatch(s, wait(10));
    expect(s.mods.base.shift.served).toBeGreaterThan(0);
    expect(s.mods.base.money).toBeGreaterThan(moneyBefore);
    s = engine.dispatch(s, advance);
    expect(s.mods.base.shift).toBeNull();
    expect(Object.keys(s.where).sort()).toEqual(["husband", "wife"]);
  });
  it("charges rent in the summary and turns unpaid bills into debt", () => {
    let s = engine.init(3);
    s = { ...s, mods: { ...s.mods, base: { ...s.mods.base, money: 0, stock: 0 } } };
    const debtBefore = s.mods.base.debt;
    while (s.time.phase !== "summary") s = nextPhase(s);
    expect(s.mods.base.money).toBe(0);
    expect(s.mods.base.debt).toBeGreaterThan(debtBefore);
  });
  it("waits in steps and can stop at the first event", () => {
    const s = nextPhase(engine.init(3));
    expect(engine.dispatch(s, wait(30)).mods.base.shift.tick).toBe(3);
    const stopped = engine.dispatch(s, { type: WAIT, payload: { until: "event" } });
    expect(stopped.mods.base.shift.tick).toBeGreaterThan(0);
    expect(stopped.mods.base.shift.interrupt || stopped.mods.base.shift.tick === 36).toBe(true);
    expect(stopped.time.minute).toBe(18 * 60 + stopped.mods.base.shift.tick * 10);
  });
  it("answers proposals through the consent formula and remembers why", () => {
    let s = nextPhase(engine.init(5));
    while (s.mods.base.proposals.length === 0) s = canAdvance(s) ? nextPhase(nextPhase(nextPhase(nextPhase(s)))) : engine.dispatch(s, wait(10));
    const p = s.mods.base.proposals[0];
    expect(p.rows[0].id).toBe("consent.act");
    expect(p.rows.reduce((a: number, r: { value: number }) => a + r.value, 0)).toBeCloseTo(p.total);
    expect(["eager", "hesitant", "refuse"]).toContain(p.verdict);
  });
  it("husband in the room makes her less willing", () => {
    let s = nextPhase(engine.init(5));
    while (s.mods.base.shift.visits.length === 0) s = engine.dispatch(s, wait(10));
    const partner = s.mods.base.shift.visits[0].patron;
    const input = { act: "kiss", partner, loc: "cafe.hall", offer: 0, pressure: 0 };
    const watched = engine.evaluate("base/consent", s, input);
    const away = engine.evaluate("base/consent", { ...s, where: { ...s.where, husband: "cafe.kitchen" } }, input);
    expect(watched.rows.some((r) => r.id === "consent.husband")).toBe(true);
    expect(away.rows.some((r) => r.id === "consent.husband")).toBe(false);
    expect(away.total).toBeGreaterThan(watched.total);
  });
  it("tip formula exposes named rows", () => {
    let s = nextPhase(engine.init(3));
    while (!s.mods.base.shift.visits.length) s = engine.dispatch(s, wait(10));
    const patron = s.mods.base.shift.visits[0].patron;
    const res = engine.evaluate("base/tip", s, { patron, bill: 20 });
    expect(res.rows.map((r) => r.id)).toEqual(["tip.generosity", "tip.mood", "tip.interest"]);
  });
});

describe("purity", () => {
  it("core, base and mods never touch Math.random, Date or React", async () => {
    const { readdirSync, readFileSync, statSync } = await import("node:fs");
    const { join } = await import("node:path");
    const walk = (dir: string): string[] =>
      readdirSync(dir).flatMap((f) => {
        const p = join(dir, f);
        return statSync(p).isDirectory() ? (f === "node_modules" || f === "generated" ? [] : walk(p)) : /\.ts$/.test(f) ? [p] : [];
      });
    const root = join(__dirname, "../..");
    const bad: string[] = [];
    for (const pkg of ["core/src", "base/src", "mods/example/src", "schematics/src"])
      for (const file of walk(join(root, pkg)).filter(() => true)) {
        const src = readFileSync(file, "utf8");
        if (/Math\.random|\bDate\b|from "react/.test(src)) bad.push(file);
      }
    expect(bad).toEqual([]);
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
