// the export route sits behind the round lookup in synth.ts, so the page has to send a round with it
import { readFileSync, writeFileSync } from "node:fs";
const f = "tools/prompt-lab/synth.html";
let s = readFileSync(f, "utf8");
const a = 'J("/api/synth/export", { concept:';
console.log("occurrences", s.split(a).length - 1);
s = s.replaceAll(a, 'J("/api/synth/export", { round: 1, concept:');
writeFileSync(f, s);
