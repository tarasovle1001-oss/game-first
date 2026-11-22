// day 21.11: husband2 / hbody2 (the adult markers that won the age test: tall, broad shoulders / thick thighs, a little leg and arm hair)
// and *4 branches cloned from *3 with the new words
import { readFileSync, writeFileSync } from "node:fs";
const f = "tools/prompt-lab/synth.yaml";
let s = readFileSync(f, "utf8");
if (s.includes("id: prostate4")) { console.log("already patched"); process.exit(0); }
const nl = s.includes("\r\n") ? "\r\n" : "\n";
const ins = (anchor, text) => { const i = s.indexOf(anchor); if (i < 0) throw new Error("no anchor: " + anchor); s = s.slice(0, i) + text.replace(/\n/g, nl) + s.slice(i); };
const AGE = "(child:1.5), (shota:1.5), (teenage:1.4), (young:1.3), petite, short male, (slim:1.2), skinny, narrow shoulders, androgynous, otoko no ko, bishounen, small body, old man, elderly, wrinkles, grey hair, obese";
ins('  hpenis: "', `  # day 21.11: the age test (fd_behind k10) - a little leg / arm hair plus height reads as an adult; smooth bodies did not
  husband2: "(mature male:1.3), adult, 35 years old, (stubble:1.3), facial hair, very short hair, tired eyes, (pale-skinned male:1.4), (pale skin:1.3), white skin, average build, broad shoulders, tall male, leg hair, arm hair, sparse chest hair"
  hbody2: "(faceless male:1.2), head out of frame, (mature male:1.3), adult, (pale-skinned male:1.4), (pale skin:1.3), white skin, average build, thick thighs, tall male, leg hair, hairy legs"
`);
ins('  patron: "pale-skinned male', `  husband2: "(dark-skinned male:1.4), (dark skin:1.4), brown skin, tan, interracial, (muscular male:1.3), abs, large penis, huge penis, ${AGE}"
  hbody2: "(dark-skinned male:1.4), (dark skin:1.4), brown skin, tan, interracial, (muscular male:1.3), abs, large penis, huge penis, wide hips, breasts, pussy, face, ${AGE}"
`);
const clone = (from, to, edit = (b) => b) => {
  const m0 = new RegExp(`      - id: ${from}\\r?\\n`).exec(s);
  if (!m0) throw new Error("no target: " + from);
  const a = m0.index;
  const rest = s.slice(a + 10);
  const m1 = /\r?\n( {6}- id: | {2}[a-z_0-9]+:| {4}[a-z_0-9]+:)/.exec(rest);
  const end = m1 ? a + 10 + m1.index : s.length;
  let b = s.slice(a, end);
  b = b.replace(`id: ${from}`, `id: ${to}`).replaceAll("{hbody}", "{hbody2}").replaceAll("{husband}", "{husband2}").replace(/count: \d+/, "count: 100").replace(/title: "([^"]*)"/, (_, t) => `title: "${t} (муж 2: взрослые признаки)"`);
  b = edit(b);
  s = s.slice(0, end) + "\n" + b + s.slice(end);
};
clone("prostate3", "prostate4");
clone("dildo3", "dildo4");
clone("fisting3", "fisting4", (b) => b.replace(/who: \[[^\n\r]*\]/, 'who: ["{h_povglove}", "1boy, solo focus, male focus, female pov, pov hands, {hand}, (elbow gloves:1.3), black latex gloves, slender arm", "{h_glove}"]'));
clone("spank3", "spank4");
clone("ruined3", "ruined4");
clone("husband69c", "husband69d");
writeFileSync(f, s);
console.log("patched");
