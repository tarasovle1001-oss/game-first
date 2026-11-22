// day 21.11, Alexey 19:11: the "Цель" list showed all 30 branches, most of them empty. Now only sub-scenes with frames left, with counts.
import { readFileSync, writeFileSync } from "node:fs";
const f = "tools/prompt-lab/synth.html";
let s = readFileSync(f, "utf8");
if (s.includes("function fillTargets")) { console.log("already patched"); process.exit(0); }
const nl = s.includes("\r\n") ? "\r\n" : "\n";
const rep = (a, b, all) => { a = a.replaceAll("\n", nl); b = b.replaceAll("\n", nl); if (!s.includes(a)) throw new Error("no: " + a.slice(0, 70)); s = all ? s.replaceAll(a, b) : s.replace(a, b); };
rep('function draw() {\n  if (!R) return;',
    'function fillTargets() {\n  if (!R) return;\n  const was = $("target").value, n = {};\n  for (const fr of R.frames) if (fr.file && !fr.pre && !fr.mark) n[fr.target] = (n[fr.target] ?? 0) + 1;\n  const list = C().targets.filter((t) => n[t.id] || $("allrounds").checked);\n  $("target").replaceChildren(new Option(`все под-сцены · ${Object.values(n).reduce((a, b) => a + b, 0)}`, ""), ...list.map((t) => new Option(`${t.title.split(" (")[0]} · ${n[t.id] ?? 0}`, t.id)));\n  $("target").value = list.some((t) => t.id === was) ? was : "";\n}\nfunction draw() {\n  if (!R) return;');
rep('    R = { concept: c.id, round: "all", status: "done", frames };\n    draw();', '    R = { concept: c.id, round: "all", status: "done", frames };\n    fillTargets();\n    draw();');
rep('  R = await J(`/api/synth/round?c=${$("concept").value}&k=${$("round").value}`);\n  draw();', '  R = await J(`/api/synth/round?c=${$("concept").value}&k=${$("round").value}`);\n  fillTargets();\n  draw();');
writeFileSync(f, s);
console.log("patched");
