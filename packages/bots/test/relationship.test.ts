import { describe, expect, it } from "vitest";
import { baseMod, bs, expectOf, REACT_APPROVE, REACT_STOP, CAUGHT_STOP, CAUGHT_WATCH, CONFRONT, fitOf, NIGHT_ACT, pleasureFromSize, WAIT } from "@tc/base";
import { CORE_ADVANCE, CORE_MOVE, createEngine } from "@tc/core";
import type { GameState } from "@tc/core";
import { awayStrategy } from "../src";

const engine = createEngine([baseMod]);
const wait10 = { type: WAIT, payload: { minutes: 10 } };
const has = (s: GameState, type: string) => engine.listActions(s).some((a) => a.type === type);

/** Plays with the husband in the kitchen until a private encounter is running. */
function untilPrivateEncounter(seed: number): GameState {
  let s = engine.init(seed);
  for (let i = 0; i < 100000; i++) {
    const enc = bs(s).encounter;
    if (enc && enc.loc !== "cafe.hall") return s;
    const actions = engine.listActions(s);
    const step = s.time.phase === "shift" && s.where.husband === "cafe.kitchen" ? actions.find((a) => a.type === WAIT && a.payload?.minutes === 10) : undefined;
    s = engine.dispatch(s, step ?? awayStrategy(actions, s, () => 0));
  }
  throw new Error("no private encounter happened");
}
const walkIn = (s: GameState): GameState => {
  const loc = bs(s).encounter!.loc;
  // from the kitchen the staff room is one step; the toilet is behind the bar and the hall
  const path = loc === "cafe.staff" ? ["cafe.staff"] : ["cafe.bar", "cafe.hall", "cafe.toilet"];
  for (const to of path) s = engine.dispatch(s, { type: CORE_MOVE, actor: "husband", payload: { to } });
  return s;
};
const toNight = (s: GameState): GameState => {
  while (s.time.phase !== "night") {
    const actions = engine.listActions(s);
    s = engine.dispatch(s, actions.find((a) => a.type === CORE_ADVANCE) ?? actions.find((a) => a.type === WAIT && a.payload?.minutes === 60)!);
  }
  return s;
};

describe("body", () => {
  it("size pleasure peaks slightly above what she is used to", () => {
    expect(pleasureFromSize(0.6)).toBeLessThan(pleasureFromSize(0.9));
    expect(pleasureFromSize(0.9)).toBeLessThan(pleasureFromSize(1.1));
    expect(pleasureFromSize(1.1)).toBeGreaterThan(pleasureFromSize(1.6));
  });
  it("a bigger partner stretches her and part of it stays", () => {
    const s = untilPrivateEncounter(2);
    const b = bs(s);
    expect(Object.keys(b.heroine.skills).length).toBeGreaterThan(0);
    for (const zone of ["vagina", "anus", "mouth"] as const) {
      expect(b.heroine.body[zone].peak).toBeGreaterThanOrEqual(b.heroine.body[zone].stretch);
      expect(fitOf(s, zone)).toBeGreaterThan(0);
    }
  });
});

describe("night with the husband", () => {
  it("asks once per night through the same formula and leaves a record", () => {
    let s = toNight(engine.init(4));
    expect(s.where.husband).toBe("home.bedroom");
    expect(has(s, NIGHT_ACT)).toBe(true);
    s = engine.dispatch(s, { type: NIGHT_ACT, payload: { act: "sex" } });
    const record = bs(s).proposals.at(-1)!;
    expect(record.patron).toBe("husband");
    expect(record.rows.map((r) => r.id)).toContain("consent.desire");
    expect(record.rows.map((r) => r.id)).not.toContain("consent.fidelity");
    expect(has(s, NIGHT_ACT)).toBe(false);
    expect(["sex", "left_wanting", "cold_back", "finishing_herself", "faking_it", "premature_finish", "came_too_soon_foreplay"]).toContain(engine.currentScene(s)!.type);
  });
  it("a husband who is too small for her leaves her wanting", () => {
    let s = toNight(engine.init(4));
    const stretched = structuredClone(s);
    stretched.mods.base.heroine.body.vagina = { stretch: 90, peak: 90 };
    stretched.mods.base.heroine.marriage.desire = 100; // so that she still says yes
    stretched.mods.base.heroine.arousal = 95;
    stretched.mods.base.heroine.energy = 80;
    s = engine.dispatch(stretched, { type: NIGHT_ACT, payload: { act: "sex" } });
    expect(["left_wanting", "finishing_herself", "faking_it"]).toContain(bs(s).night!.scene);
    expect(bs(s).heroine.marriage.resent).toBeGreaterThan(stretched.mods.base.heroine.marriage.resent);
  });
});

