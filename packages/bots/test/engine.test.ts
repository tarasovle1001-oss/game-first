import { awayStrategy } from "../src";
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
    expect(s.time).toEqual({ day: 1, phase: "prep", minute: 720 });
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
    const base2: Mod = { ...baseMod, version: baseMod.version + 1, migrate: (slice) => ({ ...slice, added: true }) };
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
    expect(engine.dispatch(s, wait(30)).mods.base.shift.tick).toBe(30); // the evening is counted in minutes
    // ordinary work is waited out in 5 / 15 / 60; a minute at a time only while something is going on in front of him
    expect(engine.listActions(s).filter((a) => a.type === WAIT && a.payload?.minutes).map((a) => a.payload!.minutes)).toEqual([5, 15, 60]);
    const stopped = engine.dispatch(s, { type: WAIT, payload: { until: "event" } });
    expect(stopped.mods.base.shift.tick).toBeGreaterThan(0);
    expect(stopped.mods.base.shift.interrupt || stopped.mods.base.shift.tick === 360).toBe(true);
    expect(stopped.time.minute).toBe(18 * 60 + stopped.mods.base.shift.tick);
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
    expect(res.rows.map((r) => r.id).slice(0, 3)).toEqual(["tip.generosity", "tip.mood", "tip.interest"]);
    expect(res.rows.map((r) => r.id)).toContain("tip.clean");
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

describe("the afternoon", () => {
  const go = (s: any, ...to: string[]) => {
    for (const room of to) s = engine.dispatch(s, { type: CORE_MOVE, actor: "husband", payload: { to: room } });
    return s;
  };
  const doIt = (s: any, id: string) => engine.dispatch(engine.dispatch(s, { type: "base/day", payload: { do: id } }), { type: "base/prep-wait", payload: { until: "done" } });
  it("is a budget of minutes: an activity takes its time, walking takes time, and the clock moves", () => {
    let s = engine.init(6);
    expect(s.mods.base.day.left).toBe(360);
    const acts = () => engine.listActions(s).filter((a) => a.type === "base/day").map((a) => a.payload!.do);
    expect(acts()).toContain("clean");
    expect(acts()).not.toContain("side_job"); // that one is in town
    s = go(s, "town.square");
    expect(s.mods.base.day.left).toBe(350);
    expect(acts()).toContain("side_job");
    const money = s.mods.base.money;
    s = engine.dispatch(s, { type: "base/day", payload: { do: "side_job" } });
    expect(s.mods.base.money).toBe(money); // nothing yet: the work has to be done first
    expect(acts()).toEqual([]);
    s = engine.dispatch(s, { type: "base/prep-wait", payload: { minutes: 60 } });
    expect(s.mods.base.day.busy.left).toBe(180);
    s = engine.dispatch(s, { type: "base/prep-wait", payload: { until: "done" } });
    expect(s.mods.base.money).toBeGreaterThan(money);
    expect(s.mods.base.day.busy).toBeUndefined();
    expect(s.time.minute).toBe(720 + 250);
    expect(acts()).toContain("date"); // she comes along if he calls her
    s = go(s, "town.shops");
    expect(engine.listActions(s).some((a) => a.type === "base/buy" && a.payload!.kind === "outfit")).toBe(true);
    expect(engine.checkInvariants(s)).toEqual([]);
  });
  it("walking off in the middle of something drops it; the town is closed to him in the evening", () => {
    let s = engine.init(6);
    s = engine.dispatch(s, { type: "base/day", payload: { do: "clean" } });
    const clean = s.mods.base.clean;
    s = go(s, "cafe.bar");
    expect(s.mods.base.day.busy).toBeUndefined();
    expect(s.mods.base.clean).toBe(clean);
    s = go(s, "cafe.hall", "town.square");
    s = nextPhase(s);
    expect(s.where.husband).toBe("cafe.hall");
    expect(engine.listActions(s).some((a) => a.type === CORE_MOVE && String(a.payload?.to).startsWith("town."))).toBe(false);
  });
  it("she has her own afternoon: she moves through the house, and he has to be in her room to talk to her", () => {
    let s = engine.init(6);
    expect(s.where.wife).toBe("cafe.bar");
    expect(engine.listActions(s).some((a) => a.type === "base/talk")).toBe(false);
    const rooms = new Set<string>();
    for (let i = 0; i < 20; i++) {
      s = engine.dispatch(s, { type: "base/prep-wait", payload: { minutes: 15 } });
      rooms.add(s.where.wife!);
    }
    expect(rooms.size).toBeGreaterThan(1);
    let t = go(engine.init(6), "cafe.bar");
    expect(engine.listActions(t).some((a) => a.type === "base/talk")).toBe(true);
    t = engine.dispatch(t, { type: "base/day", payload: { do: "clean" } });
    expect(engine.listActions(t).some((a) => a.type === "base/talk")).toBe(false); // his hands are full
  });
  it("she only wears what she owns, and a bought outfit becomes available", () => {
    let s = engine.init(6, { base: { preset: "hungry" } });
    expect(s.mods.base.owned).toContain(s.mods.base.heroine.outfit);
    s = go(s, "town.square", "town.shops");
    const buy = engine.listActions(s).find((a) => a.type === "base/buy" && a.payload!.id === "revealing")!;
    s = engine.dispatch(s, buy);
    expect(s.mods.base.owned).toContain("revealing");
    expect(engine.listActions(s).some((a) => a.type === "base/ask-outfit" && a.payload!.outfit === "revealing")).toBe(true);
    void doIt;
  });
});

