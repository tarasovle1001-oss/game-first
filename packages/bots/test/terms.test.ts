import { describe, expect, it } from "vitest";
import { ABOUT, ALLOW, baseMod, bs, content, PERMIT, PRESS, STANCE, trustOf, WISH, wished } from "@tc/base";
import { CORE_ADVANCE, CORE_MOVE, createEngine } from "@tc/core";
import type { GameState } from "@tc/core";

const engine = createEngine([baseMod]);
const T = content.terms;
const atBar = (seed: number, setup?: Parameters<typeof engine.init>[1]) => engine.dispatch(engine.init(seed, setup), { type: CORE_MOVE, actor: "husband", payload: { to: "cafe.bar" } });
const has = (s: GameState, type: string, where?: (p: Record<string, unknown>) => boolean) => engine.listActions(s).some((a) => a.type === type && (!where || where(a.payload ?? {})));
const guest = (s: GameState) => {
  const c = structuredClone(s);
  const b = bs(c);
  b.patrons.p1 = { id: "p1", type: content.patronTypes[0]!.id, name: 1, age: 30, build: "average", size: 16, stamina: 2, traits: { persistence: 50, charm: 50, honesty: 50, jealousy: 50, generosity: 50 }, approach: "court", regular: true, memory: { visits: 3, lastDay: 1, served: 3, tipsTotal: 0, affinity: 20, interest: 50, tier: 2, acts: {}, refusals: 0, hasNumber: false, sizeKnown: false, orgasms: 0 } };
  return c;
};
const consent = (s: GameState, act: string, partner = "p1") => engine.evaluate("base/consent", s, { act, partner, loc: "cafe.hall", offer: 0, pressure: 0 });

