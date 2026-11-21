import { describe, expect, it } from "vitest";
import { content, promptFor } from "@tc/base";
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
});
