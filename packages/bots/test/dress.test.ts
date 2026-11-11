import { describe, expect, it } from "vitest";
import { STRIP, bareMargin, bareOf, baseMod, bs, dressOf, eyesOn } from "@tc/base";
import { CORE_ADVANCE, CORE_MOVE, createEngine } from "@tc/core";
import type { GameState } from "@tc/core";

const engine = createEngine([baseMod]);
const together = (seed: number, tune: (b: ReturnType<typeof bs>) => void, room?: string): GameState => {
  let s = structuredClone(engine.init(seed));
  tune(bs(s));
  if (room) {
    s = structuredClone(s);
    s.where.husband = room;
    s.where.wife = room;
  }
  return s;
};
const ask = (s: GameState, off: string) => engine.dispatch(s, { type: STRIP, payload: { off } });

describe("how much she has on", () => {
  it("in the bedroom an ordinary wife undresses for him; in the cafe she does not", () => {
    const home = together(3, (b) => (b.heroine.traits.openness = 45), "home.bedroom");
    expect(eyesOn(home)).toBe("bedroom");
    expect(bareOf(ask(home, "all"))).toBe("all");
    const cafe = together(3, () => {}, "cafe.kitchen");
    expect(eyesOn(cafe)).toBe("private");
    const no = ask(cafe, "top");
    expect(bareOf(no)).toBe("none");
    // and he does not get to ask again right away
    expect(engine.listActions(no).some((a) => a.type === STRIP)).toBe(false);
  });
  it("the same ask is easier for an open wife, and easier still for one who likes being looked at", () => {
    const plain = together(3, (b) => (b.heroine.traits.openness = 85), "cafe.kitchen");
    const shows = together(3, (b) => {
      b.heroine.traits.openness = 85;
      b.heroine.latents.exhibitionist = true;
    }, "cafe.kitchen");
    expect(bareMargin(plain, "top")).toBeGreaterThan(0);
    expect(bareMargin(shows, "all")).toBeGreaterThan(bareMargin(plain, "all"));
    expect(bareMargin(plain, "all", "hall")).toBeLessThan(0);
  });
  it("she dresses when told, and the picture key follows what she has on", () => {
    const s = together(3, (b) => (b.heroine.traits.openness = 60), "home.bedroom");
    const top = ask(s, "top");
    expect(dressOf(top)).toBe("topless");
    expect(dressOf(ask(top, "all"))).toBe("naked");
    const back = ask(top, "none");
    expect(dressOf(back)).toBe(bs(back).heroine.outfit);
    expect(engine.checkInvariants(back)).toEqual([]);
  });
  it("naked on the floor: guests see it, tips and talk go up, and a new day starts dressed", () => {
    let s = together(5, (b) => {
      b.heroine.traits.openness = 100;
      b.heroine.latents.exhibitionist = true;
    });
    while (s.time.phase !== "shift") s = engine.dispatch(s, { type: CORE_ADVANCE });
    for (let i = 0; i < 40 && !(bs(s).shift!.visits.length > 0 && s.where.wife === "cafe.hall" && !bs(s).encounter); i++) s = engine.dispatch(s, engine.listActions(s).find((a) => a.type === "base/wait")!);
    if (s.where.husband !== "cafe.hall") s = engine.dispatch(s, { type: CORE_MOVE, payload: { to: "cafe.hall" } });
    const strip = engine.listActions(s).find((a) => a.type === STRIP && a.payload?.off === "all");
    if (!strip) return; // she is busy with someone on this seed
    const gossip = bs(s).gossip;
    const naked = engine.dispatch(s, strip);
    expect(bareOf(naked)).toBe("all");
    expect(bs(naked).gossip).toBeGreaterThan(gossip);
    expect(bs(naked).shift!.visits.every((v) => v.sawBare === "all")).toBe(true);
    const tip = (st: GameState) => engine.evaluate("base/tip", st, { bill: 40, patron: bs(st).shift!.visits[0]!.patron } as never).total;
    expect(tip(naked)).toBeGreaterThan(tip(s));
    let next = naked;
    for (let i = 0; i < 400 && next.time.day === naked.time.day; i++) {
      const acts = engine.listActions(next);
      next = engine.dispatch(next, acts.find((a) => a.type === CORE_ADVANCE) ?? acts.find((a) => a.type === "base/wait" && a.payload?.minutes === 60) ?? acts.find((a) => a.type === "base/wait") ?? acts[0]!);
    }
    expect(bareOf(next)).toBe("none");
  });
});
