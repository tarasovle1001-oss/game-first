import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { scanEvents } from "../../../tools/events";

// The event catalog for mods (docs/events.json) is read from the code: it must match what the code does now.
describe("event catalog", () => {
  it("docs/events.json is up to date (else: pnpm events)", () => {
    const saved = JSON.parse(readFileSync(join(import.meta.dirname, "../../../docs/events.json"), "utf8"));
    expect(saved).toEqual(scanEvents());
  });
});
