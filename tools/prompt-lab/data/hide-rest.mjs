// day 21.11: hides (pre: drop, files stay) the frames Alexey should not be shown yet: unviewed tails of rounds and old branches.
// node tools/prompt-lab/data/hide-rest.mjs   (rules below: concept, round, from, to)
import { readFileSync } from "node:fs";
const RULES = [
  ["his_close", 4, 0, 9999], ["his_close", 8, 0, 9999], ["his_close", 10, 0, 9999], ["his_close", 14, 28, 9999], ["his_close", 18, 28, 9999],
  ["fd_behind", 3, 0, 9999], ["fd_behind", 4, 0, 9999], ["fd_behind", 6, 0, 9999], ["fd_behind", 11, 0, 9999], ["fd_behind", 13, 0, 9999], ["fd_behind", 15, 0, 9999], ["fd_behind", 18, 0, 399],
  ["sixty_nine", 3, 0, 9999], ["sixty_nine", 5, 0, 9999],
];
for (const [c, k, a, b] of RULES) {
  const j = JSON.parse(readFileSync(`tools/prompt-lab/data/synth/${c}/k${k}.json`, "utf8"));
  const frames = j.frames.filter((f) => f.i >= a && f.i <= b && !f.mark && !f.pre).map((f) => f.i);
  if (!frames.length) { console.log(c, k, 0); continue; }
  const r = await fetch("http://127.0.0.1:8195/api/synth/mark", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ concept: c, round: k, frames, pre: true }) });
  console.log(c, k, frames.length, r.status);
}
