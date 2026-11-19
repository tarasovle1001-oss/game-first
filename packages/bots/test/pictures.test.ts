import { describe, expect, it } from "vitest";
import { baseMod, bs, content, groupScene } from "@tc/base";
import { CORE_ADVANCE, createEngine } from "@tc/core";

const engine = createEngine([baseMod]);
const layouts = new Set(content.scenes.map((s) => s.id));

describe("pictures", () => {
  it("has a layout for every way a group can have her", () => {
    const slots = ["mouth", "hand", "pussy", "anus"];
    for (const act of content.acts.filter((a) => a.place === "private"))
      for (let mask = 1; mask < 16; mask++) {
        const type = groupScene(act.id, slots.filter((_, i) => mask & (1 << i)));
        if (type) expect(layouts.has(type), type).toBe(true);
      }
    expect(groupScene("sex", ["mouth"])).toBe("group_spitroast");
    expect(groupScene("sex", ["anus", "mouth"])).toBe("group_airtight");
    expect(groupScene("blowjob", ["hand"])).toBe("group_oral_hand");
    expect(groupScene("sex", [])).toBe(null);
  });
  it("has a layout for every ending, every join and every daytime task", () => {
    for (const places of Object.values(content.look.marks.byAct)) for (const p of places) expect(layouts.has(`patron_fin_${p}`), p).toBe(true);
    for (const id of ["patron_fin_held", "join_hand", "join_mouth", "join_take", "flash", "walk_naked", "deal", "table_sit", "bath_walkin", "bath_together", "lead_ruined", "lead_snowball", "lead_lick_clean"]) expect(layouts.has(id), id).toBe(true);
  });
  it("shows what she is busy with when he is in the room with her by day", () => {
    let s = engine.init(3, { base: { preset: "ordinary" } });
    const seen = new Set<string>();
    for (let i = 0; i < 60 && s.time.phase === "prep"; i++) {
      const her = s.where["wife"]!;
      const b = bs(s);
      if (b.day?.her?.task && s.where["husband"] !== her) {
        // walk towards her, a room at a time
        for (let hop = 0; hop < 6 && s.where["husband"] !== s.where["wife"]; hop++) {
          const moves = engine.listActions(s).filter((a) => a.type === "core/move");
          const go = moves.find((a) => a.payload?.to === her) ?? moves.find((a) => String(a.payload?.to).split(".")[0] === her.split(".")[0]) ?? moves[0];
          if (!go) break;
          s = engine.dispatch(s, go);
        }
      }
      const d = engine.currentScene(s);
      if (d) seen.add(d.type);
      s = engine.dispatch(s, { type: "base/prep-wait", payload: { minutes: 15 } });
    }
    void CORE_ADVANCE;
    expect([...seen].some((t) => t.startsWith("her_") || t.startsWith("bath_"))).toBe(true);
    for (const t of seen) expect(layouts.has(t), t).toBe(true);
  });
});

import { pictureFrames, resolveFrames } from "@tc/base";
import { sceneKeyFallbacks, sceneFileName } from "@tc/core";

describe("main picture and close-ups", () => {
  const pair = { type: "blowjob", location: "storage", participants: [{ id: "wife", role: "wife" }, { id: "p1", role: "patron" }], tags: { outfit: "uniform" } };
  const lookup = (have: string[]) => (d: { type: string; location: string; participants: { id: string; role: string }[]; tags?: Record<string, string> }) =>
    sceneKeyFallbacks(d).map(sceneFileName).find((k) => have.includes(k)) ?? null;
  it("shows the whole scene when the pack has it, and splits into portrait + close-ups when it does not", () => {
    const s = engine.init(5, { base: { preset: "ordinary" } });
    const f = pictureFrames(s, pair);
    expect(f.portrait?.type).toBe("portrait");
    expect(f.portrait?.tags?.face).toBeTruthy();
    expect(f.inserts.map((i) => i.type)).toEqual(["insert_blowjob"]);
    expect(f.inserts[0]!.tags?.face).toBeUndefined();
    expect(resolveFrames(f, lookup(["blowjob__any"]))).toEqual({ main: "blowjob__any", inserts: [], split: false });
    expect(resolveFrames(f, lookup(["portrait__any", "insert_blowjob__any"]))).toEqual({ main: "portrait__any", inserts: ["insert_blowjob__any"], split: true });
    expect(resolveFrames(f, lookup(["portrait__any"]))).toEqual({ main: "portrait__any", inserts: [], split: true });
    expect(resolveFrames(f, lookup(["insert_blowjob__any"]))).toBe(null);
  });
  it("builds a group from the close-ups of pairs, three at most", () => {
    const s0 = engine.init(5, { base: { preset: "ordinary" } });
    const s = structuredClone(s0);
    const b = bs(s);
    const ids = ["g1", "g2"];
    const sex = content.acts.find((a) => a.id === "sex")!;
    const bj = content.acts.find((a) => a.id === "blowjob")!;
    b.encounter = { ...(b.encounter ?? {}), patron: ids[0]!, act: "sex", loc: "storage", men: [{ patron: ids[1]!, slot: "mouth", act: "blowjob" }] } as never;
    const f = pictureFrames(s, { type: "group_spitroast", location: "storage", participants: [{ id: "wife", role: "wife" }, { id: ids[0]!, role: "patron" }, { id: ids[1]!, role: "patron2" }], tags: { men: "2" } });
    expect(f.inserts.map((i) => i.type)).toEqual([`insert_${sex.scene}`, `insert_${bj.scene}`]);
    expect(f.inserts.every((i) => i.participants[0]!.role === "patron")).toBe(true);
    expect(f.portrait?.tags?.men).toBeUndefined();
  });
});

