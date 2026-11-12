import { describe, expect, it } from "vitest";
import { baseMod, bs, TALK } from "@tc/base";
import { createEngine } from "@tc/core";
import type { GameState } from "@tc/core";

const engine = createEngine([baseMod]);
const together = (edit?: (s: GameState) => void): GameState => {
  const s = structuredClone(engine.init(5));
  s.where.wife = s.where.husband!;
  edit?.(s);
  return s;
};
const talk = (s: GameState, what: string) => engine.dispatch(s, engine.listActions(s).find((a) => a.type === TALK && a.payload?.do === what)!);

describe("nothing is said only once", () => {
  it("a word stays on the menu after it was used, and is worth less each time", () => {
    let s = together((x) => void (bs(x).heroine.mood = 50));
    const m0 = bs(s).heroine.mood;
    s = talk(s, "compliment");
    const m1 = bs(s).heroine.mood;
    expect(engine.listActions(s).some((a) => a.type === TALK && a.payload?.do === "compliment")).toBe(true);
    s = talk(s, "compliment");
    const m2 = bs(s).heroine.mood;
    s = talk(s, "compliment");
    const m3 = bs(s).heroine.mood;
    expect(m1 - m0).toBeGreaterThan(m2 - m1);
    expect(m2 - m1).toBeGreaterThan(0);
    expect(m3).toBe(m2);
    expect(engine.checkInvariants(s)).toEqual([]);
  });
  it("hands on her again and again is pestering: it adds up faster each time", () => {
    let s = together((x) => void ((bs(x).heroine.marriage.desire = 90), (bs(x).heroine.traits.openness = 80)));
    const steps: number[] = [];
    for (let i = 0; i < 3; i++) {
      const before = bs(s).heroine.annoyHim ?? 0;
      s = talk(s, "grab_ass");
      steps.push((bs(s).heroine.annoyHim ?? 0) - before);
    }
    expect(steps[1]!).toBeGreaterThan(steps[0]!);
    expect(steps[2]!).toBeGreaterThan(steps[1]!);
    expect(engine.listActions(s).some((a) => a.type === TALK && a.payload?.do === "grab_ass")).toBe(true);
  });
});

describe("not only in the bedroom, not only at night", () => {
  const keen = (x: GameState) => {
    const h = bs(x).heroine;
    h.marriage.desire = 100;
    h.arousal = 90;
    h.mood = 90;
  };
  it("in the afternoon, wherever the two of them are alone", () => {
    let s = together(keen);
    expect(s.time.phase).toBe("prep");
    const here = engine.listActions(s).find((a) => a.type === "base/upstairs" && a.payload?.act === "sex" && a.payload?.here === 1)!;
    expect(here).toBeDefined();
    const left = bs(s).day!.left;
    s = engine.dispatch(s, here);
    expect(bs(s).night?.sex).toBeTruthy();
    if (s.where.husband !== "home.bedroom") expect(bs(s).proposals.at(-1)!.rows.some((r) => r.id === "consent.elsewhere")).toBe(true);
    expect(engine.listActions(s).some((a) => a.type === "core/advance" || a.type === "base/prep-wait")).toBe(false);
    expect(engine.checkInvariants(s)).toEqual([]);
    for (let i = 0; i < 200 && bs(s).night?.sex; i++) s = engine.dispatch(s, { type: "base/bed", payload: { do: "keep" } });
    expect(bs(s).night).toBeNull();
    expect(bs(s).day!.left).toBeLessThan(left); // the afternoon did not stand still
    expect(engine.checkInvariants(s)).toEqual([]);
  });
  it("in front of the guests it is a hard check, and the room does not forget it", () => {
    let s = engine.dispatch(engine.init(8), { type: "core/advance" });
    for (let i = 0; i < 9 && bs(s).shift!.visits.filter((v) => v.stay > 0).length === 0; i++) s = engine.dispatch(s, { type: "base/wait", payload: { minutes: 10 } });
    const base = structuredClone(s);
    base.where.husband = "cafe.hall";
    base.where.wife = "cafe.hall";
    bs(base).encounter = null;
    bs(base).reaction = null;
    expect(bs(base).shift!.visits.filter((v) => v.stay > 0).length).toBeGreaterThan(0);
    keen(base);
    const pub = (x: GameState) => engine.listActions(x).find((a) => a.type === "base/upstairs" && a.payload?.act === "sex" && a.payload?.pub === 1)!;
    const shy = structuredClone(base);
    bs(shy).heroine.traits.openness = 20;
    expect(pub(shy)).toBeDefined();
    const no = engine.dispatch(shy, pub(shy));
    expect(bs(no).night).toBeNull();
    expect(bs(no).proposals.at(-1)!.rows.some((r) => r.id === "consent.plain_sight" && r.value < -40)).toBe(true);
    expect(engine.listActions(no).some((a) => a.type === "base/upstairs")).toBe(true); // he can ask again; she will like it less
    const bold = structuredClone(base);
    bs(bold).heroine.traits.openness = 100;
    bs(bold).heroine.traits.fidelity = 50;
    const gossip = bs(bold).gossip;
    const yes = engine.dispatch(bold, pub(bold));
    if (bs(yes).night?.sex) {
      expect(bs(yes).night!.here).toBe("public");
      expect(bs(yes).gossip).toBeGreaterThan(gossip);
      expect(yes.where.wife).toBe("cafe.hall");
    }
    expect(engine.checkInvariants(yes)).toEqual([]);
  });
});

describe("shopping", () => {
  it("she comes along to the shops and sees what he buys", () => {
    let s = together();
    const go = engine.listActions(s).find((a) => a.type === "base/shop-together")!;
    expect(go).toBeDefined();
    s = engine.dispatch(s, go);
    expect(s.where.husband).toBe("town.shops");
    expect(s.where.wife).toBe("town.shops");
    const buy = engine.listActions(s).find((a) => a.type === "base/buy" && a.payload?.kind === "outfit");
    if (buy) {
      s = engine.dispatch(s, buy);
      expect(bs(s).bag ?? []).toEqual([]);
      expect(bs(s).owned).toContain(buy.payload!.id);
    }
    expect(engine.checkInvariants(s)).toEqual([]);
  });
});
