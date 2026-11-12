// Refactoring guard: plays fixed games with bots and fingerprints where they end up.
// pnpm exec tsx tools/golden.ts write golden.json   - before the change
// pnpm exec tsx tools/golden.ts check golden.json   - after it: any difference means behaviour changed
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { baseMod } from "../packages/base/src";
import { createEngine, makeRng } from "../packages/core/src";
import { awayStrategy, lovingStrategy, ownerStrategy, randomStrategy, snoopStrategy } from "../packages/bots/src";

const [mode = "check", file = "golden.json", daysArg = "12"] = process.argv.slice(2);
const engine = createEngine([baseMod]);
const strategies = { random: randomStrategy, owner: ownerStrategy, away: awayStrategy, loving: lovingStrategy, snoop: snoopStrategy };
const out: Record<string, string> = {};
for (const [name, play] of Object.entries(strategies))
  for (const preset of ["faithful", "ordinary", "curious", "hungry"])
    for (const seed of [1, 2, 3]) {
      const bot = makeRng({ rng: seed * 7919 + 13 });
      let s = engine.init(seed, { base: { preset } });
      for (let i = 0; i < 60000 && s.time.day <= Number(daysArg); i++) s = engine.dispatch(s, play(engine.listActions(s), s, () => bot.int(0, 9999) / 10000));
      out[`${name}/${preset}/${seed}`] = `day ${s.time.day} turn ${s.turn} ${createHash("sha1").update(JSON.stringify(s)).digest("hex").slice(0, 16)}`;
    }
if (mode === "write") {
  writeFileSync(file, JSON.stringify(out, null, 1));
  console.log(`written ${Object.keys(out).length} fingerprints to ${file}`);
} else {
  const was = JSON.parse(readFileSync(file, "utf8")) as Record<string, string>;
  const diff = Object.keys(out).filter((k) => was[k] !== out[k]);
  console.log(diff.length ? `CHANGED ${diff.length}/${Object.keys(out).length}:\n${diff.map((k) => `  ${k}: ${was[k]} -> ${out[k]}`).join("\n")}` : `same: ${Object.keys(out).length} games end exactly where they did`);
  if (diff.length) process.exit(1);
}
