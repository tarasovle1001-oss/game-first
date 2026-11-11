import { describe, expect, it } from "vitest";
import { ANSWER, baseMod, bs } from "@tc/base";
import { CORE_ADVANCE, createEngine } from "@tc/core";
import type { GameState } from "@tc/core";

const engine = createEngine([baseMod]);
const toNight = (s: GameState, tune: (b: ReturnType<typeof bs>) => void): GameState => {
  let st = s;
  for (let i = 0; i < 400 && st.time.phase !== "shift"; i++) st = engine.dispatch(st, { type: CORE_ADVANCE });
  for (let i = 0; i < 400 && !engine.listActions(st).some((a) => a.type === CORE_ADVANCE); i++) st = engine.dispatch(st, engine.listActions(st).find((a) => a.type === "base/wait" && a.payload?.minutes === 60) ?? engine.listActions(st).find((a) => a.type === "base/wait")!);
  st = structuredClone(st);
  st.mods.base.approach = null;
  st.mods.base.approached = {};
  tune(bs(st));
  return engine.dispatch(st, { type: CORE_ADVANCE });
};
const answers = (s: GameState) => engine.listActions(s).filter((a) => a.type === ANSWER);

describe("she comes to him", () => {
  it("a guest who pushed her all evening: she asks her husband to do something, and each answer lands differently", () => {
    const s = toNight(engine.init(6), (b) => {
      b.pushedToday = { [Object.keys(b.patrons)[0]!]: 4 };
      b.heroine.marriage.resent = 0;
      b.heroine.latents = {};
      delete b.heroine.latents.likes_rough;
      b.heroine.traits.honesty = 80;
      b.remarked = ["stretch.20", "stretch.45", "stretch.70", "stretch.90"];
    });
    expect(s.time.phase).toBe("night");
    expect(bs(s).approach?.kind).toBe("harassed");
    expect(answers(s).map((a) => a.payload!.say)).toEqual(["protect", "endure", "ask"]);
    const protect = engine.dispatch(s, answers(s)[0]!);
    const endure = engine.dispatch(s, answers(s)[1]!);
    expect(bs(protect).heroine.marriage.desire).toBeGreaterThan(bs(s).heroine.marriage.desire);
    expect(bs(endure).heroine.marriage.resent).toBeGreaterThan(bs(s).heroine.marriage.resent);
    expect(bs(endure).expect.touch ?? 0).toBeGreaterThan(bs(s).expect.touch ?? 0);
    expect(bs(protect).approach).toBeNull();
    expect(answers(protect)).toEqual([]);
  });
  it("she says once what her body has become, aloud if she is honest and to herself if not", () => {
    const tune = (honesty: number) => (b: ReturnType<typeof bs>) => {
      b.heroine.body.vagina = { stretch: 50, peak: 50 };
      b.heroine.traits.honesty = honesty;
    };
    const honest = toNight(engine.init(6), tune(90));
    const closed = toNight(engine.init(6), tune(10));
    const line = (s: GameState) => s.log.find((e) => e.key.startsWith("log.her.stretch.45"))!;
    expect(line(honest).key).toBe("log.her.stretch.45");
    expect(line(closed).key).toBe("log.her.stretch.45.thought");
    expect(line(closed).tags).toContain("unseen");
    expect(bs(honest).remarked).toContain("stretch.45");
  });
  it("in the open she compares him with the guest she had; while it is a secret she only thinks it", () => {
    const tune = (mode: "open" | "hidden") => (b: ReturnType<typeof bs>) => {
      b.sizeToday = 24;
      b.mode = mode;
      b.heroine.traits.honesty = 90;
    };
    const open = toNight(engine.init(6), tune("open"));
    const hidden = toNight(engine.init(6), tune("hidden"));
    expect(open.log.some((e) => /^log\.her\.compare\.\d(\.cruel)?$/.test(e.key))).toBe(true);
    expect(hidden.log.some((e) => /^log\.her\.compare\.\d\.thought$/.test(e.key))).toBe(true);
  });
  it("an unanswered approach passes with the phase and leaves a mark", () => {
    const s = toNight(engine.init(6), (b) => {
      b.pushedToday = { [Object.keys(b.patrons)[0]!]: 4 };
      delete b.heroine.latents.likes_rough;
      b.heroine.traits.honesty = 80;
      b.remarked = ["stretch.20", "stretch.45", "stretch.70", "stretch.90"];
    });
    const resent = bs(s).heroine.marriage.resent;
    let next = s;
    for (let i = 0; i < 5 && next.time.phase === "night"; i++) next = engine.dispatch(next, { type: CORE_ADVANCE });
    expect(bs(next).approach).toBeNull();
    expect(bs(next).heroine.marriage.resent).toBeGreaterThan(resent);
  });
});
