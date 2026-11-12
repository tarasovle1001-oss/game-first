import { describe, expect, it } from "vitest";
import { baseMod, bs, charmOf, content, SOFT_ACTS, TALK } from "@tc/base";
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

describe("run dry", () => {
  it("in the middle of the evening she goes up for an hour and the floor is his; she comes back with something in her", () => {
    let s = engine.dispatch(engine.init(9), { type: "core/advance" });
    s = structuredClone(s);
    bs(s).heroine.energy = 0;
    s = engine.dispatch(s, { type: "base/wait", payload: { minutes: 5 } });
    expect(s.where.wife).toBe("home.bedroom");
    expect(bs(s).shift!.quietUntil).toBeDefined();
    for (let i = 0; i < 5; i++) s = engine.dispatch(s, engine.listActions(s).find((a) => a.type === "base/wait" && a.payload?.minutes === 15) ?? engine.listActions(s)[0]!);
    expect(bs(s).shift!.quietUntil).toBeUndefined();
    expect(bs(s).heroine.energy).toBeGreaterThan(0);
    expect(engine.checkInvariants(s)).toEqual([]);
  });
  it("what she wears and what the evening left on her is one number, and the room pays for it", () => {
    const plain = structuredClone(engine.init(4));
    const bold = structuredClone(plain);
    bs(bold).heroine.outfit = content.outfits[content.outfits.length - 1]!.id;
    bs(bold).heroine.arousal = 80;
    expect(charmOf(bold)).toBeGreaterThan(charmOf(plain));
    expect(charmOf(plain)).toBeGreaterThanOrEqual(0);
    expect(charmOf(bold)).toBeLessThanOrEqual(100);
  });
});

