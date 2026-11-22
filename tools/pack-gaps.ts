// What the game asks for against what a pack has. Takes the plans (tools/pack-plan.ts, tools/probe-plan.ts) and the list
// of the pack's files; says for every asked key: exact, a stand-in (which, how far), or nothing.
// pnpm exec tsx tools/pack-gaps.ts files.txt plan.json [probe.json] [out.json] [todo.json]
// todo.json: a plan for tools/comfy-run.ts --plan with every asked key the pack has no exact picture for, most shown first
// (`why`: none / stand-in and what differs / rename = the pack has it under a name with tags the key no longer carries).
import { readFileSync, writeFileSync } from "node:fs";
import { findPicture, packIndex } from "../packages/base/src";
import type { SceneDesc } from "../packages/core/src";

const [list, planPath, probePath, out, todoPath] = process.argv.slice(2);
if (!list || !planPath) throw new Error("usage: pack-gaps.ts files.txt plan.json [probe.json] [out.json]");
const stems = readFileSync(list, "utf8").split(/\r?\n/).map((l) => l.trim().replace(/^﻿/, "").split(/[\\/]/).pop()!).filter((n) => n.includes("__")).map((n) => n.replace(/\.(png|jpe?g|webp)$/i, "").replace(/~\d+$/, ""));
const have = new Set(stems);
const index = packIndex(stems);
type Row = { kind: string; key: string; file: string; n: number; layout: string; location: string; roles: string[]; tags: Record<string, string> };
const plan = JSON.parse(readFileSync(planPath, "utf8"));
const rows: Row[] = [...plan.base, ...plan.plan.filter((r: Row) => !plan.base.some((b: Row) => b.key === r.key)), ...plan.portrait, ...plan.insert, ...plan.detail];
if (probePath) {
  const probe = JSON.parse(readFileSync(probePath, "utf8"));
  const known = new Set(rows.map((r) => r.key));
  for (const r of [...probe.base, ...probe.plan] as Row[]) if (!known.has(r.key)) rows.push({ ...r, n: 0 }), known.add(r.key);
}
const kindOf = (r: Row) => (r.key.startsWith("portrait/") ? "portrait" : r.key.startsWith("insert_") ? "insert" : r.key.startsWith("detail_") ? "detail" : "full");
const res = rows.map((r) => {
  const type = r.key.split("/")[0]!;
  const desc: SceneDesc = { type, location: r.location, participants: r.roles.map((role, i) => ({ id: `${role}${i}`, role })), tags: r.tags };
  const exact = have.has(r.file.replace(/\.png$/, ""));
  const near = exact ? null : findPicture(index, desc);
  return { kind: kindOf(r), type, key: r.key, n: r.n, state: exact ? "exact" : near ? "near" : "none", standIn: near?.key, cost: near ? Math.round(near.cost * 10) / 10 : undefined };
});
const sum = (xs: typeof res) => xs.reduce((a, r) => a + r.n, 0);
for (const kind of ["full", "portrait", "insert", "detail"]) {
  const k = res.filter((r) => r.kind === kind);
  const line = ["exact", "near", "none"].map((st) => { const x = k.filter((r) => r.state === st); return `${st} ${x.length} keys / ${((100 * sum(x)) / Math.max(1, sum(k))).toFixed(0)}% views`; });
  console.log(kind.padEnd(9), `${k.length} keys:`, line.join(" | "));
}
const byType = new Map<string, { exact: number; near: number; none: number; views: number; missViews: number }>();
for (const r of res) {
  const t = byType.get(r.type) ?? byType.set(r.type, { exact: 0, near: 0, none: 0, views: 0, missViews: 0 }).get(r.type)!;
  t[r.state as "exact"] += 1;
  t.views += r.n;
  if (r.state === "none") t.missViews += r.n;
}
console.log("\nscene kinds with nothing at all in the pack (keys, views):");
for (const [t, x] of [...byType].filter(([, x]) => x.none > 0).sort((a, b) => b[1].missViews - a[1].missViews)) console.log(`  ${t.padEnd(34)} none ${String(x.none).padStart(4)}  near ${String(x.near).padStart(4)}  exact ${String(x.exact).padStart(4)}  views ${x.missViews}`);
if (out) writeFileSync(out, JSON.stringify({ rows: res, byType: Object.fromEntries(byType) }, null, 1));
if (todoPath) {
  const UNSEEN = new Set(["size", "size2", "size3", "marks", "gape", "sore"]);
  const tagsOf = (key: string) => Object.fromEntries((key.split("/")[3] ?? "").split(",").filter(Boolean).map((kv) => kv.split("=") as [string, string]));
  const byKey = new Map(rows.map((r) => [r.key, r]));
  const todo = res
    .filter((r) => r.state !== "exact")
    // asked in play: she is in it (a room without her shows where she is instead), and a whole scene carries her look
    .filter((r) => r.kind === "detail" || (r.key.split("/")[1]!.split("+").includes("wife") && (r.kind !== "full" || r.key.split("/").length > 3)))
    .map((r) => {
      let why = "none";
      if (r.standIn) {
        const a = tagsOf(r.key);
        const b = tagsOf(r.standIn);
        const diff = [...new Set([...Object.keys(a), ...Object.keys(b)])].filter((k) => !UNSEEN.has(k) && a[k] !== b[k]);
        if (r.standIn.split("/")[2] !== r.key.split("/")[2] && r.key.split("/")[2] !== "any") diff.unshift("room");
        why = diff.length ? `stand-in: ${diff.sort().join("+")}` : "rename";
      }
      return { ...byKey.get(r.key)!, why, standIn: r.standIn };
    })
    .sort((x, y) => y.n - x.n);
  writeFileSync(todoPath, JSON.stringify({ plan: todo.filter((r) => r.why !== "rename"), rename: todo.filter((r) => r.why === "rename").map((r) => ({ key: r.key, file: r.file, from: r.standIn })), base: [] }));
  console.log(`\ntodo: ${todo.filter((r) => r.why !== "rename").length} keys to draw, ${todo.filter((r) => r.why === "rename").length} to rename -> ${todoPath}`);
}
