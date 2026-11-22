// night 22.11 05:50: the scenes2 fix (frontal body tags out, side view pushed) applied to strap-on and spanking keys.
import fs from "node:fs";
const dir = "tools/prompt-lab/data/pack/";
const B = "slender, medium breasts, (narrow waist:1.2), (wide hips:1.1), (ass visible through thighs:1.2), thigh gap, toned";
const S = "slender, medium breasts, narrow waist, toned";
const src = JSON.parse(fs.readFileSync(dir + "passes/femdomB.json", "utf8")).plan;
const plan = src.map((r) => ({
  ...r,
  positive: r.positive.replaceAll(B, S).replace("(hip bones:1.2), groin, navel, ", "").replace("from side", "(from side:1.3), profile, (2people:1.1), full body")
    .replace("girl kneeling behind him", "(girl kneeling behind him:1.2), girl behind boy, hip thrust").replace("hand raised", "hand raised, (girl beside him:1.1), hand on another's ass"),
  negative: "(standing:1.3), facing viewer, looking at viewer, straight-on, solo, cowboy shot, " + (r.negative ?? ""),
}));
fs.writeFileSync(dir + "figtest/femdomB2.json", JSON.stringify({ plan, base: [] }));
console.log(plan.length, plan[0].positive.slice(0, 420));
