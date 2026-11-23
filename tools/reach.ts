// Is everything reachable? A bot that presses anything plays several games; the tool reports, for the action types and
// log lines named on the command line (prefixes), how often each was offered / done / shown - and which never were.
//   npx tsx tools/reach.ts [days=20] [seeds=6] [out.json]
import { writeFileSync } from "node:fs";
import { baseMod, bs, content } from "../packages/base/src";
import { createEngine } from "../packages/core/src";
const [days = "20", seeds = "6", out = "reach.json"] = process.argv.slice(2);
const engine = createEngine([baseMod]);
const offered = new Map<string, number>();
const done = new Map<string, number>();
const shown = new Map<string, number>();
const bump = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) ?? 0) + 1);
const problems: string[] = [];
let turns = 0;
for (const preset of content.presets.map((p) => p.id))
  for (let seed = 1; seed <= Number(seeds); seed++) {
    let s = engine.init(seed * 7 + 1, { base: { preset, mode: seed % 2 ? "open" : "hidden" } });
    let lastAbs = 0;
    let r = seed * 2654435761;
    const rnd = () => ((r = (r * 1664525 + 1013904223) >>> 0), r / 2 ** 32);
    while (s.time.day <= Number(days)) {
      const acts = engine.listActions(s);
      const label = (a: { type: string; payload?: Record<string, unknown> }) => `${a.type}${a.payload?.do ? `:${a.payload.do}` : a.payload?.how ? `:${a.payload.how}` : ""}`;
      for (const k of new Set(acts.map(label))) bump(offered, k);
      // anything, but rare things first: an action offered seldom is taken when it is there
      const rare = acts.filter((a) => (done.get(label(a)) ?? 0) < 3);
      const a = rare.length && rnd() < 0.5 ? rare[Math.floor(rnd() * rare.length)]! : acts[Math.floor(rnd() * acts.length)]!;
      bump(done, label(a));
      const before = s.log.length;
      try {
        s = engine.dispatch(s, a);
      } catch (e) {
        problems.push(`throw on ${label(a)} day ${s.time.day}: ${(e as Error).message.slice(0, 160)}`);
        break;
      }
      turns += 1;
      const bad = engine.checkInvariants(s);
      if (bad.length) {
        const b = bs(s);
        problems.push(`invariant after ${label(a)} day ${s.time.day} ${s.time.phase}: ${bad[0]} | enc=${JSON.stringify(b.encounter && { p: b.encounter.patron, loc: b.encounter.loc, act: b.encounter.act })} wife=${s.where.wife} him=${s.where.husband} pat=${b.encounter ? s.where[b.encounter.patron] : ""} meet=${JSON.stringify(b.shift?.meet ?? null)} up=${JSON.stringify(b.night?.up ?? null)} sex=${b.night?.sex?.act ?? ""} last=${s.log.slice(-3).map((e) => e.key).join(",")}`);
        break; // the first one in a game is the cause; the rest follow from it
      }
      for (const e of s.log.slice(Math.min(before, s.log.length - 1) === before ? before : Math.max(0, s.log.length - 5))) bump(shown, e.key);
      const b = bs(s);
      if (!Number.isFinite(b.money) || !Number.isFinite(b.heroine.arousal)) problems.push(`NaN after ${label(a)} day ${s.time.day}`);
      // one clock for the whole game: it never runs back, whatever stage begins
      const abs = (s.time.day - 1) * 1440 + s.time.minute;
      if (abs < lastAbs) problems.push(`clock back after ${label(a)}: now ${s.time.phase} ${Math.floor((s.time.minute % 1440) / 60)}h`);
      lastAbs = abs;
    }
  }
const obj = (m: Map<string, number>) => Object.fromEntries([...m.entries()].sort());
writeFileSync(out, JSON.stringify({ turns, problems: [...new Set(problems)].slice(0, 60), offered: obj(offered), done: obj(done), shown: obj(shown) }, null, 1));
console.log(`${turns} turns, ${new Set(problems).size} problems`);
for (const p of [...new Set(problems)].slice(0, 12)) console.log("  " + p);
