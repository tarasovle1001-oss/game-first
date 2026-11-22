// day 21.11 21:20: fd_behind k29 trial (first 48 each): fisting5 ~29% (works, glove), prostate8 ~17% (finger rarely reads, she grabs the penis),
// dildo8 ~4% (toys land on HER). Everywhere: abs on the husband and a dark body. New branches: prostate9, dildo9, fisting6.
import { readFileSync, writeFileSync } from "node:fs";
const f = "tools/prompt-lab/synth.yaml";
let s = readFileSync(f, "utf8");
if (s.includes("- id: prostate9")) { console.log("already patched"); process.exit(0); }
const block = (id) => {
  const a = s.indexOf(`      - id: ${id}\n`);
  if (a < 0) throw new Error("no " + id);
  const rest = s.slice(a + 10);
  const m = rest.search(/\n {6}- id: |\n {2}- id: /);
  return [a, a + 10 + m + 1];
};
const NEG = "(abs:1.4), (muscular male:1.4), six pack, bodybuilder, (dark skin:1.3), tan, pubic hair, ";
const mk = (id, nid, title, acts, negAdd, promptAdd) => {
  const [a, b] = block(id);
  let blk = s.slice(a, b);
  blk = blk.replace(`- id: ${id}`, `- id: ${nid}`).replace(/title: ".*"/, `title: "${title}"`).replace(/acts: \[.*\]/, `acts: [${acts.map((x) => JSON.stringify(x)).join(", ")}]`);
  blk = blk.replace('negative: "', `negative: "${NEG}${negAdd}`);
  if (promptAdd) blk = blk.replace("{act},", `{act}, ${promptAdd},`);
  if (!blk.includes(NEG)) throw new Error("neg " + id);
  return blk;
};
const p = mk("prostate8", "prostate9", "ПРОСТАТА 9: палец читается, без пресса и смуглого тела",
  ["(anal fingering:1.5), (finger in anus:1.3), fingering male, finger insertion", "(prostate milking:1.3), (anal fingering:1.4), finger in anus, lube", "(anal fingering:1.5), two fingers in anus, lube, spread anus"],
  "handjob, penis grab, testicle grab, ", "(male anus:1.2), hand between his legs");
const d = mk("dildo8", "dildo9", "ДИЛДО В НЁМ 9: игрушка в нём, не в ней; без пресса",
  ["(anal object insertion:1.4), (dildo in anus:1.3), male anal, holding dildo, pushing dildo", "(anal object insertion:1.4), (large dildo:1.2), dildo in male anus, holding dildo", "(anal object insertion:1.4), (vibrator:1.2), vibrator in anus, holding vibrator"],
  "female anal, butt plug, anal beads, object in female, anal tail, vaginal object insertion, ", "(male anus:1.2)");
const fi = mk("fisting5", "fisting6", "КУЛАК В НЁМ 6: как 5, без пресса и смуглого тела",
  ["(anal fisting:1.3), fisting, fist", "(anal fisting:1.3), fist, deep insertion, forearm", "(anal fisting:1.3), wrist deep, lube"], "", "");
const [, end] = block("fisting5");
s = s.slice(0, end) + p + d + fi + s.slice(end);
writeFileSync(f, s);
console.log("patched");
