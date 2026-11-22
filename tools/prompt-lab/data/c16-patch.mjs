// day 21.11, Alexey 19:59: the penis is often too dark; her feet in the footjob are often huge.
import { readFileSync, writeFileSync } from "node:fs";
const f = "tools/prompt-lab/synth.yaml";
let s = readFileSync(f, "utf8");
if (s.includes("pink glans")) { console.log("already patched"); process.exit(0); }
const rep = (a, b) => { if (!s.includes(a)) throw new Error("no: " + a.slice(0, 60)); s = s.replace(a, b); };
rep('  hpenis: "(small penis:1.3), foreskin"', '  hpenis: "(small penis:1.3), foreskin, (pale penis:1.3), pink glans"');
rep('  patron: "pale-skinned male, small penis"', '  hpenis: "(dark penis:1.4), brown penis, dark glans, veiny penis, (large penis:1.3), dark-skinned male"\n  patron: "pale-skinned male, small penis"');
rep('feet, legs, barefoot, black toenails, girl out of frame, female legs only', '(small feet:1.2), feet, slender legs, barefoot, black toenails, girl out of frame, female legs only');
rep('(futanari:1.5), penis on female, newhalf, girl with penis, female crotch', '(large feet:1.4), big feet, long feet, long toes, (futanari:1.5), penis on female, newhalf, girl with penis, female crotch');
writeFileSync(f, s);
console.log("patched");
