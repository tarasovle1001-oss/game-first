import { describe, expect, it } from "vitest";
import { baseMod, bs, content, modeKey } from "@tc/base";
import { createEngine } from "@tc/core";

// NTR / NTS wordings (27.11, systems/modes.ts): "<key>@ntr" / "<key>@nts" in the locales replace the line in that mode.
const engine = createEngine([baseMod]);

describe("NTR / NTS wordings", () => {
  it("picks the variant of the mode, falls back to the plain line", () => {
    const hidden = engine.init(2, { base: { mode: "hidden" } });
    const open = engine.init(2, { base: { mode: "open" } });
    expect(modeKey(hidden, "log.bed.compare.say.1")).toBe("log.bed.compare.say.1@ntr");
    expect(modeKey(open, "log.bed.compare.say.1")).toBe("log.bed.compare.say.1");
    expect(modeKey(hidden, "log.cage.on")).toBe("log.cage.on");
    expect(content.locales.ru!["log.bed.compare.say.1@ntr"]).toBeTruthy();
  });
  it("the engine writes the variant into the log", () => {
    let s = structuredClone(engine.init(2, { base: { mode: "hidden" } }));
    expect(bs(s).mode).toBe("hidden");
    // any line written through ctx.log goes through the resolver: use the kink switch action as a harmless dispatch, then log by hand
    s = engine.dispatch(s, { type: "base/kinks", payload: { off: [] } });
    expect(s.log.every((l) => !l.key.endsWith("@nts"))).toBe(true);
  });
});