describe("in front of him", () => {
  it("he has more than a nod and a no: every answer is on offer, does something, and breaks nothing", () => {
    // play evenings until something starts under his eyes
    let found: GameState | null = null;
    for (let seed = 1; seed <= 10 && !found; seed++) {
      let s = engine.init(seed);
      let r = seed * 7919;
      const rnd = () => (r = (r * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
      for (let i = 0; i < 2500 && s.time.day <= 9 && !found; i++) {
        const acts = engine.listActions(s);
        if (acts.some((a) => a.type === "base/react")) found = s;
        else {
          const wait = acts.filter((a) => /wait|advance/.test(a.type));
          const other = acts.filter((a) => !/wait|advance|move/.test(a.type));
          s = engine.dispatch(s, other.length && rnd() < 0.45 ? other[Math.floor(rnd() * other.length)]! : wait.length ? wait[Math.floor(rnd() * wait.length)]! : acts[Math.floor(rnd() * acts.length)]!);
        }
      }
    }
    expect(found).not.toBeNull();
    const hows = engine.listActions(found!).filter((a) => a.type === "base/react");
    expect(hows.map((a) => a.payload!.how)).toEqual(expect.arrayContaining(["cheer", "limit", "lead_away", "leave"]));
    for (const a of hows) {
      const next = engine.dispatch(found!, a);
      expect(next.turn).toBeGreaterThan(found!.turn);
      expect(engine.checkInvariants(next)).toEqual([]);
      expect(engine.listActions(next).length).toBeGreaterThan(0);
    }
    // joining, when she lets him, is a scene of three that plays out turn by turn and ends cleanly
    const keen = structuredClone(found!);
    bs(keen).heroine.traits.openness = 100;
    bs(keen).heroine.arousal = 100;
    bs(keen).heroine.marriage.desire = 100;
    bs(keen).husband.spentDay = undefined;
    bs(keen).reaction!.act = "grope";
    if (!bs(keen).encounter) bs(keen).encounter = { patron: bs(keen).reaction!.patron, act: "grope", loc: keen.where.wife!, verdict: "eager", startTick: bs(keen).shift!.tick, actTick: bs(keen).shift!.tick, nextTry: bs(keen).shift!.tick + 5, his: 0, hers: 0, hisRate: 5, pleasure: 30, came: 0 } as never;
    else bs(keen).encounter!.act = "grope";
    const join = engine.listActions(keen).find((a) => a.type === "base/react" && a.payload!.how === "join" && a.payload!.act === "sex");
    expect(join).toBeDefined();
    let j = engine.dispatch(keen, join!);
    expect(bs(j).night?.sex).toBeTruthy();
    if (bs(j).night?.sex) {
      expect(bs(j).night!.third).toBeDefined();
      expect(bs(j).night!.scene).toBe("join_husband");
      expect(bs(j).encounter).toBeNull();
      for (let i = 0; i < 200 && bs(j).night?.sex; i++) j = engine.dispatch(j, { type: "base/bed", payload: { do: "keep" } });
      expect(bs(j).night).toBeNull();
    }
    expect(engine.checkInvariants(j), JSON.stringify(engine.checkInvariants(j))).toEqual([]);
  });
});

describe("a lodger upstairs at night", () => {
  const ROOM = content.rooms.find((r) => r.zone === "hotel" && r.tags.includes("guest"))!.id;
  const night = (edit: (s: GameState) => void) => {
    let s = engine.init(6);
    while (s.time.phase !== "night") s = engine.dispatch(s, engine.listActions(s).find((a) => a.type === "core/advance") ?? engine.listActions(s).find((a) => a.type === "base/wait" && a.payload?.minutes === 60) ?? engine.listActions(s)[0]!);
    s = structuredClone(s);
    const b = bs(s);
    const p = Object.values(b.patrons)[0]!;
    b.lodgers = { [ROOM]: { patron: p.id, nights: 2 } };
    s.where.wife = s.where.husband!;
    if (b.night) b.night.herAsleep = undefined;
    b.complaint = null as never;
    edit(s);
    return s;
  };
  it("he can send her up with a word about how far; how far it goes is hers, and so is what she tells", () => {
    const shy = night((s) => void ((bs(s).heroine.traits.openness = 15), (bs(s).heroine.traits.fidelity = 95)));
    const sends = engine.listActions(shy).filter((a) => a.type === "base/send-up");
    expect(sends.map((a) => a.payload!.brief)).toEqual(["all", "limit", "company", "her_call"]);
    const bold = night((s) => void ((bs(s).heroine.traits.openness = 95), (bs(s).heroine.traits.fidelity = 10), (bs(s).heroine.arousal = 80)));
    const all = (s: GameState) => engine.dispatch(s, engine.listActions(s).find((a) => a.type === "base/send-up" && a.payload!.brief === "all")!);
    const a = all(shy);
    const z = all(bold);
    const tier = (s: GameState) => content.acts.find((x) => x.id === bs(s).proposals.filter((r) => r.loc === ROOM).at(-1)?.act)?.tier ?? -1;
    expect(tier(z)).toBeGreaterThan(tier(a));
    expect(engine.listActions(z).some((x) => x.type === "base/send-up")).toBe(false); // once a night
    const company = engine.dispatch(bold, engine.listActions(bold).find((x) => x.type === "base/send-up" && x.payload!.brief === "company")!);
    expect(tier(company)).toBeLessThanOrEqual(1);
    for (const s of [a, z, company]) expect(engine.checkInvariants(s), JSON.stringify(engine.checkInvariants(s))).toEqual([]);
  });
});

describe("a closed door", () => {
  it("with her behind it he can listen, knock or walk in, and each leaves the game sound", () => {
    let found: GameState | null = null;
    for (let seed = 1; seed <= 12 && !found; seed++) {
      let s = engine.init(seed);
      let r = seed * 104729;
      const rnd = () => (r = (r * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
      for (let i = 0; i < 3000 && s.time.day <= 12 && !found; i++) {
        const acts = engine.listActions(s);
        const enc = bs(s).encounter;
        if (enc && s.time.phase === "shift" && enc.loc !== "cafe.hall" && !bs(s).caught && !bs(s).reaction) {
          for (const room of content.rooms) {
            const t = structuredClone(s);
            t.where.husband = room.id;
            if (engine.listActions(t).some((a) => a.type === "base/door")) found = t;
          }
        }
        if (found) break;
        const wait = acts.filter((a) => /wait|advance/.test(a.type));
        const other = acts.filter((a) => !/wait|advance|move/.test(a.type));
        s = engine.dispatch(s, other.length && rnd() < 0.4 ? other[Math.floor(rnd() * other.length)]! : wait.length ? wait[Math.floor(rnd() * wait.length)]! : acts[Math.floor(rnd() * acts.length)]!);
      }
    }
    expect(found).not.toBeNull();
    const doors = engine.listActions(found!).filter((a) => a.type === "base/door");
    expect(doors.map((a) => a.payload!.how)).toEqual(["listen", "knock", "barge"]);
    for (const a of doors) {
      const next = engine.dispatch(found!, a);
      expect(engine.checkInvariants(next), JSON.stringify(engine.checkInvariants(next))).toEqual([]);
      expect(engine.listActions(next).length).toBeGreaterThan(0);
    }
    const heard = engine.dispatch(found!, doors[0]!);
    expect(engine.listActions(heard).some((a) => a.type === "base/door" && a.payload!.how === "listen")).toBe(false);
  }, 120000);
});

describe("he is done and she is not", () => {
  it("sometimes she keeps him at it with what needs nothing of him, and only that is on offer", () => {
    let seen = 0;
    for (let seed = 1; seed <= 30 && seen === 0; seed++) {
      let s = engine.init(seed);
      while (s.time.phase !== "night") s = engine.dispatch(s, engine.listActions(s).find((a) => a.type === "core/advance") ?? engine.listActions(s).find((a) => a.type === "base/wait" && a.payload?.minutes === 60) ?? engine.listActions(s)[0]!);
      s = structuredClone(s);
      const b = bs(s);
      const h = b.heroine;
      h.marriage.desire = 95;
      h.marriage.resent = 0;
      h.arousal = 70;
      h.mood = 90;
      b.husband.minutes = 3; // he will be done long before she is
      b.approach = null;
      s.where.wife = s.where.husband!;
      const ask = engine.listActions(s).find((a) => a.type === "base/night-act" && a.payload?.act === "sex");
      if (!ask) continue;
      s = engine.dispatch(s, ask);
      for (let i = 0; i < 60 && bs(s).night?.sex && !bs(s).night!.sex!.soft; i++) s = engine.dispatch(s, { type: "base/bed", payload: { do: "keep" } });
      if (!bs(s).night?.sex?.soft) continue;
      seen++;
      expect(SOFT_ACTS).toContain(bs(s).night!.sex!.act);
      const switches = engine.listActions(s).filter((a) => a.type === "base/bed" && typeof a.payload?.act === "string");
      for (const a of switches) expect(SOFT_ACTS).toContain(a.payload!.act);
      for (let i = 0; i < 40 && bs(s).night?.sex; i++) s = engine.dispatch(s, { type: "base/bed", payload: { do: "keep" } });
      expect(bs(s).night?.sex ?? null).toBeNull();
      expect(engine.checkInvariants(s), JSON.stringify(engine.checkInvariants(s))).toEqual([]);
    }
    expect(seen).toBeGreaterThan(0);
  });
});

describe("the acts written from the questionnaires", () => {
  it("can be asked for at night, play with their own lines and end in their own picture", () => {
    const acts = ["ignore_handjob", "facesitting", "edging", "cleanup", "chastity", "toy_on_her", "masturbate_show", "footjob", "spank_him", "tease_denial", "thigh_ride"];
    let played = 0;
    for (const act of acts) {
      let s = engine.init(11);
      while (s.time.phase !== "night") s = engine.dispatch(s, engine.listActions(s).find((a) => a.type === "core/advance") ?? engine.listActions(s).find((a) => a.type === "base/wait" && a.payload?.minutes === 60) ?? engine.listActions(s)[0]!);
      s = structuredClone(s);
      const b = bs(s);
      Object.assign(b.heroine.traits, { openness: 100, confidence: 80 });
      b.heroine.marriage.desire = 100;
      b.heroine.marriage.resent = 0;
      b.heroine.arousal = 90;
      b.heroine.mood = 90;
      b.power = 80;
      b.approach = null;
      s.where.wife = s.where.husband!;
      const ask = engine.listActions(s).find((a) => a.type === "base/night-act" && a.payload?.act === act);
      expect(ask, act).toBeDefined();
      s = engine.dispatch(s, ask!);
      if (!bs(s).night?.sex) continue; // she may still say no
      played++;
      expect(s.log.some((e) => e.key === `log.act.${act}.start`)).toBe(true);
      for (let i = 0; i < 120 && bs(s).night?.sex; i++) s = engine.dispatch(s, { type: "base/bed", payload: { do: "keep" } });
      expect(bs(s).night?.sex ?? null).toBeNull();
      expect(engine.checkInvariants(s), JSON.stringify(engine.checkInvariants(s))).toEqual([]);
    }
    expect(played).toBeGreaterThan(5);
  });
});

describe("her own drawer", () => {
  it("left wanting, she buys a toy out of her own tips, uses it before opening, and her body changes without another man", () => {
    let s = structuredClone(engine.init(21));
    const start = bs(s).heroine.body.vagina.stretch;
    const spent = () => 600 - bs(s).purse;
    bs(s).purse = 600;
    for (let i = 0; i < 4000 && s.time.day <= 6; i++) {
      s = structuredClone(s);
      bs(s).heroine.frustration = Math.max(bs(s).heroine.frustration, 70); // nothing at home gives her what she needs
      if (bs(s).purse > 600) bs(s).purse = 600; // tips aside: only what she spends counts here
      const acts = engine.listActions(s);
      s = engine.dispatch(s, acts.find((a) => a.type === "core/advance") ?? acts.find((a) => a.type === "base/sleep") ?? acts.find((a) => a.type === "base/wait" && a.payload?.minutes === 60) ?? acts.find((a) => /wait/.test(a.type)) ?? acts[0]!);
    }
    const b = bs(s);
    expect((b.herToys ?? []).length).toBeGreaterThan(0);
    expect(spent()).toBeGreaterThan(0);
    expect(b.soloDay).toBeDefined();
    expect(b.heroine.body.vagina.stretch).toBeGreaterThan(start);
    expect(b.proposals.some((p) => p.patron !== "husband" && ["sex", "anal"].includes(p.act) && p.verdict !== "refuse")).toBe(false);
    expect(engine.checkInvariants(s), JSON.stringify(engine.checkInvariants(s))).toEqual([]);
  });
});

describe("watching everything", () => {
  it("the picture follows her out of his sight only when the player asked to see it all", () => {
    let found = false;
    for (let seed = 1; seed <= 12 && !found; seed++) {
      let s = engine.init(seed);
      for (let i = 0; i < 1500 && !found; i++) {
        const acts = engine.listActions(s);
        if (!acts.length) break;
        s = engine.dispatch(s, acts[(i * 7 + seed) % acts.length]!);
        const all = { ...s, mods: { ...s.mods, base: { ...bs(s), viewAll: true } } } as GameState;
        const hidden = JSON.stringify(engine.currentScene(s) ?? null);
        const shown = JSON.stringify(engine.currentScene(all) ?? null);
        if (hidden !== shown) {
          expect(shown).not.toBe("null");
          found = true;
        }
      }
    }
    expect(found).toBe(true);
  });
});
