// day 21.11, Alexey 20:11: in the footjob it is her thighs and calves that come out big, like a man's
// (hbody3 carries "thick thighs, large frame" and it leaks onto her legs). foot4 = foot3 without those words.
import { readFileSync, writeFileSync } from "node:fs";
const f = "tools/prompt-lab/synth.yaml";
let s = readFileSync(f, "utf8");
if (s.includes("- id: foot4")) { console.log("already patched"); process.exit(0); }
const a = s.indexOf("      - id: foot3");
const b = s.indexOf("      - id: handjob2");
if (a < 0 || b < a) throw new Error("no foot3 block");
let blk = s.slice(a, b);
const rep = (x, y) => { if (!blk.includes(x)) throw new Error("no: " + x.slice(0, 50)); blk = blk.replace(x, y); };
rep("- id: foot3", "- id: foot4");
blk = blk.replace(/title: ".*"/, 'title: "ЕГО нога 4: тонкие женские ноги, без толстых бёдер и икр"');
rep("(small feet:1.2), feet, slender legs,", "(small feet:1.2), feet, (slender legs:1.3), (thin legs:1.2), slim thighs, thin calves, smooth legs, feminine legs,");
rep("{hbody3}", "(faceless male:1.2), head out of frame, (mature male:1.3), adult, (pale-skinned male:1.4), (pale skin:1.3), white skin, average build");
rep('negative: "', 'negative: "(thick thighs:1.4), (muscular legs:1.4), thick calves, muscular calves, large legs, leg hair, hairy legs, male legs, (muscular female:1.3), ');
s = s.slice(0, b) + blk + s.slice(b);
writeFileSync(f, s);
console.log("patched");
