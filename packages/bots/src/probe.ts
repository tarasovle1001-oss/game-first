// Prints why she answered the way she did: pnpm exec tsx packages/bots/src/probe.ts [days] [seed]
import { baseMod, bs } from "@tc/base";
import { createEngine } from "@tc/core";
import { exampleMod } from "@tc/mod-example";
import { awayStrategy } from "./index";

const days = Number(process.argv[2] ?? 10);
const seed = Number(process.argv[3] ?? 1);
const engine = createEngine([baseMod, exampleMod]);
let s = engine.init(seed);
const seen = new Set<string>();
const count: Record<string, number> = {};
while (s.time.day <= days) {
  s = engine.dispatch(s, awayStrategy(engine.listActions(s), s, () => 0));
  for (const p of bs(s).proposals) {
    const key = `${p.day}.${p.tick}.${p.patron}.${p.act}`;
    if (seen.has(key)) continue;
    seen.add(key);
    count[`${p.act}:${p.verdict}`] = (count[`${p.act}:${p.verdict}`] ?? 0) + 1;
  }
}
console.log(Object.entries(count).sort().map(([k, v]) => `${k}=${v}`).join("  "));
for (const p of bs(s).proposals.slice(-4))
  console.log(`\nday ${p.day} tick ${p.tick} ${p.act} -> ${p.verdict} (${p.total.toFixed(1)})\n` + p.rows.map((r) => `  ${r.id.padEnd(20)} ${r.value.toFixed(1)}`).join("\n"));