describe("hidden and open", () => {
  it("walking in on them forces a choice; stopping it ends the encounter and opens the marriage", () => {
    let s = walkIn(untilPrivateEncounter(2));
    expect(bs(s).caught).not.toBeNull();
    expect(engine.currentScene(s)!.type).toBe("caught");
    expect(has(s, WAIT)).toBe(false);
    s = engine.dispatch(s, { type: CAUGHT_STOP });
    expect(bs(s).mode).toBe("open");
    expect(bs(s).encounter).toBeNull();
    expect(engine.checkInvariants(s)).toEqual([]);
  });
  it("staying to watch opens it and gives her power", () => {
    let s = walkIn(untilPrivateEncounter(2));
    s = engine.dispatch(s, { type: CAUGHT_WATCH });
    expect(bs(s).mode).toBe("open");
    expect(bs(s).power).toBeGreaterThan(0);
    expect(bs(s).encounter).not.toBeNull();
  });
  it("backing out keeps it hidden but he knows, and can confront her at night", () => {
    let s = walkIn(untilPrivateEncounter(2));
    const back = engine.listActions(s).find((a) => a.type === CORE_MOVE)!;
    s = engine.dispatch(s, back);
    expect(bs(s).mode).toBe("hidden");
    expect(bs(s).secretKnows).toBe(true);
    s = toNight(s);
    expect(has(s, CONFRONT)).toBe(true);
    s = engine.dispatch(s, { type: CONFRONT });
    expect(bs(s).mode).toBe("open");
  });
  it("once open, his presence is no longer a wall", () => {
    let s = untilPrivateEncounter(2);
    const partner = bs(s).encounter!.patron;
    const input = { act: "kiss", partner, loc: "cafe.hall", offer: 0, pressure: 0 };
    const hidden = structuredClone(s);
    hidden.where.husband = "cafe.hall";
    const open = structuredClone(hidden);
    open.mods.base.mode = "open";
    const rowOf = (st: GameState) => engine.evaluate("base/consent", st, input).rows.find((r) => r.id === "consent.husband")?.value ?? 0;
    expect(rowOf(hidden)).toBeLessThan(-15);
    expect(rowOf(open)).toBeGreaterThan(rowOf(hidden));
    s = hidden;
  });
});

describe("the husband's bad nights", () => {
  it("after many nights without, he does not last", () => {
    const s = toNight(engine.init(4));
    const starved = structuredClone(s);
    starved.mods.base.denied = 8;
    starved.mods.base.heroine.marriage.desire = 100;
    starved.mods.base.heroine.arousal = 60;
    const after = engine.dispatch(starved, { type: NIGHT_ACT, payload: { act: "sex" } });
    expect(["came_too_soon_foreplay", "premature_finish", "finishing_herself", "faking_it"]).toContain(bs(after).night!.scene);
    expect(bs(after).heroine.marriage.resent).toBeGreaterThan(starved.mods.base.heroine.marriage.resent);
  });
  it("a dishonest wife fakes it, and only the debug log knows", () => {
    const s = toNight(engine.init(4));
    const liar = structuredClone(s);
    liar.mods.base.heroine.traits.honesty = 20;
    liar.mods.base.heroine.marriage.desire = 100;
    liar.mods.base.heroine.body.vagina = { stretch: 90, peak: 90 };
    liar.mods.base.heroine.arousal = 95;
    liar.mods.base.heroine.energy = 80;
    const after = engine.dispatch(liar, { type: NIGHT_ACT, payload: { act: "sex" } });
    expect(bs(after).night!.scene).toBe("faking_it");
    const tail = after.log.slice(-2);
    expect(tail[0]!.key).toBe("log.husband.sex.came");
    expect(tail[1]!.tags).toContain("unseen");
  });
});

