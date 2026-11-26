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

import { pictureFrames, promptFor, resolveFrames } from "@tc/base";
import { sceneKeyFallbacks, sceneFileName } from "@tc/core";

describe("main picture and close-ups", () => {
  const pair = { type: "blowjob", location: "storage", participants: [{ id: "wife", role: "wife" }, { id: "p1", role: "patron" }], tags: { outfit: "uniform" } };
  const lookup = (have: string[]) => (d: { type: string; location: string; participants: { id: string; role: string }[]; tags?: Record<string, string> }) =>
    sceneKeyFallbacks(d).map(sceneFileName).find((k) => have.includes(k)) ?? null;
  it("a scene is one picture: the whole one, or her portrait; no close-ups of the act are asked for", () => {
    const s = engine.init(5, { base: { preset: "ordinary" } });
    const f = pictureFrames(s, pair);
    expect(f.portrait?.type).toBe("portrait");
    expect(f.portrait?.tags?.face).toBeTruthy();
    expect(f.inserts).toEqual([]);
    expect(resolveFrames(f, lookup(["blowjob__any"]))).toEqual({ main: "blowjob__any", inserts: [], split: false });
    expect(resolveFrames(f, lookup(["portrait__any", "insert_blowjob__any"]))).toEqual({ main: "portrait__any", inserts: [], split: true });
    expect(resolveFrames(f, lookup(["insert_blowjob__any"]))).toBe(null);
  });
  it("a whole picture and her portrait carry nothing the eye cannot tell at that distance", () => {
    const s = structuredClone(engine.init(5, { base: { preset: "ordinary" } }));
    const b = bs(s);
    b.patrons.g1 = { ...(Object.values(b.patrons)[0] ?? ({} as never)), id: "g1", size: 40 } as never;
    b.heroine.cum = { face: 30, inside: 30 };
    b.heroine.body.vagina = { stretch: 80, peak: 80, perm: 60 };
    b.heroine.sore = { vagina: 90 };
    const f = pictureFrames(s, { type: "patron_sex", location: "cafe.staff", participants: [{ id: "wife", role: "wife" }, { id: "g1", role: "patron" }], tags: {} });
    for (const d of [f.full, f.portrait!]) for (const k of ["size", "size2", "size3", "marks", "gape", "sore"]) expect(d.tags?.[k]).toBeUndefined();
    expect(f.full.tags?.outfit).toBeTruthy();
    // no scene is "never shown whole" any more, and the sauna has no scene of its own
    expect(content.scenes.some((x) => (x as { split?: boolean }).split)).toBe(false);
    expect(content.scenes.some((x) => x.id === "sauna_massage") || content.acts.some((x) => x.id === "sauna_massage")).toBe(false);
  });
  it("prompts: her towel in the sauna, the toy's size in a whole scene, a LoRA of the scene's own", () => {
    const her = { id: "wife", role: "wife" };
    const sauna = promptFor({ type: "kissing", location: "cafe.sauna", participants: [her, { id: "g", role: "patron" }], tags: { outfit: "towel", face: "happy" } });
    expect(sauna.positive).toContain("naked towel");
    const big = promptFor({ type: "dildo_him", location: "home.bedroom", participants: [her, { id: "husband", role: "husband" }], tags: { outfit: "lingerie", tsize: "4" } });
    expect(big.positive).toContain("gigantic dildo");
    expect(big.lora).toEqual({ file: "tc_femdom-1000", weight: 0.6 });
    expect(big.positive.startsWith("tc_femdom, ")).toBe(true);
    expect(promptFor({ type: "group_spitroast", location: "cafe.lounge", participants: [her, { id: "a", role: "patron" }, { id: "b", role: "patron2" }], tags: { men: "2" } }).lora?.file).toBe("tc_groups");
    expect(promptFor({ type: "talk", location: "home.bedroom", participants: [her, { id: "husband", role: "husband" }], tags: {} }).lora).toBeUndefined();
    // the back view for a toy behind, another composition for the biggest; her hair where her head is in the close-up
    const a2 = promptFor({ type: "detail_toy_a", location: "any", participants: [her], tags: { tsize: "2" } });
    const a4 = promptFor({ type: "detail_toy_a", location: "any", participants: [her], tags: { tsize: "4" } });
    expect(a2.positive).toContain("top-down bottom-up");
    expect(a4.positive).toContain("squatting");
    expect(a4.positive).not.toContain("top-down bottom-up");
    expect(promptFor({ type: "detail_phone_ear", location: "any", participants: [her], tags: {} }).positive).toContain("long straight hair");
    expect(promptFor({ type: "detail_wet", location: "any", participants: [her], tags: {} }).positive).not.toContain("long straight hair");
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
    expect(s.time.phase).toBe("night"); // locking up is what starts the night: nothing to click through
    expect(bs(s).nightStart).toBe(closedAt);
    expect(engine.checkInvariants(s)).toEqual([]);
  });
  it("alone at home he can settle himself; locked in the cage only what needs nothing of him is left, and asking is up to her", () => {
    let s = engine.init(3, { base: { preset: "ordinary" } });
    const mine = structuredClone(s);
    mine.where.husband = "home.bathroom";
    mine.where.wife = "cafe.kitchen";
    expect(acts(mine, ALONE).map((a) => a.payload?.do)).toContain("hand");
    let after = engine.dispatch(mine, { type: ALONE, payload: { do: "hand" } });
    // it is played move by move, until he finishes (or she walks in)
    expect(acts(after, ALONE)).toEqual([]);
    for (let i = 0; i < 20 && bs(after).alone && acts(after, "base/alone-do").length > 0; i++) {
      const dos = acts(after, "base/alone-do");
      after = engine.dispatch(after, dos.find((a) => a.payload?.do === "finish") ?? dos.find((a) => a.payload?.do === "faster")!);
    }
    expect(bs(after).alone).toBeUndefined();
    if (!bs(after).husband.spentDay) expect(after.log.some((e) => e.key.startsWith("log.alone.caught"))).toBe(true);
    else expect(bs(after).husband.spentDay).toBe(1);
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

import { ROOM_DOOR } from "@tc/base";
describe("her trip to a lodger's room is played by the night's clock", () => {
  const toNightWithBell = () => {
    let s = engine.init(5, { base: { preset: "curious" } });
    while (s.time.phase !== "night") s = engine.dispatch(s, engine.listActions(s).find((a) => a.type === CORE_ADVANCE) ?? engine.listActions(s).find((a) => a.type === "base/wait" && a.payload?.until) ?? engine.listActions(s)[0]!);
    s = structuredClone(s);
    const b = bs(s);
    const guest = Object.values(b.patrons)[0]!;
    guest.memory.interest = 90;
    b.lodgers = { "hotel.room1": { patron: guest.id, nights: 2 } };
    b.complaint = null;
    b.night!.wants = false;
    b.night!.up = { room: "hotel.room1", patron: guest.id, leaveAt: 5, stage: 0 };
    return s;
  };
  const wait = (s: ReturnType<typeof engine.init>, minutes: number) => engine.dispatch(s, { type: "base/night-wait", payload: { minutes } });
  it("the bell rings, she leaves, and comes back; he can stand at the door meanwhile", () => {
    let s = wait(toNightWithBell(), 5);
    expect(s.where.wife).toBe("hotel.room1");
    expect(s.log.some((e) => e.key.startsWith("log.towels.call"))).toBe(true);
    const at = structuredClone(s);
    at.where.husband = "hotel.landing";
    const door = engine.listActions(at).filter((a) => a.type === ROOM_DOOR).map((a) => a.payload?.how);
    expect(door).toEqual(["listen", "knock"]);
    const knocked = engine.dispatch(at, { type: ROOM_DOOR, payload: { how: "knock" } });
    expect(knocked.log.some((e) => e.key === "log.room_door.knock.early")).toBe(true); // nothing had come of it yet
    const back = wait(knocked, 5);
    expect(back.where.wife).toBe("home.bedroom");
    expect(bs(back).night!.up).toBeUndefined();
    // left alone, it runs its course
    for (let i = 0; i < 80 && bs(s).night?.up; i++) s = wait(s, 5);
    expect(bs(s).night!.up).toBeUndefined();
    expect(s.where.wife).toBe("home.bedroom");
    expect(engine.checkInvariants(s)).toEqual([]);
  });
  it("asleep, he gets it told in one line as before", () => {
    const s = engine.dispatch(toNightWithBell(), { type: CORE_ADVANCE });
    expect(s.time.phase).not.toBe("night");
    expect(s.log.some((e) => e.key.startsWith("log.towels."))).toBe(true);
    expect(s.where.wife).not.toBe("hotel.room1");
  });
});

describe("small things get a picture for one move", () => {
  it("his hand on her by day, then back to what is going on", () => {
    let s = structuredClone(engine.init(3, { base: { preset: "curious" } }));
    s.where.wife = s.where.husband!;
    bs(s).heroine.marriage.desire = 80;
    if (bs(s).day) bs(s).day!.busy = undefined as never;
    const hug = engine.listActions(s).find((a) => a.type === "base/talk" && a.payload?.do === "hug");
    expect(hug).toBeDefined();
    s = engine.dispatch(s, hug!);
    expect(engine.currentScene(s)?.type).toBe("him_hug");
    const kiss = engine.listActions(s).find((a) => a.type === "base/talk" && a.payload?.do === "kiss_her")!;
    s = engine.dispatch(s, kiss);
    expect(["him_kiss", "talk"]).toContain(engine.currentScene(s)?.type);
    const other = engine.listActions(s).find((a) => a.type !== "base/talk")!;
    s = engine.dispatch(s, other);
    expect(engine.currentScene(s)?.type.startsWith("him_")).toBe(false);
  });
  it("she has come over to him: the picture is of the two of them", () => {
    const s = structuredClone(engine.init(3, { base: { preset: "curious" } }));
    s.where.wife = s.where.husband!;
    bs(s).approach = { kind: "affection", public: false };
    expect(engine.currentScene(s)?.type).toBe("him_hug");
  });
});

import { detailsFor } from "@tc/base";
const BODY = new Set(["detail_gape_v", "detail_gape_a", "detail_nipples"]);
describe("free close-ups", () => {
  const atShift = () => {
    let s = engine.init(4, { base: { preset: "curious" } });
    for (let i = 0; i < 400 && (s.time.phase !== "shift" || (bs(s).shift?.visits.length ?? 0) === 0); i++) s = engine.dispatch(s, engine.listActions(s).find((a) => a.type === "base/wait") ?? engine.listActions(s).find((a) => a.type === CORE_ADVANCE)!);
    return structuredClone(s);
  };
  it("him at a guest's table is a close-up beside what she does, not a picture of its own", () => {
    const s = atShift();
    const v = bs(s).shift!.visits[0]!;
    s.where.husband = "cafe.hall";
    bs(s).shift!.show = { type: "table_sit", until: bs(s).shift!.tick + 2, patron: v.patron };
    const desc = { type: "serving", location: "cafe.hall", participants: [{ id: "wife", role: "wife" }, { id: v.patron, role: "patron" }] };
    const d = detailsFor(s, desc).find((x) => x.type === "detail_table_sit");
    expect(d?.participants[0]?.id).toBe(v.patron);
    expect(promptFor(d!).key).toMatch(/^detail_table_sit\//);
    bs(s).shift!.tick = bs(s).shift!.show!.until;
    expect(detailsFor(s, desc).some((x) => x.type === "detail_table_sit")).toBe(false);
  });
  it("a worked-up guest shows through his trousers, by size; how wet she is shows on her", () => {
    const s = atShift();
    const v = bs(s).shift!.visits[0]!;
    v.heat = 90;
    bs(s).heroine.arousal = 80;
    const desc = { type: "serving", location: "cafe.hall", participants: [{ id: "wife", role: "wife" }, { id: v.patron, role: "patron" }] };
    const d = detailsFor(s, desc);
    const by = Object.fromEntries(d.map((x) => [x.type, x.tags ?? {}]));
    expect(by.detail_bulge!.size).toBeDefined();
    expect(by.detail_gape_v!.wet).toBe("2"); // how wet she is is part of the pussy close-up now (26.11)
    expect(by.detail_gape_v!.wear).toBe("on");
    for (const x of d) expect(Object.keys(x.tags ?? {}).length).toBeLessThanOrEqual(BODY.has(x.type) ? 5 : 3);
    expect(pictureFrames(s, desc).details.length).toBe(d.length);
    // in bed with a big man the accents come instead
    const bed = detailsFor(s, { type: "patron_sex", location: "cafe.staff", participants: [{ id: "wife", role: "wife" }, { id: v.patron, role: "patron" }] });
    expect(bed.map((x) => x.type)).toContain("detail_belly_bulge");
    // the section through her is no close-up any more: a variant of the main picture, and what he left in her is one
    expect(bed.some((x) => x.type.startsWith("detail_xray"))).toBe(false);
    const fin = detailsFor(s, { type: "patron_sex", location: "cafe.staff", participants: [{ id: "wife", role: "wife" }, { id: v.patron, role: "patron" }], tags: { fin: "inside" } });
    expect(fin.map((x) => x.type)).toContain("detail_womb_cum");
    // a close-up of her dressed body is in the outfit of the main picture
    expect(by.detail_gape_v!.outfit).toBe(bs(s).heroine.outfit);
    expect(by.detail_bulge!.outfit).toBeUndefined();
  });
  it("her body is always on screen: pussy, anus, nipples fill the free places; a scene about one does not repeat it", () => {
    const s = atShift();
    const v = bs(s).shift!.visits[0]!;
    const her = { id: "wife", role: "wife" }, him = { id: v.patron, role: "patron" };
    const types = (type: string) => detailsFor(s, { type, location: "cafe.hall", participants: [her, him] }).map((x) => x.type);
    expect(types("patron_chatting")).toEqual(["detail_gape_v", "detail_gape_a", "detail_nipples"]);
    expect(types("patron_sex")).not.toContain("detail_gape_v");
    expect(types("patron_anal")).not.toContain("detail_gape_a");
    expect(types("patron_breast_play")).not.toContain("detail_nipples");
    const a = detailsFor(s, { type: "patron_chatting", location: "cafe.hall", participants: [her, him] }).find((x) => x.type === "detail_gape_a")!;
    expect(a.tags!.wear).toBeUndefined(); // drawn bare, a game convention
    expect(a.tags!.outfit).toBeDefined();
    // other close-ups come first: with three of them her body is gone
    v.heat = 90;
    expect(types("patron_chatting")[0]).toBe("detail_bulge");
    expect(types("patron_chatting")).not.toContain("detail_nipples");
  });
  it("what she does while the phone rings is only for eyes that may see it", () => {
    const s = atShift();
    const b = bs(s);
    const v = b.shift!.visits[0]!;
    b.encounter = { patron: v.patron, act: "blowjob", loc: "cafe.staff", pleasure: 0, hers: 0, minutes: 0 } as never;
    s.where.wife = "cafe.staff";
    b.phone.calledTick = -100;
    b.heroine.traits.honesty = 20;
    const called = engine.dispatch(s, { type: "base/call-wife" });
    const desc = { type: "idle", location: "cafe.staff", participants: [{ id: "wife", role: "wife" }] };
    expect(detailsFor(called, desc).map((x) => x.type).filter((t) => !BODY.has(t))).toEqual(["detail_phone_ear"]); // her body fills the rest
    const open = structuredClone(called);
    bs(open).viewAll = true;
    expect(detailsFor(open, desc).map((x) => x.type)).toContain("detail_phone_busy");
  });
});

import { withLook } from "@tc/base";
import { sceneKey } from "@tc/core";
describe("pictures: what a key carries after the picture chat looked (22.11)", () => {
  const her = { id: "wife", role: "wife" };
  const fresh = () => engine.init(5, { base: { preset: "ordinary" } });
  it("finished inside her: her legs lock around him only when she wanted it there (lock=1)", () => {
    const s = fresh();
    const plain = withLook(s, { type: "patron_fin_inside", location: "cafe.staff", participants: [her, { id: "a", role: "patron" }], tags: { fin: "inside" } });
    const locked = withLook(s, { type: "patron_fin_inside", location: "cafe.staff", participants: [her, { id: "a", role: "patron" }], tags: { fin: "inside", lock: "1" } });
    expect(sceneKey(plain)).not.toMatch(/lock=1/);
    expect(sceneKey(locked)).toMatch(/lock=1/);
    expect(promptFor(locked).positive).toMatch(/leg lock/);
    expect(promptFor(plain).positive).not.toMatch(/leg lock/);
  });
  it("more than one man: the picture goes by the scene's own name; only 'they have finished' counts them", () => {
    const s = fresh();
    const two = withLook(s, { type: "group_spitroast", location: "cafe.staff", participants: [her, { id: "a", role: "patron" }, { id: "b", role: "patron2" }], tags: { men: "2" } });
    expect(sceneKey(two)).toMatch(/^group_spitroast\/patron\+wife\/cafe\.staff\//);
    expect(two.tags!.men).toBeUndefined();
    const same = content.look.group.same;
    const three = withLook(s, { type: "group_airtight", location: "cafe.staff", participants: [her, { id: "a", role: "patron" }, { id: "b", role: "patron2" }, { id: "c", role: "patron3" }], tags: { men: "3" } });
    expect(three.type).toBe(same.group_airtight ?? "group_airtight");
    // her husband joining: his own pictures, he is in the roles
    const join = withLook(s, { type: "join_mouth", location: "cafe.staff", participants: [her, { id: "a", role: "patron" }, { id: "husband", role: "husband" }], tags: {} });
    expect(sceneKey(join)).toMatch(/^join_mouth\/husband\+patron\+wife\//);
    expect(withLook(s, { type: "came_join_dp", location: "cafe.staff", participants: [her, { id: "a", role: "patron" }, { id: "husband", role: "husband" }], tags: {} }).type).toBe("came_join_dp");
    // "they have finished" keeps how many they were, five are "4"
    expect(withLook(s, { type: "group_after", location: "cafe.staff", participants: [her, { id: "a", role: "patron" }], tags: { men: "5" } }).tags!.men).toBe("4");
    expect(promptFor(two).positive).toContain("mmf threesome");
  });
  it("the flush and the drink are in no key; no underwear and a lifted skirt only on her portrait; his size in no whole scene", () => {
    const s = structuredClone(fresh());
    const h = bs(s).heroine;
    h.drunk = 80;
    h.after = { sweat: 30 };
    h.panties = "off";
    h.skirtUp = true;
    const f = pictureFrames(s, { type: "idle", location: "cafe.hall", participants: [her], tags: {} });
    expect(Object.keys(f.full.tags!)).not.toEqual(expect.arrayContaining(["after"]));
    for (const k of ["after", "drunk", "under", "skirt"]) expect(f.full.tags![k], k).toBeUndefined();
    for (const k of ["after", "drunk"]) expect(f.portrait!.tags![k], k).toBeUndefined();
    expect(f.portrait!.tags).toMatchObject({ under: "off", skirt: "up" });
    const bed = withLook(s, { type: "sex", location: "home.bedroom", participants: [her, { id: "husband", role: "husband" }], tags: {} });
    expect(bed.tags!.hsize).toBeUndefined();
  });
});
