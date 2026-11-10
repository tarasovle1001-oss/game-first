// Plays with a bot until something is going on, then writes a save to load in the browser.
// pnpm exec tsx tools/make-save.ts out.json [minDay] [seed]
import { writeFileSync } from "node:fs";
import { baseMod, bs } from "../packages/base/src";
import { CORE_MOVE, createEngine, saveGame } from "../packages/core/src";
import { exampleMod } from "../packages/mods/example/src";
import { awayStrategy } from "../packages/bots/src";

const [out = "save.json", minDay = "10", seed = "1"] = process.argv.slice(2);
const engine = createEngine([baseMod, exampleMod]);
let s = engine.init(Number(seed));
for (let i = 0; i < 200000; i++) {
  const enc = bs(s).encounter;
  if (s.time.day >= Number(minDay) && enc && enc.loc !== "cafe.hall") {
    // walk the husband in, if the room is one step away
    const step = engine.listActions(s).find((a) => a.type === CORE_MOVE && a.payload?.to === enc.loc);
    if (step) s = engine.dispatch(s, step);
    break;
  }
  const actions = engine.listActions(s);
  const tenMin = actions.find((a) => a.type === "base/wait" && a.payload?.minutes === 10);
  s = engine.dispatch(s, s.time.phase === "shift" && s.where.husband === "cafe.kitchen" && tenMin ? tenMin : awayStrategy(actions, s, () => 0));
}
writeFileSync(out, saveGame(s, engine));
console.log(`day ${s.time.day}, encounter: ${JSON.stringify(bs(s).encounter)}, husband at ${s.where.husband}`);
