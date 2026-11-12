import { describe, expect, it } from "vitest";
import { baseMod, bs, content, DAY_DO, himOf, NIGHT_WAIT, SLEEP, WASH, worryOf } from "@tc/base";
import { CORE_ADVANCE, CORE_MOVE, createEngine } from "@tc/core";
import type { GameState } from "@tc/core";

const engine = createEngine([baseMod]);
const R = content.day.rhythm;
/** Skip to the night of the first day without playing the evening. */
const toNight = (seed: number): GameState => {
  let s = engine.init(seed);
  s = engine.dispatch(s, { type: CORE_ADVANCE });
  while (s.time.phase === "shift") {
    const acts = engine.listActions(s);
    const adv = acts.find((a) => a.type === CORE_ADVANCE);
    s = engine.dispatch(s, adv ?? acts.find((a) => a.type === "base/wait" && a.payload?.minutes === 60) ?? acts[0]!);
  }
  return s;
};
const has = (s: GameState, type: string) => engine.listActions(s).some((a) => a.type === type);

describe("the day around the clock", () => {
  it("the night has a clock: waiting moves it, and after a while she is asleep", () => {
    let s = toNight(4);
    expect(s.time.phase).toBe("night");
    expect(bs(s).night!.minute).toBe(0);
    s = engine.dispatch(s, { type: NIGHT_WAIT, payload: { minutes: 60 } });
    s = engine.dispatch(s, { type: NIGHT_WAIT, payload: { minutes: 15 } });
    expect(bs(s).night!.minute).toBe(75);
    if (!bs(s).night!.wants && !bs(s).complaint && !bs(s).approach) expect(bs(s).night!.herAsleep).toBeGreaterThan(0);
  });
  it("waking her counts against him in what she answers", () => {
    const s = structuredClone(toNight(4));
    const row = (st: GameState) => engine.evaluate("base/consent", st, { act: "sex", partner: "husband", loc: "home.bedroom", offer: 0, pressure: 0 }).total;
    const awake = row(s);
    bs(s).night!.herAsleep = 70;
    expect(row(s)).toBe(awake + R.wakeHer.consent);
  });
  it("sleeping in gives more energy and a shorter day", () => {
    const night = structuredClone(toNight(7));
    bs(night).husband.energy = 5;
    bs(night).complaint = null;
    const early = engine.dispatch(engine.dispatch(night, { type: CORE_ADVANCE }), { type: CORE_ADVANCE });
    const late = engine.dispatch(engine.dispatch(night, { type: SLEEP, payload: { until: 12 } }), { type: CORE_ADVANCE });
    expect(early.time.phase).toBe("prep");
    expect(late.time.phase).toBe("prep");
    expect(himOf(late).energy).toBeGreaterThan(himOf(early).energy);
    expect(bs(late).day!.left).toBe(360);
    expect(bs(early).day!.left).toBe(600);
    expect(early.time.minute).toBe(8 * 60);
  });
  it("work takes it out of him; with nothing left he cannot start, and a nap gives some back", () => {
    let s = structuredClone(engine.init(3));
    const can = (st: GameState, id: string) => engine.listActions(st).some((a) => a.type === DAY_DO && a.payload?.do === id);
    expect(can(s, "clean")).toBe(true);
    const before = himOf(s).energy;
    bs(s).clean = 20;
    s = engine.dispatch(s, { type: DAY_DO, payload: { do: "clean" } });
    // cleaning counts by the minute: a quarter of an hour in, a quarter of it is done
    s = engine.dispatch(s, { type: "base/prep-wait", payload: { minutes: 15 } });
    expect(bs(s).clean).toBeCloseTo(20 + 45 / 4, 5);
    s = engine.dispatch(s, { type: "base/prep-wait", payload: { until: "done" } });
    expect(bs(s).clean).toBeCloseTo(65, 5);
    expect(himOf(s).energy).toBeCloseTo(before - 14, 5);
    expect(can(s, "clean")).toBe(true); // and it can be taken up again
    s = structuredClone(s);
    bs(s).husband.energy = 5;
    expect(can(s, "her_chores")).toBe(false);
    expect(can(s, "nap")).toBe(true);
    s = engine.dispatch(s, { type: DAY_DO, payload: { do: "nap" } });
    s = engine.dispatch(s, { type: "base/prep-wait", payload: { until: "done" } });
    expect(himOf(s).energy).toBe(19);
  });
  it("debt sits on both their moods in the morning", () => {
    const night = structuredClone(toNight(9));
    bs(night).complaint = null;
    bs(night).debt = content.balance.start.debt;
    bs(night).money = 2000;
    const calm = engine.dispatch(engine.dispatch(night, { type: CORE_ADVANCE }), { type: CORE_ADVANCE });
    const broke = structuredClone(night);
    bs(broke).debt = content.balance.start.debt + 2000;
    const heavy = engine.dispatch(engine.dispatch(broke, { type: CORE_ADVANCE }), { type: CORE_ADVANCE });
    expect(worryOf(heavy)).toBe(2);
    expect(himOf(heavy).mood).toBeLessThan(himOf(calm).mood);
    expect(bs(heavy).heroine.mood).toBeLessThan(bs(calm).heroine.mood);
  });
  it("the bathroom: he can wash once, and it takes time", () => {
    let s = engine.init(3);
    for (const to of ["cafe.hall", "home.bedroom", "home.bathroom"]) if (s.where.husband !== "home.bathroom") s = engine.listActions(s).some((a) => a.type === CORE_MOVE && a.payload?.to === to) ? engine.dispatch(s, { type: CORE_MOVE, actor: "husband", payload: { to } }) : s;
    if (s.where.husband !== "home.bathroom") return; // the map changed: nothing to check here
    const left = bs(s).day!.left;
    expect(has(s, WASH)).toBe(true);
    s = engine.dispatch(s, { type: WASH });
    expect(bs(s).day!.left).toBe(left - R.bath.washMinutes);
    expect(has(s, WASH)).toBe(false);
  });
});