import { ALONE, CAGE, cagedDays, confidenceOf, DOORS, WORK } from "@tc/base";

describe("19c: the long evening, his own body, the cage", () => {
  const acts = (s: ReturnType<typeof engine.init>, type: string) => engine.listActions(s).filter((a) => a.type === type);
  it("he can work the floor, shut the door and close early; the night starts when he closes", () => {
    let s = engine.dispatch(engine.init(3, { base: { preset: "ordinary" } }), { type: CORE_ADVANCE });
    expect(s.time.minute).toBe(content.balance.shift.opensAt * 60);
    expect(acts(s, WORK).length).toBeGreaterThan(0);
    const clean = bs(s).clean;
    s = engine.dispatch(s, { type: WORK, payload: { minutes: 60 } });
    expect(bs(s).shift!.tick).toBe(60);
    expect(bs(s).clean).toBeGreaterThanOrEqual(clean - 3); // he tidies as fast as the evening dirties
    s = engine.dispatch(s, { type: DOORS, payload: { do: "shut" } });
    const before = s.log.length;
    for (let i = 0; i < 40 && !acts(s, DOORS).some((a) => a.payload?.do === "close"); i++) s = engine.dispatch(s, { type: "base/wait", payload: { minutes: 15 } });
    expect(s.log.slice(before).some((e) => e.key === "log.patron.arrives")).toBe(false);
    s = engine.dispatch(s, { type: DOORS, payload: { do: "close" } });
    const closedAt = s.time.minute;
    expect(closedAt).toBeLessThan((content.balance.shift.opensAt + content.balance.shift.hours) * 60);
    s = engine.dispatch(s, { type: CORE_ADVANCE });
    expect(s.time.phase).toBe("night");
    expect(bs(s).nightStart).toBe(closedAt);
    expect(engine.checkInvariants(s)).toEqual([]);
  });
  it("alone at home he can settle himself; locked in the cage only what needs nothing of him is left, and asking is up to her", () => {
    let s = engine.init(3, { base: { preset: "ordinary" } });
    const mine = structuredClone(s);
    mine.where.husband = "home.bathroom";
    mine.where.wife = "cafe.kitchen";
    expect(acts(mine, ALONE).map((a) => a.payload?.do)).toContain("hand");
    const after = engine.dispatch(mine, { type: ALONE, payload: { do: "hand" } });
    expect(bs(after).husband.spentDay).toBe(1);
    expect(acts(after, ALONE)).toEqual([]);
    expect(confidenceOf(after)).toBeGreaterThanOrEqual(content.body.nerve.confidence.floor);
    const locked = structuredClone(mine);
    bs(locked).husband.caged = { day: 1 };
    expect(cagedDays(locked)).toBe(0);
    expect(acts(locked, ALONE).map((a) => a.payload?.do)).not.toContain("hand");
    locked.where.wife = locked.where.husband!;
    expect(acts(locked, CAGE).length).toBe(1);
    const asked = engine.dispatch(locked, { type: CAGE });
    expect(acts(asked, CAGE)).toEqual([]); // once a day
    expect(engine.checkInvariants(asked)).toEqual([]);
  });
});
