// Which pictures does the game actually ask for, and how often? Bots play, every picture key is counted -
// with her look baked in (face, marks, gape, what is off), the way the game looks the picture up.
// The result is the manifest of an image pack: key, file name, how often it is seen, cumulative coverage,
// the layout to draw it over and the prompt (shared + one per figure). Generate from the top, stop where coverage is enough.
// Also lists the general keys the game falls back to (scene/roles/room without tags, scene/*), so every scene has something.
// pnpm exec tsx tools/pack-plan.ts [days=30] [seeds=6] [out=pack-plan.json] [cast=default]
import { writeFileSync } from "node:fs";
import { actOf, baseMod, bs, content, pictureScene, promptFor, withLook } from "../packages/base/src";
import { createEngine, sceneKey } from "../packages/core/src";
import type { GameState, SceneDesc } from "../packages/core/src";
import { awayStrategy, lovingStrategy, ownerStrategy, snoopStrategy } from "../packages/bots/src";

const [days = "30", seeds = "6", out = "pack-plan.json", cast = "default"] = process.argv.slice(2);
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
  const act = b.encounter ? actOf(b.encounter!.act) : null;
  if (!b.encounter || !act) return null;
  return withLook(s, { type: act.scene, location: b.encounter.loc, participants: [{ id: "wife", role: "wife" }, { id: b.encounter.patron, role: "patron" }], tags: {} });
};
const strategies = [awayStrategy, lovingStrategy, ownerStrategy, snoopStrategy];
let step = 0;
const t0 = Date.now();
for (const preset of content.presets.map((p) => p.id))
  for (let seed = 1; seed <= Number(seeds); seed++) {
    const play = strategies[seed % strategies.length]!;
    let s = engine.init(seed, { base: { preset } });
    while (s.time.day <= Number(days)) {
      s = engine.dispatch(s, play(engine.listActions(s), s, () => 0));
      const seen = pictureScene(engine, s);
      count(seen);
      const real = truth(s);
      if (real && (!seen || sceneKey(real) !== sceneKey(seen))) count(real);
    }
    step += 1;
    process.stderr.write(`\rplaying ${step}/${content.presets.length * Number(seeds)} games, ${counts.size} keys, ${((Date.now() - t0) / 1000).toFixed(0)}s   `);
  }
process.stderr.write("\n");

// general keys the game falls back to when the exact picture is missing
const general = new Map<string, { n: number; desc: SceneDesc }>();
for (const { n, desc } of counts.values()) {
  const bare = { ...desc, tags: {} };
  const k = sceneKey(bare);
  const g = general.get(k);
  if (g) g.n += n;
  else general.set(k, { n, desc: bare });
}

const row = (desc: SceneDesc, n: number) => {
  const p = promptFor(desc, cast);
  return { key: p.key, file: p.file, n, layout: p.layout, location: desc.location, roles: desc.participants.map((x) => x.role), tags: desc.tags ?? {}, shared: p.shared, regions: p.regions, positive: p.positive, negative: p.negative, empty: p.empty };
};
const rows = [...counts.values()].map((v) => row(v.desc, v.n)).sort((a, b) => b.n - a.n);
const total = rows.reduce((a, r) => a + r.n, 0);
let run = 0;
const plan = rows.map((r) => ({ ...r, share: +(r.n / total).toFixed(5), coverage: +((run += r.n) / total).toFixed(5) }));
const base = [...general.values()].map((v) => row(v.desc, v.n)).sort((a, b) => b.n - a.n);
const emptySlots = [...new Set(plan.flatMap((r) => r.empty))].sort();
writeFileSync(out, JSON.stringify({ cast, days: Number(days), seeds: Number(seeds), keys: plan.length, total, emptySlots, base, plan }, null, 1));

const at = (c: number) => plan.findIndex((r) => r.coverage >= c) + 1;
console.log(`${plan.length} exact pictures over ${total} views. For 80% of views: ${at(0.8)}, 95%: ${at(0.95)}, 99%: ${at(0.99)}, 100%: ${plan.length}.`);
console.log(`general fallback pictures (scene/roles/room): ${base.length}`);
console.log(`layouts in use: ${new Set(plan.map((r) => r.layout)).size} of ${content.scenes.length}; slots of prompt.yaml still empty: ${emptySlots.length}`);
console.log(plan.slice(0, 10).map((r) => `${String(r.n).padStart(7)}  ${r.key}`).join("\n"));
console.log(`written to ${out}`);
