// Which pictures does the game actually ask for, and how often? Bots play, every scene key is counted.
// The result is the shopping list for an image pack: generate from the top, stop where coverage is good enough.
// pnpm exec tsx tools/pack-plan.ts [days=30] [seeds=6] [out=pack-plan.json]
import { writeFileSync } from "node:fs";
import { baseMod, bs, content } from "../packages/base/src";
import { createEngine, sceneFileName, sceneKey } from "../packages/core/src";
import type { GameState, SceneDesc } from "../packages/core/src";
import { awayStrategy, lovingStrategy, ownerStrategy, snoopStrategy } from "../packages/bots/src";

const [days = "30", seeds = "6", out = "pack-plan.json"] = process.argv.slice(2);
const engine = createEngine([baseMod]);
const counts = new Map<string, { n: number; desc: SceneDesc }>();
const count = (desc: SceneDesc | null) => {
  if (!desc) return;
  const key = sceneKey(desc);
  const c = counts.get(key);
  if (c) c.n += 1;
  else counts.set(key, { n: 1, desc });
};
/** What is really going on with her, whether or not the husband sees it (the transparent mode shows these). */
const truth = (s: GameState): SceneDesc | null => {
  const b = bs(s);
  const act = b.encounter ? content.acts.find((a) => a.id === b.encounter!.act) : null;
  if (!b.encounter || !act) return null;
  return { type: act.scene, location: b.encounter.loc, participants: [{ id: "wife", role: "wife" }, { id: b.encounter.patron, role: "patron" }], tags: { outfit: b.heroine.outfit } };
};
const strategies = [awayStrategy, lovingStrategy, ownerStrategy, snoopStrategy];
for (const preset of content.presets.map((p) => p.id))
  for (let seed = 1; seed <= Number(seeds); seed++) {
    const play = strategies[seed % strategies.length]!;
    let s = engine.init(seed, { base: { preset } });
    while (s.time.day <= Number(days)) {
      s = engine.dispatch(s, play(engine.listActions(s), s, () => 0));
      count(engine.currentScene(s));
      count(truth(s));
    }
  }
const rows = [...counts.entries()].map(([key, v]) => ({ key, n: v.n, type: v.desc.type, location: v.desc.location, tags: v.desc.tags ?? {} })).sort((a, b) => b.n - a.n);
const total = rows.reduce((a, r) => a + r.n, 0);
let run = 0;
const plan = rows.map((r) => ({ ...r, file: `${sceneFileName(r.key)}.png`, share: +(r.n / total).toFixed(4), coverage: +((run += r.n) / total).toFixed(4) }));
writeFileSync(out, JSON.stringify({ days: Number(days), seeds: Number(seeds), keys: plan.length, total, plan }, null, 1));
const at = (c: number) => plan.findIndex((r) => r.coverage >= c) + 1;
console.log(`${plan.length} distinct pictures over ${total} views. For 80% of views: ${at(0.8)} pictures, 95%: ${at(0.95)}, 99%: ${at(0.99)}.`);
console.log(plan.slice(0, 12).map((r) => `${String(r.n).padStart(7)}  ${r.key}`).join("\n"));
console.log(`scene types in use: ${new Set(plan.map((r) => r.type)).size} of ${content.scenes.length}; plan written to ${out}`);
