// day 21.11, Alexey 18:03: avoid the glove where possible (a LoRA would learn it). Bare-hand branches for the collection round.
import { readFileSync, writeFileSync } from "node:fs";
const f = "tools/prompt-lab/synth.yaml";
let s = readFileSync(f, "utf8");
if (s.includes("id: prostate7")) { console.log("already patched"); process.exit(0); }
const axis = (b, name, val) => { if (!new RegExp(`${name}: \\[`).test(b)) throw new Error("no axis " + name); return b.replace(new RegExp(`(${name}: )(\\[[^\\n\\r]*\\])`), (_, a) => a + JSON.stringify(val)); };
const clone = (from, to, title, n, edit) => {
  const m0 = new RegExp(`      - id: ${from}\\r?\\n`).exec(s);
  if (!m0) throw new Error("no target: " + from);
  const a = m0.index;
  const m1 = /\r?\n( {6}- id: | {2}- id: | {2}[a-z_0-9]+:| {4}[a-z_0-9]+:|#)/.exec(s.slice(a + 10));
  const end = m1 ? a + 10 + m1.index : s.length;
  const b = s.slice(a, end).replace(`id: ${from}`, `id: ${to}`).replace(/count: \d+/, `count: ${n}`).replace(/title: "[^"]*"/, `title: "${title}"`);
  s = s.slice(0, end) + "\n" + edit(b) + s.slice(end);
};
const NOGLOVE = (b) => b.replace(/negative: "/, 'negative: "gloves, black gloves, latex gloves, elbow gloves, ');
clone("prostate6", "prostate7", "Простата 7: голая рука (без перчатки)", 300, (b) => NOGLOVE(axis(b, "who", ["{h_pov}", "{h_slim}", "{h_pale}"])));
clone("dildo6", "dildo7", "Дилдо в нём 7: голая рука или игрушка без руки", 300, (b) => NOGLOVE(axis(b, "who", ["{h_pov}", "{h_pale}", "1boy, solo, male focus"])));
clone("ruined6", "ruined7", "Впустую 7: голая рука, её глазами", 300, (b) => NOGLOVE(axis(b, "who", ["{h_pov}", "{h_pale}"])));
clone("handjob2", "handjob3", "Её рука на члене 3: голая рука", 300, (b) => NOGLOVE(axis(b, "who", ["{h_pov}", "{h_pale}"])));
writeFileSync(f, s);
console.log("patched");
