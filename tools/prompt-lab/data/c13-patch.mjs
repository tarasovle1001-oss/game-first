// day 21.11, Alexey 18:47: "in the mouth" matters; the penis there comes out big and dark. mouth3 = mouth2 + small pale penis pushed, dark / large in the negative.
import { readFileSync, writeFileSync } from "node:fs";
const f = "tools/prompt-lab/synth.yaml";
let s = readFileSync(f, "utf8");
if (s.includes("id: mouth3")) { console.log("already patched"); process.exit(0); }
const m0 = /      - id: mouth2\r?\n/.exec(s);
if (!m0) throw new Error("no mouth2");
const a = m0.index;
const m1 = /\r?\n( {6}- id: | {2}- id: | {2}[a-z_0-9]+:| {4}[a-z_0-9]+:|#)/.exec(s.slice(a + 10));
const end = m1 ? a + 10 + m1.index : s.length;
let b = s.slice(a, end);
console.log(b.split(/\r?\n/).map((l) => l.slice(0, 230)).join("\n"));
b = b.replace("id: mouth2", "id: mouth3").replace(/count: \d+/, "count: 300").replace(/title: "[^"]*"/, 'title: "Во рту 3: маленький бледный член"');
if (!/prompt: "/.test(b)) throw new Error("no prompt line");
b = b.replace(/prompt: "([^"]*)"/, (_, p) => `prompt: "${p}, (small penis:1.5), (pale penis:1.3), (pale-skinned male:1.4), short penis, foreskin"`);
const NEG = "(large penis:1.5), (huge penis:1.5), long penis, (dark penis:1.5), (dark-skinned male:1.5), dark skin, tan, veiny penis, interracial, (2boys:1.4)";
b = /negative: "/.test(b) ? b.replace(/negative: "/, `negative: "${NEG}, `) : b.replace(/(\r?\n)( +)prompt: /, `$1$2negative: "${NEG}"$1$2prompt: `);
s = s.slice(0, end) + "\n" + b + s.slice(end);
writeFileSync(f, s);
console.log("patched");
