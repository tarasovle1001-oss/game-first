import { describe, expect, it } from "vitest";
import { baseLocales, baseMod, bs, refusalWhy, TALK, voiceOf } from "@tc/base";
import { createEngine } from "@tc/core";
import type { GameState } from "@tc/core";

const engine = createEngine([baseMod]);
const withHer = (edit: (h: ReturnType<typeof bs>["heroine"]) => void): GameState =>
  (() => {
    const s = structuredClone(engine.init(5));
    // put them in one room so that he can talk to her
    s.where.wife = s.where.husband!;
    edit(bs(s).heroine);
    return s;
  })();
const say = (state: GameState, what: string) => {
  const a = engine.listActions(state).find((x) => x.type === TALK && x.payload?.do === what);
  expect(a, `no "${what}" on offer`).toBeTruthy();
  const next = engine.dispatch(state, a!);
  return { next, lines: next.log.filter((e) => e.turn === next.turn) };
};

describe("her voice", () => {
  it("names the state that colours her words", () => {
    expect(voiceOf(withHer((h) => void (h.drunk = 80)))).toBe("drunk");
    expect(voiceOf(withHer((h) => void (h.energy = 5)))).toBe("tired");
    expect(voiceOf(withHer((h) => void (h.marriage.resent = 70)))).toBe("cold");
    expect(voiceOf(withHer((h) => void ((h.mood = 90), (h.marriage.desire = 80))))).toBe("warm");
  });

  it("answers the same question differently in different states", () => {
    const keys = new Set<string>();
    for (const edit of [(h: any) => void (h.drunk = 80), (h: any) => void (h.energy = 5), (h: any) => void (h.marriage.resent = 70), (h: any) => void (h.mood = 90), (_h: any) => undefined]) {
      const { next, lines } = say(withHer(edit), "how_are_you");
      keys.add(lines[0]!.key);
      expect(bs(next).outcome?.turn).toBe(next.turn);
    }
    expect(keys.size).toBe(5);
  });

  it("uses the line written for her state, and marks a drunk line that has none", () => {
    expect(say(withHer((h) => void (h.drunk = 80)), "compliment").lines[0]!.key).toBe("log.talk.compliment.drunk");
    expect(say(withHer((h) => void (h.energy = 5)), "compliment").lines[0]!.key).toBe("log.talk.compliment.tired");
    const praise = say(withHer((h) => void (h.drunk = 80)), "praise").lines[0]!;
    expect(praise.key).toBe("log.talk.praise");
    expect(praise.tags).toContain("slur");
  });

  it("finds the reason behind a no", () => {
    const row = (id: string, value: number) => ({ id: `consent.${id}`, value });
    expect(refusalWhy([row("act", 30), row("tired", -40), row("mood", -5)])).toBe("tired");
    expect(refusalWhy([row("resent", -25), row("sore", -10)])).toBe("resent");
    expect(refusalWhy([row("act", 10)])).toBe("plain");
    // every reason a refusal can name has its line, for a guest or for him, in both languages
    for (const lang of ["ru", "en"]) for (const why of ["tired", "sore", "annoyed", "mood", "not_her", "sated", "feelings"]) {
      expect(baseLocales[lang]![`log.refuse.why.${why}`]).toBeTruthy();
      expect(baseLocales[lang]![`log.husband.refuse.${why}`]).toBeTruthy();
    }
  });
});
