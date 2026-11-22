// How well the game is covered with text. Bots play; every line shown is counted by its family (the key without the
// variant number), against how many variants the family has in ru.yaml. Shows: families that repeat most (many shows,
// few variants), how many lines a day of play gives by area, and lines nobody ever saw.
// pnpm exec tsx tools/text-cover.ts [days=30] [seeds=3] [out.csv]
import { readFileSync, writeFileSync } from "node:fs";
import { baseMod, content } from "../packages/base/src";
import { createEngine } from "../packages/core/src";
import { awayStrategy, lovingStrategy, ownerStrategy, snoopStrategy } from "../packages/bots/src";

const [days = "30", seeds = "3", out] = process.argv.slice(2);
const family = (key: string) => key.replace(/#\d+$/, "").replace(/\.\d+$/, "");
const ru = [...readFileSync(new URL("../packages/base/locales/ru.yaml", import.meta.url), "utf8").matchAll(/^"?([\w.#+-]+)"?: /gm)].map((m) => m[1]!).filter((k) => /^(log|thought|sms)\./.test(k));
const variants = new Map<string, number>();
for (const k of ru) variants.set(family(k), (variants.get(family(k)) ?? 0) + 1);

const engine = createEngine([baseMod]);
const strategies = [awayStrategy, lovingStrategy, ownerStrategy, snoopStrategy];
const shown = new Map<string, number>();
const seenKeys = new Set<string>();
let games = 0;
let lines = 0;
for (const preset of content.presets.map((p) => p.id))
  for (let seed = 1; seed <= Number(seeds); seed++) {
    const play = strategies[(seed + games) % strategies.length]!;
    let s = engine.init(seed, { base: { preset } });
    let last = s.log.at(-1);
    games += 1;
    while (s.time.day <= Number(days)) {
      s = engine.dispatch(s, play(engine.listActions(s), s, () => 0));
      const i = last ? s.log.lastIndexOf(last) : -1;
      for (const e of s.log.slice(i + 1)) {
        shown.set(family(e.key), (shown.get(family(e.key)) ?? 0) + 1);
        seenKeys.add(e.key);
        lines += 1;
      }
      last = s.log.at(-1);
    }
    process.stderr.write(`\r${games} games`);
  }
process.stderr.write("\n");
const gameDays = games * Number(days);
const rows = [...shown].map(([f, n]) => ({ f, n, v: variants.get(f) ?? 0, perGame: n / games, repeat: n / games / Math.max(1, variants.get(f) ?? 1) })).sort((a, b) => b.repeat - a.repeat);
const area = (f: string) => f.split(".").slice(0, 2).join(".");
const byArea = new Map<string, { n: number; fam: number; v: number }>();
for (const r of rows) {
  const a = byArea.get(area(r.f)) ?? byArea.set(area(r.f), { n: 0, fam: 0, v: 0 }).get(area(r.f))!;
  a.n += r.n;
  a.fam += 1;
  a.v += r.v;
}
console.log(`${games} games x ${days} days: ${lines} lines shown, ${(lines / gameDays).toFixed(0)} a day; ${shown.size} families shown of ${variants.size} written; ${ru.length} lines written, ${ru.filter((k) => !seenKeys.has(k)).length} never shown`);
console.log("\nby area: lines a day | families | variants written | shows per variant per game");
for (const [a, x] of [...byArea].sort((p, q) => q[1].n - p[1].n).slice(0, 28)) console.log(`  ${a.padEnd(18)} ${(x.n / gameDays).toFixed(1).padStart(6)} ${String(x.fam).padStart(5)} ${String(x.v).padStart(6)} ${(x.n / games / Math.max(1, x.v)).toFixed(1).padStart(7)}`);
console.log("\nrepeats most (shows per game for every variant written):");
for (const r of rows.slice(0, 40)) console.log(`  ${r.repeat.toFixed(1).padStart(6)}  ${String(r.v).padStart(2)} var  ${r.perGame.toFixed(0).padStart(5)}/game  ${r.f}`);
const missing = rows.filter((r) => r.v === 0);
if (missing.length) console.log(`\nshown but not written (${missing.length}): ${missing.slice(0, 20).map((r) => r.f).join(", ")}`);
if (out) writeFileSync(out, ["family,shown per game,variants,shows per variant per game", ...rows.map((r) => `${r.f},${r.perGame.toFixed(2)},${r.v},${r.repeat.toFixed(2)}`), ...[...variants].filter(([f]) => !shown.has(f)).map(([f, v]) => `${f},0,${v},0`)].join("\n"));