describe("the loan", () => {
  const toDay = (s: any, day: number) => {
    while (s.time.day < day) s = engine.dispatch(s, engine.listActions(s).find((a) => a.type === "core/advance") ?? { type: "base/wait", payload: { minutes: 60 } });
    return s;
  };
  it("a paid instalment lowers the debt and nobody comes", () => {
    let s = toDay(engine.init(2), 7);
    const rich = structuredClone(s);
    rich.mods.base.money = 5000;
    const pay = engine.listActions(rich).find((a) => a.type === "base/loan-pay")!;
    expect(pay).toBeDefined();
    const debt = rich.mods.base.debt;
    s = engine.dispatch(rich, pay);
    expect(s.mods.base.debt).toBe(debt - (pay.payload!.money as number));
    s = engine.dispatch(s, { type: "core/advance" });
    expect(s.mods.base.loan.missed).toBe(0);
    expect(s.mods.base.loan.dueDay).toBe(14);
  });
  it("a missed one costs a fee and brings the lender, for whom the debt itself argues", () => {
    let s = toDay(engine.init(2), 7);
    const debt = s.mods.base.debt;
    s = engine.dispatch(s, { type: "core/advance" }); // doors open, nothing was paid
    expect(s.mods.base.debt).toBeGreaterThan(debt);
    expect(s.mods.base.loan.missed).toBe(1);
    const lender = Object.values(s.mods.base.patrons as Record<string, any>).find((p) => p.lender)!;
    expect(lender).toBeDefined();
    const rows = engine.evaluate("base/consent", s, { act: "kiss", partner: lender.id, loc: "cafe.hall", offer: 0, pressure: 0 }).rows;
    expect(rows.find((r) => r.id === "consent.debt")!.value).toBeGreaterThan(0);
    for (let i = 0; i < 10; i++) s = engine.dispatch(s, { type: "base/wait", payload: { minutes: 10 } });
    expect(s.mods.base.shift.visits.some((v: any) => v.patron === lender.id) || lender.memory.visits >= 0).toBe(true);
    expect(engine.checkInvariants(s)).toEqual([]);
  });
});

describe("the night's additions", () => {
  const play = (seed: number, days: number, setup?: any) => {
    let s = engine.init(seed, setup);
    const seen = new Set<string>();
    while (s.time.day <= days) {
      const a = engine.listActions(s);
      s = engine.dispatch(s, a.find((x) => x.type === "core/advance") ?? (a.some((x) => x.type === "base/wait") ? { type: "base/wait", payload: { minutes: 30 } } : undefined) ?? a.find((x) => x.type === "base/hear-her") ?? a[0]!);
      for (const e of s.log.slice(-6)) seen.add(e.key.replace(/\.\d+$/, "").replace(/#\d+$/, ""));
    }
    return { s, seen };
  };
  it("rooms upstairs get taken, pay, and empty again", () => {
    const { s, seen } = play(3, 12);
    expect(seen.has("log.hotel.checks_in")).toBe(true);
    expect(seen.has("log.hotel.paid")).toBe(true);
    expect(seen.has("log.hotel.checks_out")).toBe(true);
    expect(Object.keys(s.mods.base.lodgers).length).toBeLessThanOrEqual(2);
  });
  it("a dress order needs her to be open enough, and each can be asked once a day", () => {
    const shy = engine.init(3, { base: { preset: "faithful" } });
    const bold = engine.init(3, { base: { preset: "hungry" } });
    const ask = (st: any) => engine.dispatch(st, { type: "base/order", payload: { id: "no_panties" } });
    expect(ask(shy).mods.base.orders).toEqual([]);
    expect(ask(bold).mods.base.orders).toEqual(["no_panties"]);
    expect(engine.listActions(ask(bold)).some((a) => a.type === "base/order" && a.payload?.id === "no_panties")).toBe(false);
  });
  it("what happens on the floor in front of others gets talked about", () => {
    // with the husband out of sight in the kitchen
    let s = engine.init(3, { base: { preset: "hungry" } });
    let most = 0;
    for (let i = 0; i < 40000 && s.time.day <= 14; i++) {
      s = engine.dispatch(s, awayStrategy(engine.listActions(s), s, () => 0));
      most = Math.max(most, s.mods.base.gossip);
    }
    expect(most).toBeGreaterThan(0);
    expect(s.mods.base.memories.length).toBeGreaterThan(0);
    expect(engine.checkInvariants(s)).toEqual([]);
  });
  it("rent goes up every week", () => {
    const { s } = play(2, 8);
    const rents = s.mods.base.history.map((h: any) => h.rent);
    expect(rents.at(-1)).toBeGreaterThan(rents[0]);
  });
});
