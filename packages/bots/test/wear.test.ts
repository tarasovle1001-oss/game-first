import { describe, expect, it } from "vitest";
import { baseMod, bs, charmOf, content, promptFor, withLook } from "@tc/base";
import { createEngine } from "@tc/core";
import type { SceneDesc } from "@tc/core";

const W = content.look.words;
const wife = { id: "wife", role: "wife" }, guest = { id: "p", role: "patron" };
const her = (type: string, tags: Record<string, string>, who = [wife]) => promptFor({ type, location: "cafe.hall", participants: who, tags } as SceneDesc).regions.wife!;

describe("her outfits in pictures", () => {
  it("every outfit has its colour, and the four work outfits differ in colour", () => {
    const work = ["modest", "fitted", "revealing", "daring"].map((o) => W.outfit[o]!);
    for (const o of work) expect(o.tags).toMatch(/\((\w+ )+\w+:1\.\d\)/);
    const colours = work.map((o) => o.tags.match(/\(([a-z]+) /)![1]);
    expect(new Set(colours).size).toBe(4);
  });
  it("partly off, it is the same outfit: her top down keeps the skirt, the skirt up shows the same panties", () => {
    const top = her("flash", { outfit: "fitted", bare: "top" });
    expect(top).toContain("pencil skirt");
    expect(top).toContain("breasts out");
    expect(top).not.toContain("topless");
    const up = her("idle", { outfit: "modest", skirt: "up" });
    expect(up).toContain("dress lift");
    expect(up).toContain(W.under.plain!.panties);
    const aside = her("idle", { outfit: "modest", under: "aside" });
    expect(aside).toContain(W.under.plain!.panties);
  });
  it("an act in her outfit pushes it aside: no stockings in the way, the panties of that outfit aside", () => {
    const sex = her("patron_sex", { outfit: "modest", size: "3" }, [wife, guest]);
    expect(sex).toContain("(blue dress:1.3)");
    expect(sex).not.toContain("black pantyhose");
    expect(sex).toContain("panties aside");
    expect(sex).toContain(W.under.plain!.panties);
  });
  it("naked is naked, whatever she had on", () => {
    expect(her("patron_sex", { outfit: "naked", bare: "all" }, [wife, guest])).not.toMatch(/dress|apron/);
  });
  it("the outfit's own negative goes into the picture", () => {
    const p = promptFor({ type: "idle", location: "cafe.hall", participants: [wife], tags: { outfit: "modest" } });
    expect(p.negative).toContain("maid headdress");
  });
  it("a see-through chemise: what is under it shows, it has no halves, and it is the most she can put on", () => {
    expect(her("idle", { outfit: "sheer_white" })).toContain(W.under.sheer_white!.panties);
    expect(her("idle", { outfit: "sheer_black", under: "off" })).toContain(W.panties.sheerOff);
    const engine = createEngine([baseMod]);
    const s = structuredClone(engine.init(5, { base: { attrs: { charm: 50 } } }));
    const b = bs(s);
    s.time.phase = "night";
    s.where.wife = "home.bedroom";
    b.owned.push("sheer_white", "sheer_black");
    b.heroine.traits.openness = 90;
    b.heroine.arousal = 0;
    b.heroine.drunk = 0;
    b.heroine.cum = {};
    b.heroine.after = {};
    s.time.day = 3; // pool of three: black chemise, white chemise, lingerie
    const idle = { type: "idle", location: "home.bedroom", participants: [wife] } as SceneDesc;
    const worn = withLook(s, idle).tags!.outfit!;
    expect(worn.startsWith("sheer_")).toBe(true);
    expect(charmOf(s)).toBe(90);
    b.heroine.panties = "off";
    expect(charmOf(s)).toBe(100);
    expect(withLook(s, idle).tags!.under).toBe("off"); // a whole scene keeps it for this outfit
    b.heroine.skirtUp = true;
    b.heroine.bare = "top";
    const t = withLook(s, idle).tags!;
    expect(t.skirt).toBeUndefined();
    expect(t.bare).toBeUndefined();
    b.heroine.bare = "all";
    expect(charmOf(s)).toBe(95); // naked: a little less than barely covered
    // for her husband at night it is easy, for a guest's room harder, for the floor the hardest
    b.heroine.bare = "none";
    b.heroine.traits.openness = 30;
    expect(withLook(s, idle).tags!.outfit!.startsWith("sheer_")).toBe(true);
    s.where.wife = "hotel.room1";
    expect(withLook(s, { ...idle, location: "hotel.room1" }).tags!.outfit).toBe("sheer_black"); // 26.11: she goes up in the nightgown, drawn with the chemise's key (they look the same); the other sheer things stay harder there
    expect(content.intimacy.wear.nightOut).toBe("nightgown"); // in the game it is still the nightgown
    const sheer = content.outfits.find((o) => o.id === "sheer_white")!;
    expect(sheer.sheer!.night).toBeLessThan(sheer.sheer!.nightOut);
    expect(sheer.sheer!.nightOut).toBeLessThan(sheer.openness);
  });
});
