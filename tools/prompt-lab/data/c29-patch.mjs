// day 21.11 23:20, Alexey: in the x-ray anal frames (penis and toys) a uterus is often drawn. thru_anal2 / thru_toy_anal: uterus words in the negative, rectum in the prompt.
import { readFileSync, writeFileSync } from "node:fs";
const f = "tools/prompt-lab/synth.yaml";
let s = readFileSync(f, "utf8");
if (s.includes("- id: thru_anal2")) { console.log("already patched"); process.exit(0); }
const block = (id) => {
  const mm = new RegExp('      - id: ' + id + '\\r?\\n').exec(s); const a = mm ? mm.index : -1;
  if (a < 0) throw new Error("no " + id);
  const rest = s.slice(a + 10);
  const m = rest.search(/\n {6}- id: |\n {2}- id: /);
  return [a, m < 0 ? s.length : a + 10 + m + 1];
};
const NEG = "(uterus:1.5), (womb:1.4), cervix, ovaries, fallopian tubes, uterus outline, womb tattoo, pubic tattoo, ";
const [a1, b1] = block("thru_anal");
let an = s.slice(a1, b1).replace("- id: thru_anal", "- id: thru_anal2").replace(/title: ".*"/, 'title: "СКВОЗЬ ТЕЛО: анально 2 - без матки, прямая кишка"')
  .replace("(anal:1.3), penis in ass,", "(anal:1.3), penis in ass, (rectum:1.2), intestines,").replace('negative: "', `negative: "${NEG}`);
const [a2, b2] = block("thru_toy");
let ty = s.slice(a2, b2).replace("- id: thru_toy", "- id: thru_toy_anal").replace(/title: ".*"/, 'title: "СКВОЗЬ ТЕЛО: игрушка в попе - без матки"')
  .replace(/where: \[.*\]/, 'where: ["(anal object insertion:1.3), dildo in ass, (rectum:1.2)", "(anal object insertion:1.3), anal beads, (rectum:1.2)"]').replace('negative: "', `negative: "${NEG}vaginal object insertion, `);
if (!an.includes(NEG) || !ty.includes(NEG) || !an.includes("rectum") || !ty.includes("anal beads")) throw new Error("patch");
if (!an.endsWith("\n")) an += "\n";
if (!ty.endsWith("\n")) ty += "\n";
s = s.slice(0, b2) + (s.slice(0, b2).endsWith("\n") ? "" : "\n") + an + ty + s.slice(b2);
writeFileSync(f, s);
console.log("patched");
