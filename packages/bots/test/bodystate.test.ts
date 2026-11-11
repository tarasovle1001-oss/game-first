import { describe, expect, it } from "vitest";
import { AFTER, baseMod, BED, bs, content, describeScene, dressShift, foreignMarks, NIGHT_ACT, slick, soreOf, wearOf } from "@tc/base";
import { CORE_ADVANCE, createEngine } from "@tc/core";
import type { GameState } from "@tc/core";

const engine = createEngine([baseMod]);
const I = content.intimacy;
const has = (s: GameState, type: string, where?: (p: Record<string, unknown>) => boolean) => engine.listActions(s).some((a) => a.type === type && (!where || where(a.payload ?? {})));
const consent = (s: GameState, act: string) => engine.evaluate("base/consent", s, { act, partner: "husband", loc: "home.bedroom", offer: 0, pressure: 0 });
const night = (seed: number, setup?: Parameters<typeof engine.init>[1]): GameState => {
  let s = engine.dispatch(engine.init(seed, setup), { type: CORE_ADVANCE });
  let guard = 0;
  while (s.time.phase === "shift" && guard++ < 400) {
    const acts = engine.listActions(s);
    s = engine.dispatch(s, acts.find((a) => a.type === CORE_ADVANCE) ?? acts.find((a) => a.type === "base/wait" && a.payload?.minutes === 60) ?? acts.find((a) => a.type === "base/wait") ?? acts[0]!);
  }
  const c = structuredClone(s);
  bs(c).complaint = null;
  bs(c).approach = null;
  bs(c).night = { scene: "sleeping", asked: false, sex: null, minute: 0 };
  return c;
};
const inBed = (s: GameState, act = "sex"): GameState => {
  const c = structuredClone(s);
  bs(c).heroine.marriage.desire = 90;
  bs(c).heroine.marriage.resent = 0;
  bs(c).heroine.arousal = 60;
  bs(c).heroine.annoyHim = 0;
  bs(c).heroine.annoyance = 0;
  bs(c).heroine.feel = {};
  return engine.dispatch(c, { type: NIGHT_ACT, payload: { act } });
};

describe("bed and body", () => {
  it("a sore zone counts against acts in it and past the line it is simply off; cum left inside makes the next one easier", () => {
    const s = structuredClone(engine.init(5));
    const base = consent(s, "sex").total;
    bs(s).heroine.sore = { vagina: 50 };
    expect(consent(s, "sex").total).toBeCloseTo(base - 30 * I.zones.consent, 1);
    expect(consent(s, "blowjob").rows.some((r) => r.id === "consent.sore")).toBe(false);
    bs(s).heroine.sore = { vagina: 90 };
    expect(consent(s, "sex").total).toBeCloseTo(base - I.zones.enough, 1);
    bs(s).heroine.sore = {};
    bs(s).heroine.cum = { inside: 30 };
    expect(slick(s, "vagina")).toBe(true);
    expect(consent(s, "sex").total).toBeCloseTo(base + I.zones.slickConsent, 1);
  });
  it("a night in bed leaves her a little sore, and it fades by morning", () => {
    let s = inBed(night(4));
    if (!bs(s).night?.sex) return;
    for (let i = 0; i < 60 && bs(s).night?.sex; i++) s = engine.dispatch(s, { type: BED, payload: { do: "keep" } });
    const sore = soreOf(s, "vagina");
    expect(sore).toBeGreaterThan(0);
    s = engine.dispatch(engine.dispatch(s, { type: CORE_ADVANCE }), { type: CORE_ADVANCE });
    expect(soreOf(s, "vagina")).toBeLessThan(sore);
  });
  it("handed the lead, she undresses herself, picks what they do and decides when he may", () => {
    let s = inBed(night(4));
    if (!bs(s).night?.sex) return;
    expect(has(s, BED, (p) => p.do === "give_lead")).toBe(true);
    s = engine.dispatch(s, { type: BED, payload: { do: "give_lead" } });
    expect(bs(s).night!.sex!.lead).toBe(true);
    expect(bs(s).night!.sex!.top).toBe(true);
    expect(has(s, BED, (p) => p.do === "keep")).toBe(false);
    expect(has(s, BED, (p) => p.do === "follow")).toBe(true);
    for (let i = 0; i < 40 && bs(s).night?.sex; i++) s = engine.dispatch(s, { type: BED, payload: { do: "follow" } });
    expect(bs(s).night!.sex).toBeNull();
    expect(s.log.some((e) => e.key.startsWith("log.bed.lead."))).toBe(true);
  });
  it("where he comes: there are more places, and afterwards he can ask for more", () => {
    let s = inBed(night(4));
    if (!bs(s).night?.sex) return;
    const c = structuredClone(s);
    bs(c).night!.sex!.his = 90;
    bs(c).heroine.arousal = 10; // she will not hold him in
    expect(has(c, BED, (p) => p.do === "finish" && p.where === "belly")).toBe(true);
    s = engine.dispatch(c, { type: BED, payload: { do: "finish", where: "belly" } });
    expect(bs(s).heroine.cum?.body).toBeGreaterThan(0);
    expect(bs(s).heroine.cumHis?.body).toBe(true);
    expect(foreignMarks(s)).toEqual([]);
    expect(has(s, AFTER, (p) => p.do === "lick_it")).toBe(true);
    s = engine.dispatch(s, { type: AFTER, payload: { do: "lick_it" } });
    expect(has(s, AFTER)).toBe(false);
  });
  it("another man's mark on her is seen by a husband who looks, once", () => {
    let s = engine.dispatch(engine.init(4), { type: CORE_ADVANCE });
    s = structuredClone(s);
    bs(s).heroine.cum = { face: 20 };
    bs(s).heroine.cumHis = { face: false };
    const before = bs(s).suspicion;
    s.where.wife = "cafe.hall";
    s.where.husband = "cafe.hall";
    s = engine.dispatch(s, { type: "base/wait", payload: { minutes: 1 } });
    expect(bs(s).suspicion).toBeGreaterThan(before);
    expect(bs(s).shift!.marksSeen).toBe(true);
  });
  it("what she has on depends on where and when; a bad morning dresses her down", () => {
    const s = structuredClone(engine.init(4));
    expect(wearOf(s)).toBe(bs(s).heroine.outfit);
    s.where.wife = "home.bedroom";
    expect(wearOf(s)).toBe(I.wear.home);
    expect(describeScene(s, true).heroine).toContain("oversized t-shirt, shorts");
    expect(dressShift(s)).toBe(0);
    bs(s).heroine.mood = 10;
    bs(s).heroine.feel = { shame: 40 };
    expect(dressShift(s)).toBeLessThan(-15);
  });
});
