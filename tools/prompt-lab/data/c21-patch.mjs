// day 21.11 21:50: fd_behind k30: fisting6 works (26 of 96 clean), prostate9 and dildo9 failed - without the glove the act flips onto HER
// (woman with a penis, a dark male hand fingering her; toys in her). The glove ties the hand to her, so: prostate10 / dildo10 = fisting6 with other acts.
import { readFileSync, writeFileSync } from "node:fs";
const f = "tools/prompt-lab/synth.yaml";
let s = readFileSync(f, "utf8");
if (s.includes("- id: prostate10")) { console.log("already patched"); process.exit(0); }
const a = s.indexOf("      - id: fisting6\n");
if (a < 0) throw new Error("no fisting6");
const rest = s.slice(a + 10);
const b = a + 10 + rest.search(/\n {6}- id: |\n {2}- id: /) + 1;
const src = s.slice(a, b);
const mk = (nid, title, acts, negAdd) => {
  let blk = src.replace("- id: fisting6", `- id: ${nid}`).replace(/title: ".*"/, `title: "${title}"`).replace(/acts: \[.*\]/, `acts: [${acts.map((x) => JSON.stringify(x)).join(", ")}]`);
  blk = blk.replace('negative: "', `negative: "${negAdd}`);
  if (!blk.includes(negAdd) || !blk.includes(nid)) throw new Error("mk " + nid);
  return blk;
};
const p = mk("prostate10", "ПРОСТАТА 10: палец в перчатке (перчатка привязывает руку к ней)",
  ["(anal fingering:1.4), index finger, finger in anus, one finger", "(prostate milking:1.3), (anal fingering:1.3), finger in anus, lube", "(anal fingering:1.4), two fingers, fingers in anus, lube"],
  "(anal fisting:1.3), fist, penis on female, female anal, pussy, ");
const d = mk("dildo10", "ДИЛДО В НЁМ 10: игрушка в её руке в перчатке",
  ["(anal object insertion:1.4), (dildo:1.3), holding dildo, dildo in anus", "(anal object insertion:1.4), (large dildo:1.2), holding dildo, pushing dildo", "(anal object insertion:1.4), (vibrator:1.2), holding vibrator"],
  "(anal fisting:1.3), fist, female anal, butt plug, anal beads, anal tail, object in female, vaginal object insertion, pussy, ");
s = s.slice(0, b) + p + d + s.slice(b);
writeFileSync(f, s);
console.log("patched");