describe("what is agreed between them", () => {
  it("a wish is said for the day, undoes its opposite, and counts in what she answers guests", () => {
    let s = guest(atBar(5, { base: { preset: "curious" } }));
    const before = consent(s, "touch").total;
    s = engine.dispatch(s, { type: WISH, payload: { id: "sexier" } });
    expect(wished(s, "sexier")).toBe(true);
    expect(consent(s, "touch").total).toBeGreaterThanOrEqual(before + T.wishes.sexier!.consent! - 0.1);
    expect(consent(s, "touch").rows.find((r) => r.id === "consent.wish")!.value).toBe(T.wishes.sexier!.consent);
    s = engine.dispatch(s, { type: WISH, payload: { id: "tone_down" } });
    expect(wished(s, "sexier")).toBe(false);
    expect(bs(s).directive).toBe("reserved");
    expect(has(s, WISH, (p) => p.id === "tone_down")).toBe(true); // it can be said again
  });
  it("the same words mean more to a woman who is ready for more, at once, and they stand until they fade", () => {
    const told = (traits: { openness: number; fidelity: number }) => engine.dispatch(atBar(5, { base: { traits } }), { type: WISH, payload: { id: "friendlier" } });
    const plain = told({ openness: 30, fidelity: 85 });
    const loose = told({ openness: 85, fidelity: 25 });
    const moved = (s: GameState) => Object.keys(bs(s).expect).length;
    expect(moved(plain)).toBeGreaterThan(0); // something changed the moment it was said
    expect(moved(loose)).toBeGreaterThan(moved(plain));
    expect(bs(plain).expect.sex).toBeUndefined();
    expect(bs(loose).expect.sex).toBeDefined();
    // said again it goes further; and it is still there tomorrow
    const flirt = bs(loose).expect.flirt!;
    let s = engine.dispatch(loose, { type: WISH, payload: { id: "friendlier" } });
    expect(bs(s).expect.flirt!).toBeGreaterThan(flirt);
    expect(bs(s).wishStr!.friendlier).toBe(100);
    while (s.time.day < 2) s = engine.dispatch(s, engine.listActions(s).find((a) => a.type === "core/advance") ?? engine.listActions(s).find((a) => a.type === "base/wait") ?? engine.listActions(s)[0]!);
    expect(wished(s, "friendlier")).toBe(true);
    expect(bs(s).directive).toBe("friendly");
    expect(bs(s).wishStr!.friendlier).toBeLessThan(100);
  });
  it("asked for more than she is, she takes it badly", () => {
    let s = atBar(5, { base: { traits: { openness: 10, fidelity: 90 } } });
    const trust = trustOf(s);
    s = engine.dispatch(s, { type: WISH, payload: { id: "watch_you" } });
    expect(s.log.at(-1)!.key).toBe("log.wish.watch_you.shock");
    expect(trustOf(s)).toBeLessThan(trust);
  });
  it("one thing at a time: a no to her mouth is a no to those acts only", () => {
    let s = guest(atBar(5));
    s = engine.dispatch(s, { type: ALLOW, payload: { item: "her_mouth", say: "forbid" } });
    expect(bs(s).perm!.her_mouth).toBe("forbid");
    expect(bs(s).expect.blowjob).toBe(content.consent.expect.forbid);
    expect(bs(s).expect.handjob).toBeUndefined();
    expect(has(s, ALLOW, (p) => p.item === "her_mouth" && p.say === "forbid")).toBe(false);
  });
  it("she asks first; a yes sets what she thinks he allows, a no to something she wanted gets a why", () => {
    const base = guest(atBar(5, { base: { preset: "hungry", mode: "open" } }));
    const asked = structuredClone(base);
    bs(asked).ask = { patron: "p1", act: "kiss" };
    expect(has(asked, PERMIT, (p) => p.say === "yes")).toBe(true);
    const yes = engine.dispatch(asked, { type: PERMIT, payload: { say: "yes" } });
    expect(bs(yes).expect.kiss).toBe(content.consent.expect.approve);
    expect(bs(yes).ask).toBeUndefined();
    const no = engine.dispatch(asked, { type: PERMIT, payload: { say: "no" } });
    expect(bs(no).expect.kiss).toBe(content.consent.expect.forbid);
    if (bs(no).askWhy) {
      const explained = engine.dispatch(no, { type: PERMIT, payload: { say: "explain" } });
      expect(bs(explained).askWhy).toBeUndefined();
      expect(trustOf(explained)).toBeGreaterThan(trustOf(no));
    }
  });
  it("where he stands on one man is its own row in what she answers him", () => {
    let s = guest(atBar(5));
    bs(s).diary = [{ day: s.time.day, with: { p1: { touch: 1 } }, seen: { p1: true }, came: 0 }];
    const before = consent(s, "kiss").total;
    expect(has(s, STANCE, (p) => p.say === "away")).toBe(true);
    s = engine.dispatch(s, { type: STANCE, payload: { say: "away", patron: "p1", name: 1 } });
    expect(bs(s).patrons.p1!.memory.stance).toBe("away");
    expect(consent(s, "kiss").total).toBeLessThan(before - 15);
    expect(has(s, STANCE)).toBe(false);
  });
  it("talking it over: 'never again' forbids what he saw; 'I will step in' is a promise", () => {
    let s = guest(atBar(5));
    bs(s).diary = [{ day: s.time.day, with: { p1: { grope: 1 } }, seen: { p1: true }, came: 0 }];
    const never = engine.dispatch(s, { type: ABOUT, payload: { say: "never" } });
    expect(bs(never).expect.grope).toBe(content.consent.expect.forbid);
    s = engine.dispatch(s, { type: ABOUT, payload: { say: "protect" } });
    expect(bs(s).promises!.some((p) => p.kind === "protect")).toBe(true);
    expect(has(s, ABOUT)).toBe(false);
  });
  it("a promised date that never happens costs trust", () => {
    let s = atBar(5);
    s = engine.dispatch(s, { type: "base/promise", payload: { kind: "date" } });
    const trust = trustOf(s);
    let guard = 0;
    while (s.time.day < 5 && guard++ < 3000) {
      const acts = engine.listActions(s);
      if (bs(s).complaint) s = engine.dispatch(s, { type: "base/hear-her", payload: { how: "probe" } });
      else s = engine.dispatch(s, acts.find((a) => a.type === CORE_ADVANCE) ?? acts.find((a) => a.type === "base/wait" && a.payload?.minutes === 60) ?? acts[0]!);
    }
    expect(bs(s).promises?.some((p) => p.kind === "date") ?? false).toBe(false);
    expect(s.log.some((e) => e.key === "log.promise.broken.date")).toBe(true);
    expect(trustOf(s)).toBeLessThan(trust);
  });
  it("pushing after a no works on a timid wife some of the time, and always costs trust", () => {
    let pressed = 0;
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const s = structuredClone(engine.init(seed, { base: { traits: { confidence: 10 } } }));
      s.time.phase = "night";
      bs(s).night = { scene: "cold_back", asked: true, sex: null, minute: 10, refused: "sex" };
      s.where.husband = "home.bedroom";
      s.where.wife = "home.bedroom";
      expect(has(s, PRESS)).toBe(true);
      const after = engine.dispatch(s, { type: PRESS });
      expect(trustOf(after)).toBeLessThan(trustOf(s));
      expect(has(after, PRESS)).toBe(false);
      if (bs(after).night!.counter === "sex") pressed += 1;
    }
    expect(pressed).toBeGreaterThan(0);
    expect(pressed).toBeLessThan(8);
  });
});
