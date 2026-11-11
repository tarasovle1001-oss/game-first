// Prints the log of a bot-played game as the player would read it (debug view: unseen lines are marked with *).
// pnpm exec tsx tools/story.ts [days] [seed] [strategy: away|snoop|loving|owner] [lang]
import { baseLocales, baseMod, clockText, renderLog } from "../packages/base/src";
import { createEngine, createTranslator } from "../packages/core/src";
import { awayStrategy, lovingStrategy, ownerStrategy, snoopStrategy } from "../packages/bots/src";

const [days = "7", seed = "1", strategy = "away", lang = "ru"] = process.argv.slice(2);
const pick = { away: awayStrategy, snoop: snoopStrategy, loving: lovingStrategy, owner: ownerStrategy }[strategy] ?? awayStrategy;
const engine = createEngine([baseMod]);
const t = createTranslator({ en: [baseLocales.en!], ru: [baseLocales.ru!] }, lang);
let s = engine.init(Number(seed));
let printed = 0;
const seen = new Set<string>();
while (s.time.day <= Number(days)) {
  s = engine.dispatch(s, pick(engine.listActions(s), s, () => 0));
  for (const e of s.log) {
    const id = `${e.turn}:${e.minute}:${e.key}:${JSON.stringify(e.params ?? {})}`;
    if (seen.has(id)) continue;
    seen.add(id);
    if (/log\.patron\.(arrives|returns)/.test(e.key)) continue; // too noisy for reading
    console.log(`d${String(e.day).padStart(2)} ${clockText(e.minute)} ${e.tags?.includes("unseen") ? "*" : " "} ${renderLog(e, t, lang)}`);
    printed += 1;
  }
}
console.log(`\n${printed} lines`);
