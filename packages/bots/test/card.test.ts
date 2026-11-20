import { describe, expect, it } from "vitest";
import { baseMod, bs, cardFolder, cardToCast, content, newCard, previewScenes, promptFor, randomLook, readCard } from "@tc/base";
import { createEngine } from "@tc/core";

const engine = createEngine([baseMod]);
const nika = () => ({ ...newCard("Ника", 1, () => 0.3), look: { hair_color: "black", hair_length: "long", eye_color: "purple", bust: "medium" }, marks: ["freckles"], extra: "(hair ribbon:1.2)" });

describe("heroine card", () => {
  it("her look goes into every picture of her, and her body words only where she is bare", () => {
    const c = nika();
    const [full, , nude, sex] = previewScenes();
    const dressed = promptFor(full!.desc, "default", cardToCast(c)).positive;
    expect(dressed).toContain("black hair");
    expect(dressed).toContain("(hair ribbon:1.2)");
    expect(dressed).toContain("freckles");
    expect(dressed).not.toContain("ass visible through thighs");
    expect(promptFor(nude!.desc, "default", cardToCast(c)).positive).toContain("ass visible through thighs");
    // the guest keeps his own card; her look does not leak the default heroine's
    const s = promptFor(sex!.desc, "default", cardToCast(c)).positive;
    expect(s).toContain("dark-skinned male");
    expect(s).not.toContain("black lipstick");
  });
  it("every option of the builder is a known slot and a random look is valid", () => {
    for (let i = 0; i < 50; i++) {
      const c = { ...newCard("x", 0, Math.random), ...randomLook(Math.random) };
      expect(readCard(JSON.parse(JSON.stringify(c)))?.look).toEqual(c.look);
    }
    for (const p of content.heroine.previews) expect(content.prompt.tags[p.type] ?? "").not.toBe("");
  });
  it("a card from a file is cleaned: adult age, known options only, not a card -> null", () => {
    const c = readCard({ ...nika(), age: 12, look: { hair_color: "black", nonsense: "x", bust: "gigantic" }, marks: ["freckles", "nope"] })!;
    expect(c.age).toBe(18);
    expect(c.look).toEqual({ hair_color: "black" });
    expect(c.marks).toEqual(["freckles"]);
    expect(readCard({ name: "x" })).toBeNull();
    expect(readCard({ id: "../etc", name: "x" })).toBeNull();
  });
  it("her folder changes with her look and only with it", () => {
    const c = nika();
    expect(cardFolder({ ...c, name: "Другая", story: "..." })).toBe(cardFolder(c));
    expect(cardFolder({ ...c, look: { ...c.look, hair_color: "red" } })).not.toBe(cardFolder(c));
  });
  it("a new game with her card keeps it in the save and calls her by her name", () => {
    const s = engine.init(7, { base: { card: nika() } as never });
    expect(bs(s).heroine.card?.look.hair_color).toBe("black");
    expect(bs(s).heroine.name).toBe("Ника");
    expect(engine.checkInvariants(s)).toEqual([]);
  });
});
