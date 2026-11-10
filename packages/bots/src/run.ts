// Headless run: pnpm bot [--days 14] [--seeds 20]
import { baseMod } from "@tc/base";
import { createEngine } from "@tc/core";
import { exampleMod } from "@tc/mod-example";
import { randomStrategy, runBot, rushStrategy } from "./index";

const arg = (name: string, def: number) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? Number(process.argv[i + 1]) : def;
};
const days = arg("days", 14);
const seeds = arg("seeds", 20);

const mods = [baseMod, exampleMod];
const engine = createEngine(mods);
const strategies = { random: randomStrategy, rush: rushStrategy };

let failed = 0;
let turns = 0;
for (const [name, strategy] of Object.entries(strategies)) {
  for (let seed = 1; seed <= seeds; seed++) {
    const opts = { seed, days, strategy, strategyName: name, saveEvery: 17 };
    const a = runBot(engine, mods, opts);
    const b = runBot(engine, mods, opts);
    turns += a.turns;
    if (JSON.stringify(a.finalState) !== JSON.stringify(b.finalState)) a.errors.push("not deterministic: same seed gave different states");
    if (a.errors.length > 0) {
      failed += 1;
      console.log(`FAIL ${name} seed=${seed}`);
      a.errors.forEach((e) => console.log(`  ${e}`));
    }
  }
}
const runs = seeds * Object.keys(strategies).length;
console.log(`${runs - failed}/${runs} runs ok, ${days} days each, ${turns} turns total`);
process.exit(failed > 0 ? 1 : 0);
