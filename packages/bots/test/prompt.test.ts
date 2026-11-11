import { describe, expect, it } from "vitest";
import { baseMod, content, pictureScene, PICTURE_TAGS, promptFor } from "@tc/base";
import { createEngine, sceneKey, sceneKeyFallbacks } from "@tc/core";
import type { SceneDesc } from "@tc/core";
import { awayStrategy } from "../src";

const engine = createEngine([baseMod]);
const W = content.look.words;

describe("picture prompts", () => {
  it("has a slot for every figure of every layout", () => {
    for (const s of content.scenes) {
      const slots = content.prompt.poses[s.id]!;
      expect(slots, s.id).toBeTruthy();
      for (const f of s.figures) expect(f.role in slots, `${s.id}.${f.role}`).toBe(true);
    }
  });

  it("keeps her look in her region and his size in his", () => {
    const desc: SceneDesc = {
      type: "patron_sex",
      location: "cafe.staff",
      participants: [{ id: "wife", role: "wife" }, { id: "p1", role: "patron" }],
      tags: { outfit: "lingerie", face: "aroused", marks: "chest+face", size: "4", gape: "v2" },
    };
    const p = promptFor(desc);
    expect(Object.keys(p.regions).sort()).toEqual(["patron", "wife"]);
    expect(p.regions.wife).toContain(W.outfit.lingerie);
    expect(p.regions.wife).toContain(W.cum.face);
    expect(p.regions.wife).toContain(W.stretch.vagina![1]![1]);
    expect(p.regions.patron).toContain(W.size[4]);
    expect(p.regions.patron).not.toContain(W.outfit.lingerie);
    expect(p.regions.wife).not.toContain(W.size[4]);
    expect(p.shared).toContain("1girl");
    expect(p.shared).toContain("1boy");
    expect(p.shared).toContain(W.act.sex);
    expect(p.positive).not.toMatch(/undefined|, ,/);
    // same key, same prompt
    expect(promptFor({ ...desc, participants: [...desc.participants].reverse() })).toEqual(p);
  });

  it("counts every man of a group", () => {
    const p = promptFor({ type: "group_dp", location: "cafe.staff", participants: [{ id: "wife", role: "wife" }, { id: "a", role: "patron" }, { id: "b", role: "patron2" }], tags: { men: "2" } });
    expect(p.shared).toContain("2boys");
  });

  it("falls back by importance: the outfit outlives the face, the face outlives soreness", () => {
    const desc: SceneDesc = { type: "serving", location: "cafe.hall", participants: [{ id: "wife", role: "wife" }], tags: { outfit: "fitted", face: "happy", sore: "m1" } };
    const keys = sceneKeyFallbacks(desc, PICTURE_TAGS);
    expect(keys[0]).toBe(sceneKey(desc));
    expect(keys[1]).toBe("serving/wife/cafe.hall/face=happy,outfit=fitted");
    expect(keys[2]).toBe("serving/wife/cafe.hall/outfit=fitted");
  });

  it("builds a clean prompt for every picture a played game asks for", () => {
    let s = engine.init(5, { base: { preset: content.presets[0]!.id } });
    const seen = new Set<string>();
    while (s.time.day <= 4) {
      s = engine.dispatch(s, awayStrategy(engine.listActions(s), s, () => 0));
      const d = pictureScene(engine, s);
      if (!d || seen.has(sceneKey(d))) continue;
      seen.add(sceneKey(d));
      const p = promptFor(d);
      expect(p.positive, p.key).not.toMatch(/undefined|NaN/);
      if (d.participants.some((x) => x.role === "wife")) expect(d.tags?.face, p.key).toBeTruthy();
    }
    expect(seen.size).toBeGreaterThan(5);
  });
});
