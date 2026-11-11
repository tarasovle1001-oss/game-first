import { describe, expect, it } from "vitest";
import { baseMod, bs, content, CROWD, crowdOf, describeScene, menOf } from "@tc/base";
import { CORE_ADVANCE, createEngine, sceneKey } from "@tc/core";
import type { GameState } from "@tc/core";

const engine = createEngine([baseMod]);
const C = content.floor.crowd;
const wait = (s: GameState, minutes: number) => engine.dispatch(s, { type: "base/wait", payload: { minutes } });
const has = (s: GameState, type: string, where?: (p: Record<string, unknown>) => boolean) => engine.listActions(s).some((a) => a.type === type && (!where || where(a.payload ?? {})));
/** An open marriage, a very willing wife, a full room, and something already going on in the middle of it. */
const scene = (seed: number, act: string, loc = "cafe.hall"): GameState => {
  let s = engine.dispatch(engine.init(seed, { base: { preset: "hungry", mode: "open", traits: { openness: 95, fidelity: 5, confidence: 60 } } }), { type: CORE_ADVANCE });
  let guard = 0;
  while (bs(s).shift!.visits.filter((v) => v.stay > 0).length < 3 && guard++ < 60) {
    if (bs(s).caught) s = structuredClone(s), (bs(s).caught = null);
    s = wait(s, 5);
  }
  const c = structuredClone(s);
  const b = bs(c);
  const v = b.shift!.visits[0]!;
  for (const x of b.shift!.visits) {
    x.stay = 400;
    x.heat = 80;
    b.patrons[x.patron]!.memory.interest = 80;
    b.patrons[x.patron]!.memory.affinity = 50;
  }
  b.reaction = null;
  b.caught = null;
  b.heroine.arousal = 80;
  b.heroine.energy = 100;
  b.encounter = { patron: v.patron, act, loc, verdict: "eager", startTick: b.shift!.tick, actTick: b.shift!.tick, nextTry: 9999, his: 0, hers: 10, hisRate: 0.5, pleasure: 50, came: 0, refusals: 0, paid: false };
  c.where.wife = loc;
  c.where[v.patron] = loc;
  c.where.husband = loc;
  return c;
};

describe("it does not stay between two people", () => {
  it("in the open hall men come over to watch, and watching works them up", () => {
    let s = scene(6, "blowjob");
    for (let i = 0; i < 20 && crowdOf(s).length === 0 && bs(s).encounter; i++) s = wait(s, 1);
    expect(crowdOf(s).length).toBeGreaterThan(0);
    expect(s.log.some((e) => e.key.startsWith("log.crowd.gathers."))).toBe(true);
    expect(sceneKey(engine.currentScene(s)!)).toContain("crowd");
  });
  it("a man who has watched long enough asks for a part of her that is free; with two on her the picture says so", () => {
    let s = scene(6, "blowjob");
    for (let i = 0; i < 40 && menOf(s).length === 0 && bs(s).encounter; i++) s = wait(s, 1);
    if (!bs(s).encounter) return;
    expect(menOf(s).length).toBeGreaterThan(0);
    expect(menOf(s)[0]!.slot).not.toBe("mouth");
    expect(describeScene(s, true).prompt).toMatch(/threesome|gangbang/);
    expect(sceneKey(engine.currentScene(s)!)).toContain("men");
  });
  it("her husband can send the watchers away, or wave one of them over", () => {
    const s = scene(6, "sex", "cafe.hall");
    const first = bs(s).shift!.visits[1]!.patron;
    bs(s).encounter!.crowd = [first];
    bs(s).encounter!.crowdSince = { [first]: bs(s).shift!.tick - 10 };
    expect(has(s, CROWD, (p) => p.do === "disperse")).toBe(true);
    expect(has(s, CROWD, (p) => p.do === "invite")).toBe(true);
    const gone = engine.dispatch(s, { type: CROWD, payload: { do: "disperse" } });
    expect(crowdOf(gone)).toEqual([]);
    const invited = engine.dispatch(s, engine.listActions(s).find((a) => a.type === CROWD && a.payload?.do === "invite")!);
    expect(menOf(invited).length + (invited.log.at(-1)!.key === "log.crowd.join.no" ? 1 : 0)).toBe(1);
    expect(has(invited, CROWD, (p) => p.do === "invite" && p.patron === first)).toBe(false);
  });
  it("each watcher counts in what she answers: against it for a shy wife, for it for a bold one", () => {
    const s = scene(6, "kiss");
    const partner = bs(s).encounter!.patron;
    const row = (st: GameState) => engine.evaluate("base/consent", st, { act: "grope", partner, loc: "cafe.hall", offer: 0, pressure: 0 }).rows.find((r) => r.id === "consent.crowd")?.value ?? 0;
    expect(row(s)).toBe(0);
    bs(s).encounter!.crowd = [bs(s).shift!.visits[1]!.patron, "someone"];
    expect(row(s)).toBe(2 * C.perWatcher.bold!);
    bs(s).heroine.traits.openness = 20;
    delete bs(s).heroine.latents.exhibitionist;
    expect(row(s)).toBe(2 * C.perWatcher.shy!);
  });
});

describe("how it ends with a guest", () => {
  const ending = (act: string, tweak: (b: ReturnType<typeof bs>) => void): GameState => {
    const s = scene(6, act, "cafe.staff");
    const b = bs(s);
    b.encounter!.his = 99.9;
    b.encounter!.hisRate = 5;
    s.where.husband = "cafe.kitchen";
    tweak(b);
    return wait(s, 1);
  };
  it("where he comes is said, leaves its mark, and stays as the picture for a few minutes", () => {
    const s = ending("sex", () => {});
    expect(s.log.some((e) => /^log\.fin\.(inside|body)$/.test(e.key))).toBe(true);
    const fin = bs(s).shift!.fin!;
    expect(["inside", "body"]).toContain(fin.place);
    expect(Object.keys(bs(s).heroine.cum ?? {})).toContain(fin.place);
    expect(bs(s).heroine.cumHis?.[fin.place]).toBe(false);
  });
  it("a face she does not want from a man she does not like: a sure woman pulls clear, or throws him out", () => {
    const s = ending("blowjob", (b) => {
      b.heroine.traits.openness = 20;
      b.heroine.traits.confidence = 90;
      b.heroine.drunk = 0;
      delete b.heroine.latents.oral_fixation;
      const p = b.patrons[b.encounter!.patron]!;
      p.memory.affinity = -20;
      p.approach = "push";
    });
    expect(s.log.some((e) => e.key.startsWith("log.fin.offended.") || e.key.startsWith("log.fin.held."))).toBe(true);
    expect(bs(s).heroine.cum?.face).toBeUndefined();
  });
  it("the same from a timid one: it lands, and she is ashamed", () => {
    const s = ending("blowjob", (b) => {
      b.heroine.traits.openness = 20;
      b.heroine.traits.confidence = 20;
      b.heroine.drunk = 0;
      delete b.heroine.latents.oral_fixation;
      const p = b.patrons[b.encounter!.patron]!;
      p.memory.affinity = 0;
      p.approach = "push";
    });
    expect(s.log.some((e) => e.key === "log.fin.face.unwilling")).toBe(true);
    expect(bs(s).heroine.cum?.face).toBeGreaterThan(0);
    expect((bs(s).heroine.feel?.shame ?? 0)).toBeGreaterThan(0);
  });
});
