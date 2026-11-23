import { describe, expect, it } from "vitest";
import { baseMod, bs, content, fitOf, permOf, sizeStage, stepsAbove, takeChance } from "@tc/base";
import { createEngine } from "@tc/core";
import type { GameState } from "@tc/core";
import { awayStrategy, ownerStrategy } from "../src";

const engine = createEngine([baseMod]);
const fresh = (edit?: (b: ReturnType<typeof bs>) => void): GameState => {
  const s = structuredClone(engine.init(3));
  edit?.(bs(s));
  return s;
};

describe("the ladder of sizes", () => {
  it("has twelve steps; a husband stands on the first three, a guest from the fifth up", () => {
    expect(sizeStage(5)).toBe(1);
    expect(sizeStage(13)).toBe(3);
    expect(sizeStage(48)).toBe(12);
    expect(sizeStage(content.body.husband.size)).toBeLessThanOrEqual(3);
    for (const t of content.patronTypes) expect(sizeStage(t.size[0])).toBeGreaterThanOrEqual(5);
    expect(Math.max(...content.patronTypes.map((t) => t.size[1]), content.body.take.giant.size[1])).toBe(48);
  });
  it("what fits simply goes; every step above is a worse chance; five steps is not even a try", () => {
    const s = fresh((b) => (b.heroine.arousal = 50));
    expect(fitOf(s, "vagina")).toBe(12.5);
    expect(takeChance(s, "vagina", 12)).toBe(1);
    const chances = [15, 18, 21, 24].map((cm) => takeChance(s, "vagina", cm));
    expect(chances).toEqual(content.body.take.chance);
    expect(takeChance(s, "vagina", 27)).toBe(0);
    expect(stepsAbove(s, "vagina", 21)).toBe(3);
    // worked up and warmed up it is likelier; the back way is harder
    const hot = fresh((b) => (b.heroine.arousal = 100));
    expect(takeChance(hot, "vagina", 21)).toBeGreaterThan(takeChance(s, "vagina", 21));
    expect(takeChance(s, "vagina", 21, 0.2)).toBeGreaterThan(takeChance(s, "vagina", 21));
    const back = fresh((b) => {
      b.heroine.arousal = 50;
      b.heroine.body.anus = { stretch: 13, peak: 13, perm: 13 };
    });
    expect(fitOf(back, "anus")).toBeCloseTo(fitOf(s, "vagina"), 0);
    expect(takeChance(back, "anus", 15)).toBeLessThan(takeChance(s, "vagina", 15));
  });
  it("overnight a share of today's stretch stays for good and a share goes back", () => {
    let s = fresh((b) => (b.heroine.body.vagina = { stretch: 30, peak: 30, perm: 10 }));
    const day = s.time.day;
    for (let i = 0; i < 5000 && s.time.day === day; i++) s = engine.dispatch(s, awayStrategy(engine.listActions(s), s, () => 0));
    const z = bs(s).heroine.body.vagina;
    expect(permOf(z)).toBeGreaterThan(10);
    expect(permOf(z)).toBeLessThan(14);
    expect(z.stretch).toBeLessThan(30);
    expect(z.stretch).toBeGreaterThanOrEqual(permOf(z));
  });
  it("an old save without the permanent part reads as a share of its peak", () => {
    expect(permOf({ stretch: 50, peak: 50 })).toBe(50 * content.body.permanentShare);
    expect(permOf({ stretch: 10, peak: 50 })).toBe(10);
  });
  it("in play: guests are 20 cm and up, the early ones not the biggest, and tries to take them happen", () => {
    let tries = 0;
    for (const seed of [1, 2, 3]) {
      let s = engine.init(seed, { base: { preset: "hungry" } });
      let seen = 0;
      while (s.time.day <= 12) {
        s = engine.dispatch(s, ownerStrategy(engine.listActions(s), s, () => 0));
        const n = s.log.length;
        if (n !== seen) tries += s.log.slice(-Math.min(20, Math.abs(n - seen) || 1)).filter((e) => e.key.startsWith("log.take.") && !e.key.includes("instead")).length ? 1 : 0;
        seen = n;
        if (s.time.day === 2) for (const p of Object.values(bs(s).patrons)) expect(p.size).toBeLessThanOrEqual(content.body.take.ladder.start + 100 * content.body.take.ladder.perFame);
      }
      for (const p of Object.values(bs(s).patrons)) expect(p.size).toBeGreaterThanOrEqual(20);
    }
    expect(tries).toBeGreaterThan(0);
  });
});

