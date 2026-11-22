// night 22.11 06:02: control for a concept LoRA on pack keys: node grp-ctl.mjs <group> - one key per layout (up to 10) from pass01_<group>.json.
// Drawn without the LoRA and with the 1000-step checkpoint at 0.6, same seeds as the pack (which uses the final file at 0.4).
import fs from "node:fs";
const g = process.argv[2], dir = "tools/prompt-lab/data/pack/";
const src = JSON.parse(fs.readFileSync(dir + `passes/pass01_${g}.json`, "utf8")).plan;
const seen = new Set(), plan = [];
for (const r of src) if (!seen.has(r.layout) && plan.length < 10) { seen.add(r.layout); plan.push(r); }
fs.writeFileSync(dir + `figtest/ctl_${g}.json`, JSON.stringify({ plan, base: [] }));
fs.writeFileSync(dir + `figtest/ctl_${g}.txt`, plan.map((r) => r.file ?? r.key).join("\n"));
console.log(plan.length, plan.map((r) => r.layout).join(" "), "\n", plan[0].positive.slice(0, 600));
