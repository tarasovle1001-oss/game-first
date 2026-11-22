// How much of what the game shows does a pack cover? Bots play, every picture on screen is looked up in the list of
// the pack's files (one name or path per line) the way the UI does it. Prints exact / fallback / nothing, by kind and by scene.
// pnpm exec tsx tools/pack-cover.ts files.txt [days=14] [seeds=4] [preset=all] [out.json]
import { readFileSync, writeFileSync } from "node:fs";
import { actById, baseMod, bs, content, findPicture, packIndex, packLayout, pictureFrames, pictureScene, resolveFrames } from "../packages/base/src";
import { createEngine, sceneFileName, sceneKey, sceneKeyFallbacks } from "../packages/core/src";
import { PICTURE_TAGS } from "../packages/base/src";
import type { SceneDesc } from "../packages/core/src";
import type { Hit } from "../packages/base/src";
import { awayStrategy, lovingStrategy, ownerStrategy, snoopStrategy } from "../packages/bots/src";

const [list, days = "14", seeds = "4", only = "all", out] = process.argv.slice(2);
if (!list) throw new Error("usage: pack-cover.ts files.txt [days] [seeds] [preset] [out.json]");
const stems = readFileSync(list, "utf8").split(/\r?\n/).map((l) => l.trim().replace(/^﻿/, "").split(/[\\/]/).pop()!).filter((n) => n.includes("__")).map((n) => n.replace(/\.(png|jpe?g|webp|avif|gif)$/i, "").replace(/~\d+$/, ""));
const index = packIndex(stems);
const engine = createEngine([baseMod]);
const strategies = [awayStrategy, lovingStrategy, ownerStrategy, snoopStrategy];
type Row = { exact: number; near: number; none: number };
const by = new Map<string, Row>();
const tally = (name: string, what: keyof Row) => void ((by.get(name) ?? by.set(name, { exact: 0, near: 0, none: 0 }).get(name)!)[what] += 1);
const misses = new Map<string, number>();
const swaps = new Map<string, number>();
const look = (d: SceneDesc) => {
  // OLD=1: the lookup before 22.11 (the key with tags dropped from the end), to compare
  const old = () => { const have = new Set(stems); const keys = sceneKeyFallbacks(d, PICTURE_TAGS); const i = keys.findIndex((k) => have.has(sceneFileName(k))); return i < 0 ? null : { key: keys[i]!, exact: i === 0 }; };
  const hit = process.env.OLD ? old() : findPicture(index, d);
  const kind = d.type === "portrait" ? "portrait" : d.type.startsWith("insert_") ? "insert" : d.type.startsWith("detail_") ? "detail" : "full";
  tally(`kind:${kind}`, hit ? (hit.exact ? "exact" : "near") : "none");
  if (kind === "full") tally(d.type, hit ? (hit.exact ? "exact" : "near") : "none");
  if (!hit) misses.set(sceneKey(d), (misses.get(sceneKey(d)) ?? 0) + 1);
  else if (!hit.exact) swaps.set(`${sceneKey(d)}  ->  ${hit.key}`, (swaps.get(`${sceneKey(d)}  ->  ${hit.key}`) ?? 0) + 1);
  return hit;
};
let screens = 0;
const costs: number[] = [];
const note = (h: Hit) => {
  const d = h.desc;
  const kind = d.type === "portrait" ? "portrait" : d.type.startsWith("insert_") ? "insert" : d.type.startsWith("detail_") ? "detail" : "full";
  tally(`kind:${kind}`, h.exact ? "exact" : "near");
  if (!h.exact) swaps.set(`${h.cost.toFixed(1).padStart(5)}  ${sceneKey(d)}  ->  ${h.key}`, (swaps.get(`${h.cost.toFixed(1).padStart(5)}  ${sceneKey(d)}  ->  ${h.key}`) ?? 0) + 1);
};
const shown = { whole: 0, split: 0, mannequin: 0 };
for (const preset of content.presets.map((p) => p.id).filter((p) => only === "all" || p === only))
  for (let seed = 1; seed <= Number(seeds); seed++) {
    const play = strategies[seed % strategies.length]!;
    let s = engine.init(seed, { base: { preset } });
    while (s.time.day <= Number(days)) {
      s = engine.dispatch(s, play(engine.listActions(s), s, () => 0));
      const on = pictureScene(engine, s);
      if (!on) continue;
      // she is elsewhere: the screen shows where she is and what she is doing there (as panels/scene.tsx does)
      const enc = bs(s).encounter;
      const seen: SceneDesc = on.participants.some((p) => p.id === "wife") || s.time.phase === "summary" ? on : enc ? { type: actById(enc.act).scene, location: enc.loc, participants: [{ id: "wife", role: "wife" }, { id: enc.patron, role: "patron" }], tags: {} } : { type: "idle", location: s.where.wife ?? "", participants: [{ id: "wife", role: "wife" }], tags: {} };
      screens += 1;
      const frames = pictureFrames(s, seen);
      const got = process.env.OLD ? resolveFrames(frames, (d) => look(d)) : packLayout(index, frames);
      if (got && !process.env.OLD) for (const h of [got.main, ...got.inserts] as Hit[]) note(h);
      shown[!got ? "mannequin" : got.split ? "split" : "whole"] += 1;
      costs.push(got && !process.env.OLD ? (got.main as Hit).cost : -1);
    }
  }
const pct = (r: Row) => { const n = r.exact + r.near + r.none; return `exact ${((100 * r.exact) / n).toFixed(0)}%  near ${((100 * r.near) / n).toFixed(0)}%  none ${((100 * r.none) / n).toFixed(0)}%  (${n})`; };
console.log(`${index.size} scene kinds in the pack, ${stems.length} files; ${screens} screens: whole picture ${shown.whole}, portrait + close-ups ${shown.split}, mannequin ${shown.mannequin}`);
for (const [k, r] of by) if (k.startsWith("kind:")) console.log(k.padEnd(16), pct(r));
const worst = [...by].filter(([k]) => !k.startsWith("kind:")).sort((a, b) => b[1].none - a[1].none).slice(0, 15);
console.log("scenes with no picture most often:");
for (const [k, r] of worst) if (r.none) console.log(" ", k.padEnd(28), pct(r));
const top = (m: Map<string, number>, n: number) => [...m].sort((a, b) => b[1] - a[1]).slice(0, n);
console.log("most frequent misses:");
for (const [k, n] of top(misses, 12)) console.log(String(n).padStart(6), k);
const cs = costs.filter((c) => c >= 0).sort((a, b) => a - b);
if (cs.length) console.log(`how far the main picture is from what was asked: exact ${cs.filter((c) => c === 0).length}, up to 3: ${cs.filter((c) => c > 0 && c <= 3).length}, up to 6: ${cs.filter((c) => c > 3 && c <= 6).length}, up to 9: ${cs.filter((c) => c > 6 && c <= 9).length}, further: ${cs.filter((c) => c > 9).length}`);
console.log("most frequent stand-ins:");
for (const [k, n] of top(swaps, 12)) console.log(String(n).padStart(6), k);
if (out) writeFileSync(out, JSON.stringify({ by: Object.fromEntries(by), misses: top(misses, 500), swaps: top(swaps, 500) }, null, 1));