describe("what moves her with no man touching her (23.11)", () => {
  const eng = createEngine([baseMod]);
  it("her body has a day's worth of it and no more: the reserve fills with every intimate act and speaks against the next", () => {
    const s = structuredClone(eng.init(11));
    const b = bs(s);
    const partner = Object.keys(b.patrons)[0] ?? "p1";
    const row = () => eng.evaluate("base/consent", s, { act: "blowjob", partner, loc: "cafe.staff", offer: 0, pressure: 0 }).rows.find((r) => r.id === "consent.worn")?.value ?? 0;
    expect(row()).toBe(0);
    b.heroine.spent = 50;
    const some = row();
    expect(some).toBeLessThan(0);
    b.heroine.spent = 80;
    expect(row()).toBeLessThan(some);
    // small talk and a hand on her waist cost nothing
    expect(eng.evaluate("base/consent", s, { act: "flirt", partner, loc: "cafe.hall", offer: 0, pressure: 0 }).rows.some((r) => r.id === "consent.worn")).toBe(false);
  });
  it("she finds her hour in the afternoon even when he opens early: the minute is picked from the real length of the day", () => {
    let found = 0;
    for (let seed = 1; seed <= 12 && found === 0; seed++) {
      let s = structuredClone(eng.init(seed, { base: { preset: "bookish" } as never }));
      for (let i = 0; i < 400 && !(s.time.day === 1 && s.time.phase === "night"); i++) s = eng.dispatch(s, eng.listActions(s).find((a) => a.type === "core/advance") ?? eng.listActions(s)[0]!);
      s = structuredClone(s);
      bs(s).heroine.frustration = 60;
      // into the next afternoon
      for (let i = 0; i < 400 && s.time.phase !== "prep"; i++) s = eng.dispatch(s, eng.listActions(s).find((a) => a.type === "core/advance") ?? eng.listActions(s)[0]!);
      if (s.time.phase !== "prep" || !bs(s).solo) continue;
      const left = bs(s).day!.left;
      for (let i = 0; i < 60 && s.time.phase === "prep" && bs(s).solo?.started === undefined; i++) {
        const wait = eng.listActions(s).find((a) => a.type === "base/prep-wait" && a.payload?.minutes === 15);
        if (!wait) break;
        s = eng.dispatch(s, wait);
      }
      if (bs(s).solo?.started === undefined) continue;
      found++;
      expect(bs(s).solo!.at).toBeGreaterThan(left * 0.4); // well before the doors open
    }
    expect(found).toBeGreaterThan(0);
  });
});

describe("the long goal: buying the place (23.11)", () => {
  it("the landlord names his price after a few days; with the money and no debt it can be bought, and the rent stops", () => {
    const eng = createEngine([baseMod]);
    let s = eng.init(3);
    for (let i = 0; i < 4000 && s.time.day < content.balance.buyout.fromDay + 1; i++) s = eng.dispatch(s, eng.listActions(s).find((a) => a.type === "core/advance") ?? eng.listActions(s)[0]!);
    expect(bs(s).buyoutTold).toBe(true);
    for (let i = 0; i < 200 && s.time.phase !== "prep"; i++) s = eng.dispatch(s, eng.listActions(s).find((a) => a.type === "core/advance") ?? eng.listActions(s)[0]!);
    s = structuredClone(s);
    s.where.husband = "town.square";
    expect(eng.listActions(s).some((a) => a.type === "base/buyout")).toBe(false); // not with this purse
    bs(s).money = content.balance.buyout.price + 100;
    bs(s).debt = 0;
    const buy = eng.listActions(s).find((a) => a.type === "base/buyout");
    expect(buy).toBeDefined();
    s = eng.dispatch(s, buy!);
    expect(bs(s).ownsPlace).toBe(true);
    expect(bs(s).money).toBe(100);
    for (let i = 0; i < 600 && s.time.phase !== "summary"; i++) s = eng.dispatch(s, eng.listActions(s).find((a) => a.type === "core/advance") ?? eng.listActions(s)[0]!);
    expect(bs(s).today.rent).toBe(0);
  });
});
