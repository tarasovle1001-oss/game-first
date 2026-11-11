import { describe, expect, it } from "vitest";
import { BED, GUEST, TALK, TELL, baseMod, bs, expectOf, REACT_APPROVE, REACT_STOP, CAUGHT_STOP, CAUGHT_WATCH, CONFRONT, fitOf, NIGHT_ACT, pleasureFromSize, WAIT } from "@tc/base";
import { CORE_ADVANCE, CORE_MOVE, createEngine } from "@tc/core";
import type { GameState } from "@tc/core";
import { awayStrategy } from "../src";

const engine = createEngine([baseMod]);
const wait10 = { type: WAIT, payload: { minutes: 10 } };
/** Plays a bedroom scene to the end with one kind of move. */
const playOut = (s: GameState, move = "keep"): GameState => {
  for (let i = 0; i < 200 && bs(s).night?.sex; i++) s = engine.dispatch(s, { type: BED, payload: { do: move } });
  return s;
};
const has = (s: GameState, type: string) => engine.listActions(s).some((a) => a.type === type);

/** Plays with the husband in the kitchen until a private encounter is running. */
function untilPrivateEncounter(seed: number): GameState {
  let s = engine.init(seed);
  for (let i = 0; i < 100000; i++) {
    const enc = bs(s).encounter;
    if (enc && enc.loc !== "cafe.hall") return s;
    const actions = engine.listActions(s);
    const step = s.time.phase === "shift" && s.where.husband === "cafe.kitchen" ? (actions.some((a) => a.type === WAIT) ? { type: WAIT, payload: { minutes: 10 } } : undefined) : undefined;
    s = engine.dispatch(s, step ?? awayStrategy(actions, s, () => 0));
  }
  throw new Error("no private encounter happened");
}
const walkIn = (s: GameState): GameState => {
  const loc = bs(s).encounter!.loc;
  // shortest way through the building
  const links = new Map(engine.locations().map((l) => [l.id, l.links ?? []]));
  const from = new Map<string, string>([[s.where.husband!, ""]]);
  const queue = [s.where.husband!];
  while (queue.length && !from.has(loc)) {
    const at = queue.shift()!;
    for (const next of links.get(at) ?? []) if (!from.has(next)) (from.set(next, at), queue.push(next));
  }
  const path: string[] = [];
  for (let at = loc; from.get(at); at = from.get(at)!) path.unshift(at);
  for (const to of path) s = engine.dispatch(s, { type: CORE_MOVE, actor: "husband", payload: { to } });
  return s;
};
const toNight = (s: GameState): GameState => {
  while (s.time.phase !== "night") {
    const actions = engine.listActions(s);
    s = engine.dispatch(s, actions.find((a) => a.type === CORE_ADVANCE) ?? (actions.some((a) => a.type === WAIT) ? { type: WAIT, payload: { minutes: 60 } } : undefined)!);
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
    if (record.verdict !== "refuse") {
      // it is a scene now: it has to be played, and the night cannot be skipped meanwhile
      expect(bs(s).night!.sex).not.toBeNull();
      expect(has(s, CORE_ADVANCE)).toBe(false);
      expect(has(s, BED)).toBe(true);
      s = playOut(s);
      expect(has(s, CORE_ADVANCE)).toBe(true);
    }
    expect(["sex", "left_wanting", "cold_back", "finishing_herself", "faking_it", "premature_finish", "came_too_soon_foreplay"]).toContain(engine.currentScene(s)!.type);
  });
  it("a husband who is too small for her leaves her wanting", () => {
    let s = toNight(engine.init(4));
    const stretched = structuredClone(s);
    stretched.mods.base.heroine.body.vagina = { stretch: 90, peak: 90 };
    stretched.mods.base.heroine.marriage.desire = 100; // so that she still says yes
    stretched.mods.base.heroine.arousal = 95;
    stretched.mods.base.heroine.energy = 80;
    s = playOut(engine.dispatch(stretched, { type: NIGHT_ACT, payload: { act: "sex" } }));
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
    const turnsWith = (denied: number) => {
      const s = structuredClone(toNight(engine.init(4)));
      s.mods.base.denied = denied;
      s.mods.base.heroine.marriage.desire = 100;
      s.mods.base.heroine.arousal = 20;
      let st = engine.dispatch(s, { type: NIGHT_ACT, payload: { act: "sex" } });
      let turns = 0;
      for (; bs(st).night?.sex && turns < 200; turns++) st = engine.dispatch(st, { type: BED, payload: { do: "keep" } });
      return { turns, st, before: s };
    };
    const starved = turnsWith(8);
    expect(starved.turns).toBeLessThan(turnsWith(0).turns);
    expect(starved.turns).toBeLessThanOrEqual(3);
    expect(bs(starved.st).heroine.marriage.resent).toBeGreaterThan(starved.before.mods.base.heroine.marriage.resent);
  });
  it("a dishonest wife fakes it, and only the debug log knows", () => {
    const s = toNight(engine.init(4));
    const liar = structuredClone(s);
    liar.mods.base.heroine.traits.honesty = 20;
    liar.mods.base.heroine.marriage.desire = 100;
    liar.mods.base.heroine.body.vagina = { stretch: 90, peak: 90 };
    liar.mods.base.heroine.arousal = 95;
    liar.mods.base.heroine.energy = 80;
    const after = playOut(engine.dispatch(liar, { type: NIGHT_ACT, payload: { act: "sex" } }));
    expect(bs(after).night!.scene).toBe("faking_it");
    const tail = after.log.slice(-2);
    expect(tail[0]!.key).toBe("log.husband.sex.came");
    expect(tail[1]!.tags).toContain("unseen");
  });
});

