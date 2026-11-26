// Picture coverage, data for the page (27.11): every scene of the game with the keys the bots asked for (docs/pics/plan.json),
// the scenes they never reached, the values each picture tag can take, and what is already drawn (docs/pics/pack-keys.json).
// What a pack must cover is set on the page (docs/pics/coverage.json) and counted by tools/coverage/cover.mjs.
//   pnpm coverage:build   -> tools/coverage/data.json      then  pnpm coverage   (page on http://127.0.0.1:8234/)
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { content } from "../../packages/base/src";

type PlanRow = { key: string; n: number; like?: string };
const plan = JSON.parse(readFileSync("docs/pics/plan.json", "utf8")) as { plan: PlanRow[]; portrait: PlanRow[]; detail: PlanRow[]; unreached: string[] };
const drawn = existsSync("docs/pics/pack-keys.json") ? (JSON.parse(readFileSync("docs/pics/pack-keys.json", "utf8")) as { pack26?: Record<string, number>; older?: Record<string, number> }) : {};
const c = content as unknown as {
  scenes: { id: string; figures: { role: string }[] }[];
  outfits: { id: string; order: number }[];
  look: { words: { mood: { when: string }[]; outfit: Record<string, unknown> } };
  rooms: { id: string }[];
  locales: { ru: Record<string, string> };
};
const ru = c.locales.ru;
const title = (type: string) => (type.startsWith("detail_") ? `Вставка: ${type.slice(7).replace(/_/g, " ")}` : type === "portrait" ? "Портрет" : (ru[`scene.${type}`] ?? ru[`scene.${type}#1`] ?? type));

type Scene = { id: string; title: string; kind: "full" | "portrait" | "detail"; roles: string[]; keys: [string, number][]; reached: boolean };
const scenes = new Map<string, Scene>();
const add = (kind: Scene["kind"], r: PlanRow) => {
  const [id, roles = ""] = r.key.split("/");
  const s = scenes.get(id!) ?? { id: id!, title: title(id!), kind, roles: roles.split("+").filter(Boolean), keys: [], reached: true };
  s.keys.push([r.key, r.n]);
  if (r.like) s.reached = false;
  scenes.set(id!, s);
};
for (const r of plan.plan) add("full", r);
for (const r of plan.portrait) add("portrait", r);
for (const r of plan.detail) add("detail", r);
for (const l of c.scenes)
  if (!scenes.has(l.id)) scenes.set(l.id, { id: l.id, title: title(l.id), kind: "full", roles: [...new Set(l.figures.map((f) => f.role))].sort(), keys: [], reached: false });

const data = {
  made: new Date().toISOString(),
  rooms: c.rooms.map((r) => r.id),
  faces: c.look.words.mood.map((m) => m.when),
  outfits: Object.keys(c.look.words.outfit),
  workOutfits: [...c.outfits].sort((a, b) => a.order - b.order).map((o) => o.id),
  scenes: [...scenes.values()].sort((a, b) => a.id.localeCompare(b.id)),
  pack26: drawn.pack26 ?? {},
  older: drawn.older ?? {},
};
writeFileSync("tools/coverage/data.json", JSON.stringify(data));
console.log(`${data.scenes.length} scenes (${data.scenes.filter((s) => !s.keys.length).length} with no bot key), pack26 ${Object.keys(data.pack26).length} keys, older ${Object.keys(data.older).length} -> tools/coverage/data.json`);
