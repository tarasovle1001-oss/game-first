// lists the weak keys of the probe (best take 0-1 of 4) with Alexey's notes and his review of the night run 20.11
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
const data = "tools/prompt-lab/data", night = "tools/prompt-lab/night";
const review = existsSync(join(night, "review.json")) ? JSON.parse(readFileSync(join(night, "review.json"), "utf8")) : {};
const picks = existsSync(join(night, "picks.json")) ? JSON.parse(readFileSync(join(night, "picks.json"), "utf8")) : {};
const good = (t) => (t.marks ?? []).filter((m) => m === "ok").length;
const lines = [];
lines.push("REVIEW SAMPLE " + JSON.stringify(Object.entries(review).slice(0, 2)).slice(0, 500));
lines.push("PICKS SAMPLE " + JSON.stringify(Object.entries(picks).slice(0, 2)).slice(0, 500));
for (const id of readdirSync(data)) {
  const f = join(data, id, "state.json");
  if (!existsSync(f)) continue;
  const s = JSON.parse(readFileSync(f, "utf8"));
  const takes = (s.takes ?? []).filter((t) => (t.marks ?? []).some((m) => m));
  if (!takes.length) continue;
  const best = takes.reduce((a, t) => (good(t) > good(a) ? t : a), takes[0]);
  if (good(best) > 1) continue;
  const rv = Object.entries(review).filter(([k]) => k === id || k.startsWith(id + "/") || k.startsWith(id + ":") || k.startsWith(id + "|")).map(([k, v]) => `${k.slice(id.length)}=${typeof v === "string" ? v : JSON.stringify(v)}`).join(" ; ");
  lines.push(`${id} [${good(best)}] | ${String(best.tags ?? "").slice(0, 200)} | NOTE ${(s.note ?? "").slice(0, 140)} | PICK ${JSON.stringify(picks[id] ?? "").slice(0, 160)} | REVIEW ${rv.slice(0, 400)}`);
}
writeFileSync(join(data, "weak.txt"), lines.join("\n"), "utf8");
console.log(lines.length - 2, "weak keys");
