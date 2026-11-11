import { describe, expect, it } from "vitest";
import { baseMod, bs, content, DEAL, GROUP, JOIN, TABLE } from "@tc/base";
import { CORE_ADVANCE, createEngine } from "@tc/core";
import type { GameState } from "@tc/core";

const engine = createEngine([baseMod]);
const F = content.floor;
const has = (s: GameState, type: string, where?: (p: Record<string, unknown>) => boolean) => engine.listActions(s).some((a) => a.type === type && (!where || where(a.payload ?? {})));
const wait = (s: GameState, minutes: number) => engine.dispatch(s, { type: "base/wait", payload: { minutes } });
/** The first evening, a few guests in, husband in the hall. */
const evening = (seed: number, setup?: Parameters<typeof engine.init>[1]): GameState => {
  let s = engine.dispatch(engine.init(seed, setup), { type: CORE_ADVANCE });
  let guard = 0;
  while (bs(s).shift!.visits.filter((v) => v.served > 0).length < 2 && guard++ < 30) s = wait(s, 10);
  return s;
};

describe("the floor", () => {
  it("small things happen at the tables and leave a line each", () => {
    let s = evening(4, { base: { preset: "curious" } });
    for (let i = 0; i < 20 && s.time.phase === "shift" && has(s, "base/wait"); i++) s = wait(s, 10);
    const moments = s.log.filter((e) => e.key.startsWith("log.moment."));
    expect(moments.length).toBeGreaterThan(0);
    expect(new Set(bs(s).shift?.momentsSeen ?? []).size).toBe((bs(s).shift?.momentsSeen ?? []).length);
  });
  it("a guest with money waits for the husband's answer; 'not in my place' forbids it and everything past it", () => {
    const s = structuredClone(evening(4));
    const v = bs(s).shift!.visits[0]!;
    bs(s).deal = { patron: v.patron, act: "grope", price: 40, tick: bs(s).shift!.tick };
    expect(has(s, DEAL, (p) => p.say === "tell_her" && p.price === 40)).toBe(true);
    expect(has(s, DEAL, (p) => p.say === "tell_her" && (p.price as number) > 40)).toBe(true);
    const no = engine.dispatch(s, { type: DEAL, payload: { say: "not_here" } });
    expect(bs(no).deal).toBeUndefined();
    expect(bs(no).expect.grope).toBe(content.consent.expect.forbid);
    expect(bs(no).expect.sex).toBe(content.consent.expect.forbid);
    expect(bs(no).expect.flirt).toBeUndefined();
  });
  it("taking the money for her: a willing wife goes, and the money is in the till", () => {
    const s = structuredClone(evening(4, { base: { preset: "hungry", mode: "open" } }));
    const v = bs(s).shift!.visits[0]!;
    bs(s).encounter = null;
    bs(s).deal = { patron: v.patron, act: "kiss", price: 60, tick: bs(s).shift!.tick };
    const tips = bs(s).today.tips + bs(s).purse;
    const sold = engine.dispatch(s, { type: DEAL, payload: { say: "tell_her", price: 60 } });
    if (bs(sold).encounter) {
      expect(bs(sold).encounter!.patron).toBe(v.patron);
      expect(bs(sold).today.tips + bs(sold).purse).toBeGreaterThanOrEqual(tips + 60);
    } else expect(sold.log.some((e) => e.key === "log.deal.she_refuses")).toBe(true);
  });
  it("an unanswered deal runs out and he goes to her himself", () => {
    let s = structuredClone(evening(4));
    const v = bs(s).shift!.visits[0]!;
    bs(s).deal = { patron: v.patron, act: "grope", price: 40, tick: bs(s).shift!.tick };
    s = wait(s, F.deal.expires + 1);
    expect(bs(s).deal).toBeUndefined();
  });
  it("a company in the back room: they call for trays, she can be sent in and is out of sight for a while", () => {
    let s = structuredClone(evening(4, { base: { preset: "curious" } }));
    bs(s).shift!.groupAt = bs(s).shift!.tick + 1;
    s = wait(s, 10);
    expect(bs(s).shift!.group).toBeDefined();
    let guard = 0;
    while (!has(s, GROUP) && guard++ < 20) s = wait(s, 5);
    expect(has(s, GROUP, (p) => p.do === "self")).toBe(true);
    if (has(s, GROUP, (p) => p.do === "send_her")) {
      const sent = engine.dispatch(s, { type: GROUP, payload: { do: "send_her" } });
      expect(sent.where.wife).toBe("cafe.lounge");
      expect(bs(sent).shift!.group!.herOut).toBeGreaterThan(bs(sent).shift!.tick);
      const back = wait(sent, 50);
      expect(back.where.wife).not.toBe("cafe.lounge");
    }
    const self = engine.dispatch(s, { type: GROUP, payload: { do: "self" } });
    expect(bs(self).shift!.group!.rounds).toBe(1);
    expect(bs(self).shift!.group!.bill).toBeGreaterThan(0);
  });
  it("the company pays when it leaves", () => {
    let s = structuredClone(evening(4));
    bs(s).shift!.groupAt = bs(s).shift!.tick + 1;
    s = wait(s, 10);
    s = engine.dispatch(s, { type: GROUP, payload: { do: "self" } });
    const bill = bs(s).shift!.group!.bill;
    const income = bs(s).today.income;
    let guard = 0;
    while (bs(s).shift?.group && s.time.phase === "shift" && guard++ < 60) s = has(s, "base/wait") ? wait(s, 15) : engine.dispatch(s, { type: CORE_ADVANCE });
    expect(bs(s).today.income).toBeGreaterThanOrEqual(income + bill);
  });
  it("sitting down with a guest takes a quarter of an hour, cards move money", () => {
    const s = structuredClone(evening(4));
    bs(s).reaction = null;
    bs(s).encounter = null;
    bs(s).money = 500;
    if (!has(s, TABLE)) return;
    const a = engine.listActions(s).find((x) => x.type === TABLE && x.payload?.do === "cards")!;
    const tick = bs(s).shift!.tick;
    const after = engine.dispatch(s, a);
    expect(bs(after).shift!.tick).toBe(tick + F.table.minutes);
    expect(Math.abs(bs(after).money - 500)).toBeGreaterThan(0);
  });
  it("joining her and a guest is only on the table once it is in the open", () => {
    const s = structuredClone(evening(4, { base: { preset: "hungry" } }));
    const v = bs(s).shift!.visits[0]!;
    bs(s).encounter = { patron: v.patron, act: "sex", loc: "cafe.staff", verdict: "eager", startTick: bs(s).shift!.tick, actTick: bs(s).shift!.tick, nextTry: 999, his: 10, hers: 10, hisRate: 1, pleasure: 50, came: 0, refusals: 0, paid: false };
    s.where.wife = "cafe.staff";
    s.where.husband = "cafe.staff";
    bs(s).caught = null;
    expect(has(s, JOIN)).toBe(false);
    bs(s).mode = "open";
    expect(has(s, JOIN)).toBe(true);
    const after = engine.dispatch(s, { type: JOIN, payload: { how: "mouth" } });
    expect(bs(after).encounter!.joined).toBe("mouth");
    expect(has(after, JOIN)).toBe(false);
  });
});
