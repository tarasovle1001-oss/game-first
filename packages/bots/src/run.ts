// Headless run: pnpm bot [--days 14] [--seeds 20]
import { baseMod } from "@tc/base";
import { createEngine } from "@tc/core";
import type { GameState } from "@tc/core";
import { exampleMod } from "@tc/mod-example";
import { awayStrategy, ownerStrategy, randomStrategy, runBot, rushStrategy } from "./index";

const arg = (name: string, def: number) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? Number(process.argv[i + 1]) : def;
};
const days = arg("days", 14);
const seeds = arg("seeds", 20);

const mods = [baseMod, exampleMod];
const engine = createEngine(mods);
const strategies = { random: randomStrategy, rush: rushStrategy, owner: ownerStrategy, away: awayStrategy };

let failed = 0;
let turns = 0;
const avg = (xs: number[]) => Math.round(xs.reduce((a, x) => a + x, 0) / Math.max(1, xs.length));
for (const [name, strategy] of Object.entries(strategies)) {
  const finals: GameState[] = [];
  for (let seed = 1; seed <= seeds; seed++) {
    const opts = { seed, days, strategy, strategyName: name, saveEvery: 17 };
    const a = runBot(engine, mods, opts);
    const b = runBot(engine, mods, opts);
    turns += a.turns;
    finals.push(a.finalState);
    if (JSON.stringify(a.finalState) !== JSON.stringify(b.finalState)) a.errors.push("not deterministic: same seed gave different states");
    if (a.errors.length > 0) {
      failed += 1;
      console.log(`FAIL ${name} seed=${seed}`);
      a.errors.forEach((e) => console.log(`  ${e}`));
    }
  }
  // balance snapshot after the run: the quickest way to see if the economy drifts
  const b = finals.map((f) => f.mods.base);
  console.log(
    `${name.padEnd(7)} money ${avg(b.map((x) => x.money))}  debt ${avg(b.map((x) => x.debt))}  rep ${avg(b.map((x) => x.reputation))}  ` +
      `served/day ${avg(b.map((x) => avg(x.history.map((h: any) => h.served))))}  known patrons ${avg(b.map((x) => Object.keys(x.patrons).length))}  ` +
      `regulars ${avg(b.map((x) => Object.values(x.patrons).filter((p: any) => p.regular).length))}`,
  );
  const top = (x: any) => Math.max(-1, ...Object.values(x.patrons).map((p: any) => p.memory.tier));
  console.log(
    `        her: fidelity ${avg(b.map((x) => x.heroine.traits.fidelity))}  openness ${avg(b.map((x) => x.heroine.traits.openness))}  ` +
      `top tier reached: avg ${(b.reduce((a, x) => a + top(x), 0) / b.length).toFixed(1)}, max ${Math.max(...b.map(top))}`,
  );
}
const runs = seeds * Object.keys(strategies).length;
console.log(`${runs - failed}/${runs} runs ok, ${days} days each, ${turns} turns total`);
process.exit(failed > 0 ? 1 : 0);
