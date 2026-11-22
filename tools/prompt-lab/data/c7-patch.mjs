// day 21.11, after branches 5: hbody3 is clean by age; kneeling / all-fours views and bare hands are what breaks. Branches 6.
import { readFileSync, writeFileSync } from "node:fs";
const f = "tools/prompt-lab/synth.yaml";
let s = readFileSync(f, "utf8");
if (s.includes("id: prostate6")) { console.log("already patched"); process.exit(0); }
const axis = (b, name, keep) => b.replace(new RegExp(`(${name}: )(\\[[^\\n\\r]*\\])`), (_, a, arr) => a + JSON.stringify(keep(JSON.parse(arr))));
const clone = (from, to, title, edit = (b) => b) => {
  const m0 = new RegExp(`      - id: ${from}\\r?\\n`).exec(s);
  if (!m0) throw new Error("no target: " + from);
  const a = m0.index;
  const m1 = /\r?\n( {6}- id: | {2}[a-z_0-9]+:| {4}[a-z_0-9]+:)/.exec(s.slice(a + 10));
  const end = m1 ? a + 10 + m1.index : s.length;
  const b = s.slice(a, end).replace(`id: ${from}`, `id: ${to}`).replace(/count: \d+/, "count: 100").replace(/title: "[^"]*"/, `title: "${title}"`);
  s = s.slice(0, end) + "\n" + edit(b) + s.slice(end);
};
clone("prostate5", "prostate6", "Простата 6: муж 3, только перчатки, лёжа", (b) => axis(b, "who", () => ["{h_glove}", "{h_povglove}"]));
clone("dildo5", "dildo6", "Дилдо в нём 6: муж 3, только лёжа", (b) => axis(b, "view", (v) => v.filter((x) => !/all fours/.test(x))));
clone("ruined5", "ruined6", "Впустую 6: муж 3, только лёжа, вид её глазами", (b) => axis(axis(b, "view", (v) => v.filter((x) => !/kneeling/.test(x))), "who", () => ["{h_pov}", "{h_povglove}"]));
clone("spank3", "spank6", "Шлепки 6: как ветка 3 + возраст словами, шлёпают только его", (b) => b.replace("{husband}", "{husband}, adult, 35 years old").replace(/negative: "/, 'negative: "female spanked, spanked girl, (nude female:1.2), (child:1.5), (shota:1.5), (teenage:1.4), (young:1.3), petite, short male, small body, '));
writeFileSync(f, s);
console.log("patched");
