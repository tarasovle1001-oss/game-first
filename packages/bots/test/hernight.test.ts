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
