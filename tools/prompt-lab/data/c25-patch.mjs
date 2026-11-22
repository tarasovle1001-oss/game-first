// day 21.11 22:50. Alexey's marks: fist 2 of 42, prostate 0 of 27 ("игра не знает как руку внутри нарисовать"), dildo solo is good.
// Stand-ins in the working solo composition (dildo11): prostate11 = a prostate massager / small vibrator in him; bigtoy1 = a huge toy, stretched (instead of the fist).
import { readFileSync, writeFileSync } from "node:fs";
const f = "tools/prompt-lab/synth.yaml";
let s = readFileSync(f, "utf8");
if (s.includes("- id: prostate11")) { console.log("already patched"); process.exit(0); }
const a = s.indexOf("      - id: dildo11\n");
if (a < 0) throw new Error("no dildo11");
const rest = s.slice(a + 10);
const b = a + 10 + rest.search(/\n {6}- id: |\n {2}- id: /) + 1;
const src = s.slice(a, b);
const mk = (nid, title, acts) => {
  let blk = src.replace("- id: dildo11", `- id: ${nid}`).replace(/title: ".*"/, `title: "${title}"`).replace(/acts: \[.*\]/, `acts: [${acts.map((x) => JSON.stringify(x)).join(", ")}]`);
  if (!blk.includes(nid) || !blk.includes(acts[0])) throw new Error("mk " + nid);
  return blk;
};
const p = mk("prostate11", "ПРОСТАТА 11: он один, в нём массажёр простаты / маленький вибратор",
  ["(anal object insertion:1.4), (prostate massager:1.3), sex toy, small toy in anus", "(anal object insertion:1.4), (vibrator:1.3), small vibrator in anus, remote control vibrator, wire", "(anal object insertion:1.4), (prostate massager:1.3), precum, dripping"]);
const g = mk("bigtoy1", "БОЛЬШАЯ ИГРУШКА 1 (вместо кулака): он один, огромный дилдо, растянуто",
  ["(anal object insertion:1.4), (huge dildo:1.4), (large insertion:1.3), stretched anus, gaping", "(anal object insertion:1.4), (huge dildo:1.3), thick dildo, deep insertion, stomach bulge", "(anal object insertion:1.4), (large butt plug:1.3), huge butt plug, stretched anus"]);
s = s.slice(0, b) + p + g + s.slice(b);
writeFileSync(f, s);
console.log("patched");
