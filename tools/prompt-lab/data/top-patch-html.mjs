// day 21.11: "top" frames in /synth - Arrow Up (or T) marks a kept frame as one of the best; export can take only those.
// synth.ts part (Frame.top, mark {top}, export {top}) is in top-patch.mjs; this one does synth.html.
import { readFileSync, writeFileSync } from "node:fs";
const file = "tools/prompt-lab/synth.html";
let s = readFileSync(file, "utf8");
if (s.includes("f.top")) { console.log("already patched"); process.exit(0); }
const nl = s.includes("\r\n") ? "\r\n" : "\n";
const pairs = [
  ["#grid .keep{border-color:#3c3}", "#grid .keep{border-color:#3c3}#grid .top{border-color:#fc0;box-shadow:0 0 0 2px #fc0}"],
  ['<option value="keep">оставленные</option>', '<option value="keep">оставленные</option><option value="top">топ</option>'],
  ['<button id="export">Собрать датасет из оставленных</button>', '<button id="export">Собрать датасет из оставленных</button> <button id="exporttop">Только из топа</button>'],
  ['$("export").onclick = async () => {', '$("exporttop").onclick = async () => { const r = await J("/api/synth/export", { concept: $("concept").value, top: true }); say(`Датасет (топ): ${r.pictures} кадров в ${r.folder}`); };\n$("export").onclick = async () => {'],
  ['(show === "new" ? !f.mark : f.mark === show)', '(show === "new" ? !f.mark : show === "top" ? !!f.top : f.mark === show)'],
  ['d.className = f.mark ?? (f.pre ? "pre" : "");', 'd.className = (f.mark ?? (f.pre ? "pre" : "")) + (f.top ? " top" : "");'],
  ['${f.mark === "keep" ? "· ОСТАВЛЕН" :', '${f.top ? "· ТОП" : f.mark === "keep" ? "· ОСТАВЛЕН" :'],
  ['· оставлено ${R.frames.filter((f) => f.mark === "keep").length}', '· оставлено ${R.frames.filter((f) => f.mark === "keep").length} (топ ${R.frames.filter((f) => f.top).length})'],
  ['async function mark(m) {\n  const f = view[cur];\n  f.mark = m;\n  void J("/api/synth/mark", { concept: R.concept, round: R.round, i: f.i, mark: m })',
   'async function mark(m) {\n  const f = view[cur];\n  const top = m === "top";\n  f.mark = top ? "keep" : m;\n  if (top) f.top = true; else delete f.top;\n  void J("/api/synth/mark", top ? { concept: R.concept, round: R.round, i: f.i, top: true } : { concept: R.concept, round: R.round, i: f.i, mark: m })'],
  ['else if (["d", "D", "в", "В", "ArrowLeft"]', 'else if (["t", "T", "е", "Е", "ArrowUp"].includes(e.key)) { e.preventDefault(); void mark("top"); }\n  else if (["d", "D", "в", "В", "ArrowLeft"]'],
];
for (let [a, b] of pairs) { a = a.replaceAll("\n", nl); b = b.replaceAll("\n", nl); if (!s.includes(a)) throw new Error(`no "${a.slice(0, 70)}"`); s = s.replace(a, b); }
writeFileSync(file, s);
console.log("patched");
