// night 22.11 07:50: "patron alone" inserts (insert_patron_*) - the tagger sweep shows a second figure in ~60% of them (the prompt says 1boy but not solo).
// Fix in every pass plan: solo + solo focus, a woman / second man / hug into the negative. All fixed rows also go to figtest/insert_fix.json:
// after the defective frames are moved out (pack-scan-act.mjs --extra) comfy-run redraws only the missing files.
import fs from "node:fs";
const dir = "tools/prompt-lab/data/pack/";
const all = [];
for (const f of fs.readdirSync(dir + "passes").filter((x) => /^pass\d+_none\.json$/.test(x))) {
  const src = JSON.parse(fs.readFileSync(dir + "passes/" + f, "utf8"));
  let n = 0;
  for (const r of src.plan) if (/^insert_patron_/.test(r.layout)) {
    if (!r.positive.includes("(solo focus:1.2)")) {
      r.positive = r.positive.replace("1boy,", "1boy, solo, (solo focus:1.2), male focus,");
      r.negative = "(1girl:1.4), woman, female, (2boys:1.3), multiple boys, another person, couple, hug, kiss, " + (r.negative ?? "");
      n++;
    }
    all.push(r);
  }
  fs.writeFileSync(dir + "passes/" + f, JSON.stringify(src));
  console.log(f, "fixed", n);
}
fs.writeFileSync(dir + "figtest/insert_fix.json", JSON.stringify({ plan: all, base: [] }));
console.log("insert rows", all.length);
