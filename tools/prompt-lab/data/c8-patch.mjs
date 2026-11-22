// day 21.11: the middle targets of his_close get the adult-by-frame husband (hbody3): cage2, soft2, cum_pants2, mouth2, foot2, body2
import { readFileSync, writeFileSync } from "node:fs";
const f = "tools/prompt-lab/synth.yaml";
let s = readFileSync(f, "utf8");
if (s.includes("id: cage2")) { console.log("already patched"); process.exit(0); }
const clone = (from, to) => {
  const m0 = new RegExp(`      - id: ${from}\\r?\\n`).exec(s);
  if (!m0) throw new Error("no target: " + from);
  const a = m0.index;
  const m1 = /\r?\n( {6}- id: | {2}- id: | {2}[a-z_0-9]+:| {4}[a-z_0-9]+:|#)/.exec(s.slice(a + 10));
  const end = m1 ? a + 10 + m1.index : s.length;
  const b = s.slice(a, end).replace(`id: ${from}`, `id: ${to}`).replaceAll("{husband}", "{hbody3}").replaceAll("{hbody}", "{hbody3}").replace(/count: \d+/, "count: 100").replace(/title: "([^"]*)"/, (_, t) => `title: "${t} (РјСѓР¶ 3)"`);
  s = s.slice(0, end) + "\n" + b + s.slice(end);
  console.log(to, /\{hbody3\}/.test(b) ? "hbody3" : "NO HUSBAND WORD");
};
for (const t of ["cage", "soft", "cum_pants", "mouth", "foot", "body"]) clone(t, t + "2");
writeFileSync(f, s);
console.log("patched");
