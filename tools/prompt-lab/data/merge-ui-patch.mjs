// day 21.11, Alexey 19:09: one merged view instead of rounds - "всё вместе" shows every frame left to look at in the concept,
// grouped by sub-scene; marks go to each frame's own round.
import { readFileSync, writeFileSync } from "node:fs";
const f = "tools/prompt-lab/synth.html";
let s = readFileSync(f, "utf8");
if (s.includes('value === "all"')) { console.log("already patched"); process.exit(0); }
const nl = s.includes("\r\n") ? "\r\n" : "\n";
const rep = (a, b, all) => { a = a.replaceAll("\n", nl); b = b.replaceAll("\n", nl); if (!s.includes(a)) throw new Error("no: " + a.slice(0, 70)); s = all ? s.replaceAll(a, b) : s.replace(a, b); };
rep('  if (keep && wasR && shown.some((r) => String(r.round) === String(wasR))) $("round").value = wasR; else if (shown.length) $("round").value = (shown.find((r) => r.left > 0) ?? shown.at(-1)).round;',
    '  const total = c.rounds.reduce((a, r) => a + r.left, 0);\n  $("round").prepend(new Option(`ВСЁ ВМЕСТЕ · смотреть ${total}`, "all"));\n  if (keep && wasR && (wasR === "all" || shown.some((r) => String(r.round) === String(wasR)))) $("round").value = wasR; else $("round").value = "all";');
rep('  R = await J(`/api/synth/round?c=${$("concept").value}&k=${$("round").value}`);',
    '  if ($("round").value === "all") {\n    const c = C(), order = c.targets.map((t) => t.id), frames = [];\n    for (const r of c.rounds.filter((r) => r.left > 0 || r.keep > 0)) { const x = await J(`/api/synth/round?c=${c.id}&k=${r.round}`); for (const fr of x.frames) { fr.k = r.round; frames.push(fr); } }\n    frames.sort((a, b) => order.indexOf(a.target) - order.indexOf(b.target) || a.k - b.k || a.i - b.i);\n    R = { concept: c.id, round: "all", status: "done", frames };\n    draw();\n    return;\n  }\n  R = await J(`/api/synth/round?c=${$("concept").value}&k=${$("round").value}`);');
rep('k=${R.round}&i=${f.i}', 'k=${f.k ?? R.round}&i=${f.i}', true);
rep('round: R.round, i: f.i', 'round: f.k ?? R.round, i: f.i', true);
rep('<small>${f.target}</small>', '<small>${titleOf(f.target).split(":")[0].split(" (")[0]}</small>');
writeFileSync(f, s);
console.log("patched");