describe("the bedroom scene", () => {
  const start = (tune: (b: ReturnType<typeof bs>) => void) => {
    const s = structuredClone(toNight(engine.init(4)));
    s.mods.base.heroine.marriage.desire = 100;
    s.mods.base.heroine.arousal = 70;
    s.mods.base.heroine.energy = 80;
    tune(bs(s));
    return engine.dispatch(s, { type: NIGHT_ACT, payload: { act: "sex" } });
  };
  it("going slower gives her more time than going faster", () => {
    const fast = playOut(start(() => {}), "faster");
    const slow = playOut(start(() => {}), "slower");
    expect(bs(slow).heroine.orgasms).toBeGreaterThanOrEqual(bs(fast).heroine.orgasms);
    expect(slow.time.minute).toBeGreaterThan(fast.time.minute);
  });
  it("a wife stretched far past his size gives him less to feel", () => {
    const tight = engine.dispatch(start(() => {}), { type: BED, payload: { do: "keep" } });
    const loose = engine.dispatch(start((b) => (b.heroine.body.vagina = { stretch: 90, peak: 90 })), { type: BED, payload: { do: "keep" } });
    expect(bs(loose).night!.sex!.his).toBeLessThan(bs(tight).night!.sex!.his);
  });
  it("changing what they do goes through the same formula", () => {
    let s = start(() => {});
    const before = bs(s).proposals.length;
    s = engine.dispatch(s, { type: BED, payload: { do: "switch", to: "anal" } });
    const record = bs(s).proposals.at(-1)!;
    expect(bs(s).proposals.length).toBeGreaterThanOrEqual(Math.min(12, before + 1));
    expect(record.act).toBe("anal");
    expect(bs(s).night!.sex?.act ?? "sex").toBe(record.verdict === "refuse" ? "sex" : "anal");
  });
  it("with a toy in the house she can take him, and his body learns", () => {
    let s = start((b) => {
      b.toys = ["toy_big"];
      b.heroine.traits.openness = 95;
    });
    expect(engine.listActions(s).some((a) => a.type === BED && a.payload?.to === "pegging")).toBe(true);
    const power = bs(s).power;
    s = engine.dispatch(s, { type: BED, payload: { do: "switch", to: "pegging" } });
    if (bs(s).night!.sex?.act === "pegging") {
      expect(bs(s).husband.stretch).toBeGreaterThan(0);
      expect(bs(s).power).toBeGreaterThan(power);
    }
    s = playOut(s);
    expect(engine.checkInvariants(s)).toEqual([]);
  });
  it("stopping leaves nobody finished", () => {
    let s = start(() => {});
    s = engine.dispatch(s, { type: BED, payload: { do: "stop" } });
    expect(bs(s).night!.sex).toBeNull();
    expect(engine.checkInvariants(s)).toEqual([]);
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
  it("in the hall he can take a table himself, even when she cannot", () => {
    const evening = (room: string) => {
      let s = engine.init(9);
      s = engine.dispatch(s, { type: CORE_ADVANCE });
      const moved = structuredClone(s);
      moved.where.husband = room;
      moved.mods.base.heroine.energy = 0; // she is out of it tonight
      s = moved;
      while (engine.listActions(s).some((a) => a.type === WAIT)) {
        const serve = engine.listActions(s).find((a) => a.type === "base/serve");
        s = engine.dispatch(s, serve ?? { type: WAIT, payload: { minutes: 15 } });
      }
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
      s = engine.dispatch(s, actions.find((a) => a.type === CORE_ADVANCE) ?? (actions.some((a) => a.type === WAIT) ? { type: WAIT, payload: { minutes: 10 } } : undefined) ?? actions.find((a) => a.type !== CORE_MOVE)!);
    }
    throw new Error("nothing ever happened in front of him");
  };
  it("silence teaches her that he does not mind, a little at a time", () => {
    let s = untilReaction(3);
    const act = bs(s).reaction!.act;
    const before = expectOf(s, act);
    while (bs(s).reaction) s = engine.dispatch(s, (engine.listActions(s).some((a) => a.type === WAIT) ? { type: WAIT, payload: { minutes: 10 } } : undefined) ?? { type: CORE_ADVANCE });
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

describe("the two of them", () => {
  it("each small thing works once a day", () => {
    let s = engine.init(5);
    const before = bs(s).heroine.mood;
    expect(engine.listActions(s).some((a) => a.type === TALK && a.payload?.do === "compliment")).toBe(true);
    s = engine.dispatch(s, { type: TALK, payload: { do: "compliment", group: "chat" } });
    expect(bs(s).heroine.mood).toBeGreaterThan(before);
    expect(engine.listActions(s).some((a) => a.type === TALK && a.payload?.do === "compliment")).toBe(false);
    expect(engine.checkInvariants(s)).toEqual([]);
  });
  it("saying it in words sets what she thinks he allows, for the whole kind of thing", () => {
    let s = engine.init(5);
    s = engine.dispatch(s, { type: TELL, payload: { group: "touching", say: "allow" } });
    expect(expectOf(s, "kiss")).toBeGreaterThanOrEqual(70);
    expect(expectOf(s, "sex")).toBeLessThan(70); // a yes to kisses is not a yes to everything
    s = engine.dispatch(s, { type: TELL, payload: { group: "touching", say: "forbid" } });
    expect(expectOf(s, "kiss")).toBeLessThan(-70);
    expect(bs(s).told.at(-1)!.key).toBe("told.say.forbid");
  });
  it("a guest in view can be thrown out, and he is gone", () => {
    let s = engine.init(3, { base: { preset: "hungry" } });
    for (let i = 0; i < 20000 && !engine.listActions(s).some((a) => a.type === GUEST); i++) {
      const actions = engine.listActions(s);
      s = engine.dispatch(s, actions.find((a) => a.type === CORE_ADVANCE) ?? (actions.some((a) => a.type === WAIT) ? { type: WAIT, payload: { minutes: 10 } } : undefined) ?? actions.find((a) => a.type !== CORE_MOVE)!);
    }
    const out = engine.listActions(s).find((a) => a.type === GUEST && a.payload?.do === "throw_out")!;
    const rep = bs(s).reputation;
    s = engine.dispatch(s, out);
    expect(bs(s).encounter).toBeNull();
    expect(bs(s).reputation).toBeLessThan(rep);
    expect(bs(s).shift!.visits.find((v) => v.patron === out.payload!.patron)?.stay ?? 0).toBe(0);
    expect(engine.checkInvariants(s)).toEqual([]);
  });
});

describe("her own initiative", () => {
  const wanting = () => {
    const s = structuredClone(toNight(engine.init(4)));
    // set up the evening so that she comes to bed wanting him
    s.mods.base.night.wants = true;
    s.mods.base.heroine.marriage.desire = 80;
    return s;
  };
  it("turning her down costs more than just falling asleep, and both cost something", () => {
    const base = wanting();
    const resent = base.mods.base.heroine.marriage.resent;
    const declined = engine.dispatch(base, { type: "base/night-decline" });
    const ignored = engine.dispatch(wanting(), { type: CORE_ADVANCE });
    expect(bs(declined).heroine.marriage.resent).toBeGreaterThan(resent);
    expect(has(declined, NIGHT_ACT)).toBe(false);
    expect(ignored.log.some((e) => e.key === "log.night.ignored_her")).toBe(true);
  });
  it("saying yes to her starts the scene", () => {
    const s = engine.dispatch(wanting(), { type: NIGHT_ACT, payload: { act: "sex" } });
    expect(bs(s).night!.sex).not.toBeNull();
    expect(bs(s).proposals.at(-1)!.rows.some((r) => r.id === "consent.wants")).toBe(true);
  });
});

describe("in the middle of the evening", () => {
  it("he can take her upstairs: the scene runs, the floor waits, the shift goes on", () => {
    let s = engine.dispatch(engine.init(8), { type: CORE_ADVANCE });
    for (let i = 0; i < 9; i++) s = engine.dispatch(s, wait10);
    const eager = structuredClone(s);
    eager.where.wife = eager.where.husband!;
    eager.mods.base.encounter = null;
    eager.mods.base.reaction = null;
    eager.mods.base.heroine.marriage.desire = 100;
    eager.mods.base.heroine.arousal = 80;
    const up = engine.listActions(eager).find((a) => a.type === "base/upstairs" && a.payload?.act === "sex")!;
    expect(up).toBeDefined();
    s = engine.dispatch(eager, up);
    expect(bs(s).night?.sex).toBeTruthy();
    expect(has(s, WAIT)).toBe(false);
    const tick = bs(s).shift!.tick;
    s = playOut(s);
    expect(bs(s).night).toBeNull();
    expect(bs(s).shift!.tick).toBeGreaterThan(tick);
    expect(has(s, WAIT) || has(s, CORE_ADVANCE)).toBe(true);
    expect(engine.listActions(s).some((a) => a.type === "base/upstairs")).toBe(false); // once an evening
    expect(engine.checkInvariants(s)).toEqual([]);
  });
});

describe("when enough has piled up", () => {
  const bitter = () => {
    let s = engine.init(4);
    while (s.time.phase !== "shift") s = engine.dispatch(s, { type: CORE_ADVANCE });
    const x = structuredClone(s);
    x.mods.base.heroine.marriage.resent = 60;
    x.mods.base.purseShare = 0;
    x.mods.base.purse = 0;
    return toNight(x);
  };
  it("she brings it up at night and the night waits for his answer", () => {
    const s = bitter();
    expect(bs(s).complaint).toBe("money");
    expect(has(s, CORE_ADVANCE)).toBe(false);
    expect(has(s, NIGHT_ACT)).toBe(false);
    expect(engine.currentScene(s)!.type).toBe("talk");
  });
  it("hearing her out costs him something and takes the edge off; pushing back makes it worse", () => {
    const s = bitter();
    const heard = engine.dispatch(s, { type: "base/hear-her", payload: { how: "hear" } });
    const pushed = engine.dispatch(s, { type: "base/hear-her", payload: { how: "push_back" } });
    expect(bs(heard).heroine.marriage.resent).toBeLessThan(bs(s).heroine.marriage.resent);
    expect(bs(heard).purseShare).toBe(0.5);
    expect(bs(pushed).heroine.marriage.resent).toBeGreaterThanOrEqual(bs(heard).heroine.marriage.resent);
    expect(has(heard, CORE_ADVANCE)).toBe(true);
    expect(engine.checkInvariants(heard)).toEqual([]);
  });
});

describe("a thing with a guest runs by the minute", () => {
  /** Plays with the husband in the kitchen, a minute at a time once something starts. */
  const untilEncounter = (seed: number, want: (st: GameState) => boolean): GameState => {
    let s = engine.init(seed, { base: { preset: "hungry" } });
    for (let i = 0; i < 60000; i++) {
      if (bs(s).encounter && want(s)) return s;
      const actions = engine.listActions(s);
      const step = s.time.phase === "shift" && s.where.husband === "cafe.kitchen" && actions.some((a) => a.type === WAIT) ? { type: WAIT, payload: { minutes: bs(s).encounter ? 1 : 5 } } : undefined;
      s = engine.dispatch(s, step ?? awayStrategy(actions, s, () => 0));
    }
    throw new Error("nothing started");
  };
  it("it lasts, he tries to move it on, and it can change without ending", () => {
    let s = untilEncounter(3, () => true);
    const first = bs(s).encounter!;
    const acts = new Set([first.act]);
    let minutes = 0;
    for (; bs(s).encounter?.patron === first.patron && minutes < 200; minutes++) {
      s = engine.dispatch(s, { type: WAIT, payload: { minutes: 1 } });
      if (bs(s).encounter) acts.add(bs(s).encounter!.act);
    }
    expect(minutes).toBeGreaterThan(3);
    expect(bs(s).shift ? bs(s).shift!.restUntil : 1).toBeGreaterThan(0);
    expect(engine.checkInvariants(s)).toEqual([]);
    // somewhere in a hungry wife's evenings a scene changes in place
    let changed = acts.size > 1;
    for (let seed = 4; seed < 9 && !changed; seed++) {
      let t = untilEncounter(seed, () => true);
      const who = bs(t).encounter!.patron;
      const seen = new Set([bs(t).encounter!.act]);
      for (let m = 0; bs(t).encounter?.patron === who && m < 200; m++) {
        t = engine.dispatch(t, { type: WAIT, payload: { minutes: 1 } });
        if (bs(t).encounter) seen.add(bs(t).encounter!.act);
      }
      changed = seen.size > 1;
    }
    expect(changed).toBe(true);
  });
  it("while he watches, the waits are 1 / 5 / 15", () => {
    const s = untilEncounter(3, () => true);
    const watching = structuredClone(s);
    watching.where.husband = bs(s).encounter!.loc;
    watching.mods.base.mode = "open";
    const minutes = engine.listActions(watching).filter((a) => a.type === WAIT && a.payload?.minutes).map((a) => a.payload!.minutes);
    expect(minutes).toEqual([1, 5, 15]);
  });
});
