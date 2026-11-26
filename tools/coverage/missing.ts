// Picture coverage -> what to draw (27.11): every guarantee key the pack lacks (tools/coverage/cover.mjs, config docs/pics/coverage.json),
// as a picture key with the game's current words. Ignored tags come from the scene's most seen bot key in that background.
//   pnpm coverage:missing [scene,scene...]  ->  pics-context-cover.json (key -> { title, prompt, views: 0, fallback: true }), keys-cover.json
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { promptFor } from "../../packages/base/src";
import { sceneKey } from "../../packages/core/src";
import type { SceneDesc } from "../../packages/core/src";
// @ts-expect-error plain JS module shared with the page
import { defaultConfig, parseKey, ROOM_GROUPS, sceneStats } from "./cover.mjs";

const data = JSON.parse(readFileSync("tools/coverage/data.json", "utf8"));
const saved = existsSync("docs/pics/coverage.json") ? JSON.parse(readFileSync("docs/pics/coverage.json", "utf8")) : null;
const def = defaultConfig(data);
const cfg = saved ? { ...def, ...saved, frames: { ...def.frames, ...saved.frames }, axisDefaults: { ...def.axisDefaults, ...saved.axisDefaults }, scenes: saved.scenes ?? {} } : def;
const only = process.argv[2] ? new Set(process.argv[2].split(",")) : null;
const groupOf = (r: string) => cfg.roomGroups[r] ?? (ROOM_GROUPS as Record<string, string>)[r] ?? r;
const roomsOf = (g: string) => Object.entries(cfg.roomGroups as Record<string, string>).filter(([, x]) => x === g).map(([r]) => r);

const ru = data.scenes;
const context: Record<string, { title: string; prompt: string; views: number; fallback: true }> = {};
const keys: string[] = [];
let failed = 0;
for (const scene of data.scenes as { id: string; title: string; kind: string; roles: string[]; keys: [string, number][] }[]) {
  if (only && !only.has(scene.id)) continue;
  const t = sceneStats(scene, data, cfg);
  const bot = scene.keys.map(([k, n]) => ({ ...parseKey(k), n })).sort((a, b) => b.n - a.n);
  for (const combo of t.missing as Record<string, string>[]) {
    const g = combo.room;
    const tpl = bot.find((p) => !g || groupOf(p.room) === g) ?? bot[0];
    const room = scene.kind !== "full" ? (tpl?.room ?? "any") : (bot.find((p) => groupOf(p.room) === g)?.room ?? roomsOf(g)[0] ?? tpl?.room ?? "cafe.staff");
    const tags: Record<string, string> = { ...(tpl?.tags ?? {}) };
    for (const [a, v] of Object.entries(combo)) if (a !== "room") { if (v === "") delete tags[a]; else tags[a] = v; }
    // naked: nothing is "off" any more, it is all off
    if (tags.outfit === "naked") { tags.bare = "all"; delete tags.under; delete tags.skirt; }
    else if (tags.bare === "all" && combo.outfit) delete tags.bare;
    const desc: SceneDesc = { type: scene.id, location: room, participants: scene.roles.map((r) => ({ id: r === "wife" || r === "husband" ? r : `${r}1`, role: r })), tags };
    const key = sceneKey(desc);
    if (context[key]) continue;
    try { context[key] = { title: scene.title, prompt: promptFor(desc).positive, views: 0, fallback: true }; keys.push(key); } catch { failed += 1; }
  }
}
void ru;
writeFileSync("pics-context-cover.json", JSON.stringify(context));
writeFileSync("keys-cover.json", JSON.stringify(keys));
console.log(`${keys.length} keys to draw${failed ? `, ${failed} without words` : ""} -> pics-context-cover.json, keys-cover.json`);
