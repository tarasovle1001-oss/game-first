// Probe plan: every scene layout and every free close-up once, in one neutral state, to see what the flow draws well
// before any variants are made. Scenes go in the room bots see them in most (or a default room), close-ups in the
// neutral middle of their tags (size 2 where a man's size shows, nothing else). Same row format as pack-plan, plus `size`.
// pnpm exec tsx tools/probe-plan.ts [out=probe-plan.json] [cast=default] [days=30] [seeds=4]
import { readFileSync, writeFileSync } from "node:fs";
import { baseMod, content, pictureScene, promptFor } from "../packages/base/src";
import { createEngine } from "../packages/core/src";
import type { SceneDesc } from "../packages/core/src";
import { awayStrategy, lovingStrategy, ownerStrategy, snoopStrategy } from "../packages/bots/src";

const [out = "probe-plan.json", cast = "default", days = "30", seeds = "4"] = process.argv.slice(2);
const SCENE = "832x1216";
const DETAIL = "1024x1024";

// where each layout is seen most, and how often (bots)
const engine = createEngine([baseMod]);
const seen = new Map<string, Map<string, number>>();
const strategies = [awayStrategy, lovingStrategy, ownerStrategy, snoopStrategy];
for (const preset of content.presets.map((p) => p.id))
  for (let seed = 1; seed <= Number(seeds); seed++) {
    const play = strategies[seed % strategies.length]!;
    let s = engine.init(seed, { base: { preset } });
    while (s.time.day <= Number(days)) {
      s = engine.dispatch(s, play(engine.listActions(s), s, () => 0));
      const d = pictureScene(engine, s);
      if (!d) continue;
      const m = seen.get(d.type) ?? new Map<string, number>();
      m.set(d.location, (m.get(d.location) ?? 0) + 1);
      seen.set(d.type, m);
    }
  }

const rows: Record<string, unknown>[] = [];
const push = (desc: SceneDesc, kind: "scene" | "detail", n: number) => {
  const p = promptFor(desc, cast);
  rows.push({ kind, key: p.key, file: p.file, n, layout: p.layout, location: desc.location, roles: desc.participants.map((x) => x.role), tags: desc.tags ?? {}, size: kind === "detail" ? DETAIL : SCENE, positive: p.positive, negative: p.negative, empty: p.empty });
};

for (const l of content.scenes) {
  const rooms = [...(seen.get(l.id) ?? new Map()).entries()].sort((a, b) => b[1] - a[1]);
  const roles = [...new Set(l.figures.map((f) => f.role))];
  const room = rooms[0]?.[0] ?? (roles.includes("husband") && !roles.some((r) => r.startsWith("patron")) ? "home.bedroom" : "cafe.hall");
  push({ type: l.id, location: room, participants: roles.map((r) => ({ id: r, role: r })), tags: {} }, "scene", rooms.reduce((a, r) => a + r[1], 0));
}

// close-ups: the list and who is in each from docs/INSERTS.md
const table = readFileSync("docs/INSERTS.md", "utf8").split("\n").filter((x) => /^\| `/.test(x));
for (const line of table) {
  const [, id, who, tags] = line.split("|").map((c) => c.trim().replace(/`/g, ""));
  const role = who!.split(/[ /]/)[0]!;
  const t: Record<string, string> = { ...(/\bsize\b/.test(tags!) ? { size: "2" } : {}), ...(/\btsize\b/.test(tags!) ? { tsize: "2" } : {}) };
  push({ type: `detail_${id}`, location: "any", participants: [{ id: role, role }], tags: t }, "detail", 0);
}

writeFileSync(out, JSON.stringify({ cast, kind: "probe", keys: rows.length, plan: rows, base: [] }, null, 1));
const sc = rows.filter((r) => r.kind === "scene");
const noWords = rows.filter((r) => (r.empty as string[]).length);
console.log(`${sc.length} scenes (${sc.filter((r) => (r.n as number) > 0).length} seen by bots) + ${rows.length - sc.length} close-ups -> ${out}`);
if (noWords.length) console.log(`with empty prompt slots: ${noWords.map((r) => r.layout).join(", ")}`);