describe("open marriage, her lead", () => {
  it("with enough power some nights are hers to decide", () => {
    let s = toNight(engine.init(4));
    const open = structuredClone(s);
    open.mods.base.mode = "open";
    open.mods.base.power = 90;
    s = open;
    let led = 0;
    for (let night = 0; night < 12; night++) {
      s = engine.dispatch(s, { type: CORE_ADVANCE }); // leave this night
      s = toNight(s);
      if (bs(s).night!.scene.startsWith("fd_")) {
        led += 1;
        expect(has(s, NIGHT_ACT)).toBe(false);
      }
    }
    expect(led).toBeGreaterThan(0);
  });
});

describe("where the husband stands", () => {
  it("in the hall he takes orders himself, even when she cannot", () => {
    const evening = (room: string) => {
      let s = engine.init(9);
      s = engine.dispatch(s, { type: CORE_ADVANCE });
      const moved = structuredClone(s);
      moved.where.husband = room;
      moved.mods.base.heroine.energy = 0; // she is out of it tonight
      s = moved;
      while (engine.listActions(s).some((a) => a.type === WAIT)) s = engine.dispatch(s, { type: WAIT, payload: { minutes: 60 } });
      return bs(s).shift!.served;
    };
    expect(evening("cafe.staff")).toBe(0);
    expect(evening("cafe.hall")).toBeGreaterThan(0);
  });
});

describe("what she thinks he allows", () => {
  /** Plays with the husband on the floor until something beyond flirting starts in front of him. */
  const untilReaction = (seed: number): GameState => {
    let s = engine.init(seed, { base: { preset: "hungry" } });
    for (let i = 0; i < 20000; i++) {
      if (bs(s).reaction) return s;
      const actions = engine.listActions(s);
      s = engine.dispatch(s, actions.find((a) => a.type === CORE_ADVANCE) ?? actions.find((a) => a.type === WAIT && a.payload?.minutes === 10) ?? actions.find((a) => a.type !== CORE_MOVE)!);
    }
    throw new Error("nothing ever happened in front of him");
  };
  it("silence teaches her that he does not mind, a little at a time", () => {
    let s = untilReaction(3);
    const act = bs(s).reaction!.act;
    const before = expectOf(s, act);
    while (bs(s).reaction) s = engine.dispatch(s, engine.listActions(s).find((a) => a.type === WAIT && a.payload?.minutes === 10) ?? { type: CORE_ADVANCE });
    expect(expectOf(s, act)).toBeGreaterThan(before);
    expect(expectOf(s, act)).toBeLessThan(70); // silence never makes her sure
  });
  it("stepping in ends it and tells her about everything beyond it", () => {
    let s = untilReaction(3);
    const act = bs(s).reaction!.act;
    expect(has(s, REACT_STOP)).toBe(true);
    s = engine.dispatch(s, { type: REACT_STOP });
    expect(bs(s).encounter).toBeNull();
    expect(expectOf(s, act)).toBeLessThan(-70);
    expect(expectOf(s, "sex")).toBeLessThan(0);
    expect(bs(s).told.at(-1)!.key).toBe("told.stop");
    expect(engine.checkInvariants(s)).toEqual([]);
  });
  it("a nod removes the weight of his eyes", () => {
    let s = untilReaction(3);
    const { act, patron } = bs(s).reaction!;
    const input = { act, partner: patron, loc: "cafe.hall", offer: 0, pressure: 0 };
    const weight = (st: GameState) => engine.evaluate("base/consent", st, input).rows.find((r) => r.id === "consent.husband")?.value ?? 0;
    const before = weight(s);
    s = engine.dispatch(s, { type: REACT_APPROVE });
    expect(weight(s)).toBeGreaterThan(before);
    expect(weight(s)).toBeCloseTo(0);
  });
});
