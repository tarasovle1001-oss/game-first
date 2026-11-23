import { describe, expect, it } from "vitest";
import { baseMod, bs, content, toneOf } from "@tc/base";
import { createEngine } from "@tc/core";
import type { GameState } from "@tc/core";
import { lovingStrategy, ownerStrategy } from "../src";

const engine = createEngine([baseMod]);
const Hn = content.intimacy.her;

describe("who she is in bed with him", () => {
  it("her tone follows her power over him: asks, suggests, says, orders", () => {
    const at = (power: number) => {
      const s = structuredClone(engine.init(1)) as GameState;
      bs(s).power = power;
      return toneOf(s);
    };
    expect([0, 24, 25, 49, 50, 74, 75, 100].map(at)).toEqual([0, 0, 1, 1, 2, 2, 3, 3]);
  });
  it("his failures are counted, never past the cap, and a good mood lets some go", () => {
    let most = 0;
    let forgiven = 0;
    let reasons = 0;
    for (const seed of [1, 2, 3, 4]) {
      let s = engine.init(seed, { base: { preset: "bookish" } });
      let last = s.log.at(-1);
      while (s.time.day <= 14) {
        s = engine.dispatch(s, (seed % 2 ? ownerStrategy : lovingStrategy)(engine.listActions(s), s, () => 0));
        const owes = bs(s).owes ?? 0;
        expect(owes).toBeGreaterThanOrEqual(0);
        expect(owes).toBeLessThanOrEqual(Hn.owes.max);
        most = Math.max(most, owes);
        const i = last ? s.log.lastIndexOf(last) : -1;
        for (const e of s.log.slice(i + 1)) {
          if (e.key === "log.owes.forgiven") forgiven += 1;
          if (e.key.startsWith("log.her.night.")) reasons += 1;
        }
        last = s.log.at(-1);
      }
    }
    expect(most).toBeGreaterThan(0);
    expect(reasons).toBeGreaterThan(0);
    expect(forgiven).toBeGreaterThanOrEqual(0);
  });
  it("every line a night can open with exists in both languages, for every reason and tone", async () => {
    const { readFileSync } = await import("node:fs");
    for (const lang of ["ru", "en"]) {
      const text = readFileSync(new URL(`../../base/locales/${lang}.yaml`, import.meta.url), "utf8");
      for (const why of ["need", "guest", "punish", "reward", "play"]) for (const t of [0, 1, 2, 3]) expect(text).toContain(`log.her.night.${why}.t${t}:`);
      for (const k of ["more", "need", "refused"]) for (const t of [0, 1, 2, 3]) expect(text).toContain(`log.bed.second.${k}.t${t}:`);
      for (const why of ["early", "wanting", "pestering", "declined", "refused"]) expect(text).toContain(`log.owes.${why}.thought:`);
    }
  });
});

describe("the small hours: she sees to herself next to him, and the player watches (23.11)", () => {
  const eng = createEngine([baseMod]);
  const night = (seed: number) => {
    let s = eng.init(seed);
    for (let i = 0; i < 600 && s.time.phase !== "night"; i++) s = eng.dispatch(s, eng.listActions(s).find((a) => a.type === "core/advance") ?? eng.listActions(s)[0]!);
    s = structuredClone(s);
    bs(s).approach = null;
    bs(s).complaint = null;
    s.where.wife = s.where.husband = "home.bedroom";
    return s;
  };
  it("watching takes three looks and ends with her having had her own; the picture is hers alone", () => {
    let s = night(5);
    bs(s).night!.watch = { step: 0, awake: false };
    expect(eng.currentScene(s)!.type).toBe("her_solo");
    // asleep, he cannot reach for her: the player only watches or looks away
    expect(eng.listActions(s).filter((a) => a.type === "base/watch").map((a) => a.payload!.do)).toEqual(["look", "leave"]);
    for (let i = 0; i < 3; i++) s = eng.dispatch(s, { type: "base/watch", payload: { do: "look" } });
    expect(bs(s).night!.watch).toBeUndefined();
    expect(bs(s).heroine.satisfied).toBeGreaterThanOrEqual(60);
    expect(eng.checkInvariants(s)).toEqual([]);
  });
  it("awake, he can reach for her: a wife who wants him pulls him in, one who does not goes cold", () => {
    const warm = night(5);
    bs(warm).night!.watch = { step: 0, awake: true };
    Object.assign(bs(warm).heroine.marriage, { desire: 80, resent: 0 });
    const yes = eng.dispatch(warm, { type: "base/watch", payload: { do: "join" } });
    expect(bs(yes).night!.wants).toBe(true);
    const cold = night(5);
    bs(cold).night!.watch = { step: 0, awake: true };
    Object.assign(bs(cold).heroine.marriage, { desire: 10, resent: 0 });
    const no = eng.dispatch(cold, { type: "base/watch", payload: { do: "join" } });
    expect(bs(no).night!.scene).toBe("cold_back");
    expect(bs(no).night!.watch).toBeUndefined();
  });
  it("sleeping until something happens stops when she starts", () => {
    let hits = 0;
    for (let seed = 1; seed <= 25 && hits === 0; seed++) {
      let s = night(seed);
      const h = bs(s).heroine;
      h.arousal = 95;
      h.satisfied = 0;
      h.energy = 80;
      bs(s).night!.wants = false;
      const sleep = eng.listActions(s).find((a) => a.type === "base/sleep" && a.payload?.until === "event");
      if (!sleep) continue;
      s = eng.dispatch(s, sleep);
      if (s.time.phase !== "night" || !bs(s).night?.watch) continue;
      hits++;
      expect(eng.listActions(s).some((a) => a.type === "base/watch" && a.payload?.do === "look")).toBe(true);
    }
    expect(hits).toBeGreaterThan(0);
  });
});
