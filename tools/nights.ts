// How nights with the husband end for different wives. Usage: tsx tools/nights.ts [days] [seeds]
import { baseMod, bs } from "../packages/base/src";
import { createEngine, makeRng } from "../packages/core/src";
import { lovingStrategy } from "../packages/bots/src";

const days = Number(process.argv[2] ?? 14);
const seeds = Number(process.argv[3] ?? 4);
const cases: Record<string, (b: ReturnType<typeof bs>) => void> = {
  "обычная": () => {},
  "растянута 40": (b) => (b.heroine.body.vagina = { stretch: 40, peak: 40 }),
  "растянута 70": (b) => (b.heroine.body.vagina = { stretch: 70, peak: 70 }),
  "растянута 100": (b) => (b.heroine.body.vagina = { stretch: 100, peak: 100 }),
  "100, холодная": (b) => { b.heroine.body.vagina = { stretch: 100, peak: 100 }; b.heroine.marriage.desire = 30; b.heroine.traits.confidence = 70; },
  "100, любит": (b) => { b.heroine.body.vagina = { stretch: 100, peak: 100 }; b.heroine.marriage.desire = 90; },
};
for (const [name, tune] of Object.entries(cases)) {
  const out: Record<string, number> = {};
  const lines: Record<string, number> = {};
  let nights = 0;
  let refusals = 0;
  const why: Record<string, number> = {};
  for (let seed = 1; seed <= seeds; seed++) {
    const engine = createEngine([baseMod]);
    let s = structuredClone(engine.init(seed));
    tune(bs(s));
    const rng = makeRng({ rng: seed * 77 });
    let guard = 0;
    let mark = 0;
    const counted = new Set<string>();
    const seenP = new Set<string>();
    while (s.time.day <= days && guard++ < 40000) {
      const acts = engine.listActions(s);
      if (!acts.length) break;
      const before = bs(s).night?.scene;
      const day = s.time.day;
      s = structuredClone(engine.dispatch(s, lovingStrategy(acts, s, rng.float)));
      tune(bs(s)); // hold her where the case puts her
      for (const e of s.log) {
        const id = `${e.turn}:${e.key}`;
        if (e.turn < mark || counted.has(id)) continue;
        counted.add(id);
        const k = /^log\.(bed|husband|night\.counter)\./.test(e.key) ? e.key.replace("log.", "") : null;
        if (k) lines[k] = (lines[k] ?? 0) + 1;
      }
      mark = s.turn - 1;
      const last = bs(s).proposals.at(-1);
      if (last && last.patron === "husband" && last.verdict === "refuse" && !seenP.has(`${last.day}`)) {
        seenP.add(`${last.day}`);
        refusals++;
        for (const r of last.rows) why[r.id.replace("consent.", "")] = (why[r.id.replace("consent.", "")] ?? 0) + r.value;
      }
      const sc = bs(s).night?.scene;
      if (sc && sc !== before) out[sc] = (out[sc] ?? 0) + 1;
      if (s.time.day !== day) nights++;
    }
  }
  console.log(name.padEnd(16), `ночей ${nights}`, JSON.stringify(out));
  console.log(" ".repeat(16), "отказы:", Object.entries(why).map(([k, v]) => `${k}:${(v / Math.max(1, refusals)).toFixed(1)}`).join(" "));
  console.log(" ".repeat(16), JSON.stringify(lines));
}
