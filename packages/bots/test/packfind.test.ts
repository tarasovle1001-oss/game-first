import { describe, expect, it } from "vitest";
import { findPicture, packIndex, packLayout, variantOf } from "@tc/base";
import type { PictureFrames } from "@tc/base";
import type { SceneDesc } from "@tc/core";

const her = [{ id: "wife", role: "wife" }];
const pair = [...her, { id: "p1", role: "patron" }];
const index = packIndex([
  "portrait__wife__cafe.bar__face=happy,outfit=modest",
  "portrait__wife__cafe.bar__face=happy,outfit=fitted",
  "portrait__wife__cafe.hall__bare=all,face=aroused",
  "idle__wife__cafe.kitchen__outfit=modest",
  "patron_sex__patron+wife__cafe.staff__face=aroused,outfit=daring,size=2,under=off",
  "patron_sex__patron+wife__cafe.staff__face=aroused,marks=inside+thighs,outfit=daring,size=4,under=off",
  "prompts",
]);
const d = (type: string, location: string, tags: Record<string, string>, who = her): SceneDesc => ({ type, location, participants: who, tags });

describe("the nearest picture of a pack", () => {
  it("takes the exact one when it is there", () => {
    expect(findPicture(index, d("portrait", "cafe.bar", { face: "happy", outfit: "fitted" }))).toMatchObject({ exact: true, cost: 0 });
  });
  it("keeps her clothes before her face and the room", () => {
    // another face in the right dress, not the right face in the wrong one
    expect(findPicture(index, d("portrait", "cafe.bar", { face: "annoyed", outfit: "fitted" }))?.stem).toBe("portrait__wife__cafe.bar__face=happy,outfit=fitted");
    expect(findPicture(index, d("portrait", "town.shops", { face: "happy", outfit: "modest" }))?.stem).toBe("portrait__wife__cafe.bar__face=happy,outfit=modest");
    // dressed is never shown as naked while a dressed picture exists
    expect(findPicture(index, d("portrait", "cafe.hall", { face: "aroused", outfit: "modest" }))?.stem).toContain("outfit=");
  });
  it("a size is nearer to the size next to it; marks that are not there cost", () => {
    expect(findPicture(index, d("patron_sex", "cafe.staff", { face: "aroused", outfit: "daring", size: "3", under: "off" }, pair))?.stem).toContain("size=2");
    expect(findPicture(index, d("patron_sex", "cafe.staff", { face: "aroused", outfit: "daring", size: "4", marks: "inside", under: "off" }, pair))?.stem).toContain("size=4");
  });
  it("another scene or other people never stand in", () => {
    expect(findPicture(index, d("patron_anal", "cafe.staff", {}, pair))).toBeNull();
    expect(findPicture(index, d("patron_sex", "cafe.staff", {}, her))).toBeNull();
  });
  it("her alone: the portrait in this room beats a whole picture from another room", () => {
    const full = d("idle", "cafe.bar", { face: "happy", outfit: "modest" });
    const frames: PictureFrames = { full, portrait: d("portrait", "cafe.bar", { face: "happy", outfit: "modest" }), inserts: [], details: [] };
    const got = packLayout(index, frames)!;
    expect(got.split).toBe(true);
    expect(got.main).toMatchObject({ exact: true, stem: "portrait__wife__cafe.bar__face=happy,outfit=modest" });
    const kitchen = d("idle", "cafe.kitchen", { face: "happy", outfit: "modest" });
    expect(packLayout(index, { full: kitchen, portrait: d("portrait", "cafe.kitchen", { face: "happy", outfit: "modest" }), inserts: [], details: [] })!.main.stem).toBe("idle__wife__cafe.kitchen__outfit=modest");
  });
  it("the same scene on the same day is the same variant; another day or another guest may differ", () => {
    const scene = d("patron_sex", "cafe.staff", { size: "3" }, pair);
    const today = variantOf(scene, "7:3", 8);
    expect(variantOf(structuredClone(scene), "7:3", 8)).toBe(today);
    const days = new Set(Array.from({ length: 12 }, (_, day) => variantOf(scene, `7:${day}`, 8)));
    expect(days.size).toBeGreaterThan(3);
    const guests = new Set(Array.from({ length: 12 }, (_, i) => variantOf({ ...scene, participants: [...her, { id: `p${i}`, role: "patron" }] }, "7:3", 8)));
    expect(guests.size).toBeGreaterThan(3);
    expect(variantOf(scene, "7:3", 1)).toBe(0);
  });
});
