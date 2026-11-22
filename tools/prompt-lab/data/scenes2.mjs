// night 22.11 05:45. Two things.
// 1) Figure: B reads too wide in the hips (figtest_ABEFS.jpg) -> E (B without "wide hips", waist weight off) in every plan file not drawn yet.
// 2) His scenes (handjob, edging, chastity, footjob, tease_denial ...): she turns into a frontal standing portrait and the action is lost.
//    Test S showed the frontal body tags pull that. Plan scenes2.json: same keys, frontal tags stripped, side view pushed. Drawn into figtest\scenes2.
import fs from "node:fs";
const dir = "tools/prompt-lab/data/pack/";
const B = "slender, medium breasts, (narrow waist:1.2), (wide hips:1.1), (ass visible through thighs:1.2), thigh gap, toned";
const E = "slender, medium breasts, narrow waist, (ass visible through thighs:1.2), thigh gap, toned";
const S = "slender, medium breasts, narrow waist, toned";
const drawn = (f) => /^pass0[123]_(none|hisclose|femdom)\.json$/.test(f);
let n = 0;
for (const f of fs.readdirSync(dir + "passes").filter((x) => /^pass\d+_\w+\.json$/.test(x) && !drawn(x))) {
  const t = fs.readFileSync(dir + "passes/" + f, "utf8");
  if (t.includes(B)) { fs.writeFileSync(dir + "passes/" + f, t.replaceAll(B, E)); n++; }
}
console.log("figure E written into", n, "plan files");
const src = JSON.parse(fs.readFileSync(dir + "passes/hisclose_scenes.json", "utf8")).plan;
const plan = src.map((r) => ({
  ...r,
  positive: r.positive.replace("tc_hisclose, ", "").replaceAll(B, S).replace("slim, slender body, medium breasts, (narrow waist:1.3), (ass visible through thighs:1.3)", S)
    .replace("(hip bones:1.2), groin, navel, ", "").replace("from side", "(from side:1.3), profile, (2people:1.1), full body").replace(", wet panties, (pussy juice:1.2)", ""),
  negative: "(standing:1.3), facing viewer, looking at viewer, straight-on, solo, cowboy shot, " + (r.negative ?? ""),
}));
fs.writeFileSync(dir + "figtest/scenes2.json", JSON.stringify({ plan, base: [] }));
console.log("scenes2", plan.length, "\n", plan.find((r) => r.layout === "handjob").positive.slice(0, 500));
