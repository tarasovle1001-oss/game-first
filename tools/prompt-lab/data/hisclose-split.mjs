// night 22.11 05:15: tc_hisclose was trained on close-ups. On the full scenes (by_hand, chastity, edging, footjob, ...) it greys the frame
// and loses the husband, on the detail inserts it works. So: the LoRA stays on detail_* rows only, the scene rows go to a plan drawn without it.
import fs from "node:fs";
const dir = "tools/prompt-lab/data/pack/passes/";
const scenes = [], seen = new Set();
for (const f of fs.readdirSync(dir).filter((x) => /^pass\d+_hisclose\.json$/.test(x))) {
  const src = JSON.parse(fs.readFileSync(dir + f, "utf8"));
  const keep = src.plan.filter((r) => /^detail_/.test(r.layout));
  for (const r of src.plan.filter((r) => !/^detail_/.test(r.layout))) if (!seen.has(r.key + "|" + r.file)) { seen.add(r.key + "|" + r.file); scenes.push(r); }
  fs.writeFileSync(dir + f, JSON.stringify({ ...src, plan: keep }, null, 1));
  console.log(f, "kept", keep.length, "of", src.plan.length);
}
fs.writeFileSync(dir + "hisclose_scenes.json", JSON.stringify({ plan: scenes, base: [] }, null, 1));
console.log("scenes", scenes.length, [...new Set(scenes.map((r) => r.layout))].join(" "));
