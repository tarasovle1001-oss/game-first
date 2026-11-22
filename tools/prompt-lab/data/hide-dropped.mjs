// day 21.11 evening: hides (pre: drop, files and marks stay) the frames Alexey already rejected (mark = drop),
// so that "ВСЁ ВМЕСТЕ" holds only his keeps and the new unreviewed frames.  node hide-dropped.mjs <concept>
import { readFileSync, readdirSync } from "node:fs";
const c = process.argv[2];
const dir = `tools/prompt-lab/data/synth/${c}`;
let total = 0;
for (const n of readdirSync(dir).filter((n) => /^k\d+\.json$/.test(n))) {
  const k = +n.slice(1, -5);
  const j = JSON.parse(readFileSync(`${dir}/${n}`, "utf8"));
  const frames = j.frames.map((f, i) => (f.mark === "drop" && !f.pre ? i : -1)).filter((i) => i >= 0);
  if (!frames.length) continue;
  const r = await fetch("http://127.0.0.1:8195/api/synth/mark", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ concept: c, round: k, frames, pre: true }) });
  console.log(c, k, frames.length, r.status);
  total += frames.length;
}
console.log("hidden", total);
