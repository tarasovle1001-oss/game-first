// lists the "middle" keys of the probe: best take has 2 good pictures of 4 (and 3 of 4 with --three)
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
const data = "tools/prompt-lab/data";
const out = [];
let sample = null;
for (const id of readdirSync(data)) {
  const f = join(data, id, "state.json");
  if (!existsSync(f)) continue;
  const s = JSON.parse(readFileSync(f, "utf8"));
  const takes = (s.takes ?? []).filter((t) => (t.marks ?? []).some((m) => m != null && m !== ""));
  if (!takes.length) continue;
  if (!sample) sample = { id, marks: takes[0].marks, keys: Object.keys(takes[0]) };
  const good = (t) => (t.marks ?? []).filter((m) => m === "good" || m === 1 || m === "+" || m === true || m === "ok").length;
  const best = takes.reduce((a, t) => (good(t) > good(a) ? t : a), takes[0]);
  out.push({ id, best: good(best), n: (best.marks ?? []).length, takes: takes.length, tags: best.tags, note: s.note ?? "", marks: best.marks });
}
console.log("sample", JSON.stringify(sample));
const hist = {};
for (const o of out) hist[o.best] = (hist[o.best] ?? 0) + 1;
console.log("hist", JSON.stringify(hist), "keys", out.length);
const mid = out.filter((o) => o.best === 2);
writeFileSync(join(data, "medium.json"), JSON.stringify(mid, null, 1));
for (const o of mid) console.log(`${o.id} | ${String(o.tags ?? "").slice(0, 260)} | ${o.note.slice(0, 120)}`);
