// night 22.11 05:05: after the checkpoint control - femdom keys are split by which LoRA file suits them.
//   hand in him (prostate, fisting) and solo toys -> tc_femdom-1000 at 0.6; strap-on and spanking -> final tc_femdom at 0.4
import fs from "node:fs";
const dir = "tools/prompt-lab/data/pack/passes/";
const src = JSON.parse(fs.readFileSync(dir + "pass01_femdom.json", "utf8"));
const rows = src.plan;
const isB = (r) => /pegging|spank_him/.test(r.layout);
const wrap = (part) => ({ ...src, plan: part });
fs.writeFileSync(dir + "femdomA.json", JSON.stringify(wrap(rows.filter((r) => !isB(r))), null, 1));
fs.writeFileSync(dir + "femdomB.json", JSON.stringify(wrap(rows.filter(isB)), null, 1));
console.log("shape", Array.isArray(src) ? "array" : Object.keys(src).join(","), "A", rows.filter((r) => !isB(r)).map((r) => r.layout).join(" "), "| B", rows.filter(isB).map((r) => r.layout).join(" "));

