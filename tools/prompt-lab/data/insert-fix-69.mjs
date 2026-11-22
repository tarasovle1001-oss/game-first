// night 22.11 07:55: the same "patron alone" fix (see insert-fix.mjs) for insert_patron_sixty_nine, which sits in the sixtynine plans.
import fs from "node:fs";
const dir = "tools/prompt-lab/data/pack/";
const all = [];
for (const f of fs.readdirSync(dir + "passes").filter((x) => /^pass\d+_sixtynine\.json$/.test(x))) {
  const src = JSON.parse(fs.readFileSync(dir + "passes/" + f, "utf8"));
  for (const r of src.plan) if (/^insert_patron_/.test(r.layout)) {
    if (!r.positive.includes("(solo focus:1.2)")) {
      r.positive = r.positive.replace("1boy,", "1boy, solo, (solo focus:1.2), male focus,");
      r.negative = "(1girl:1.4), woman, female, (2boys:1.3), multiple boys, another person, couple, hug, kiss, " + (r.negative ?? "");
    }
    all.push(r);
  }
  fs.writeFileSync(dir + "passes/" + f, JSON.stringify(src));
}
fs.writeFileSync(dir + "figtest/insert_fix_69.json", JSON.stringify({ plan: all, base: [] }));
console.log("rows", all.length, all[0]?.positive.slice(0, 200));
