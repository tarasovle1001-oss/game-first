// day 21.11: "top" frames in /synth - Arrow Up (or T) marks a kept frame as one of the best; export can take only those
import { readFileSync, writeFileSync } from "node:fs";
const rep = (file, pairs) => {
  let s = readFileSync(file, "utf8");
  if (s.includes("f.top")) { console.log(file, "already patched"); return; }
  const nl = s.includes("\r\n") ? "\r\n" : "\n";
  for (let [a, b] of pairs) { a = a.replaceAll("\n", nl); b = b.replaceAll("\n", nl); if (!s.includes(a)) throw new Error(`${file}: no "${a.slice(0, 60)}"`); s = s.replace(a, b); }
  writeFileSync(file, s);
  console.log(file, "patched");
};
rep("tools/prompt-lab/synth.ts", [
  ['mark?: "keep" | "drop"; pre?: "drop";', 'mark?: "keep" | "drop"; top?: boolean; pre?: "drop";'],
  ['if (b.mark !== undefined) { if (b.mark === "keep" || b.mark === "drop") f.mark = b.mark; else delete f.mark; }',
   'if (b.mark !== undefined) { if (b.mark === "keep" || b.mark === "drop") f.mark = b.mark; else delete f.mark; if (f.mark !== "keep") delete f.top; }\n        if (b.top !== undefined) { if (b.top) { f.top = true; f.mark = "keep"; } else delete f.top; }'],
  ['if (f.mark !== "keep" || !f.file) continue;\n        const name', 'if (f.mark !== "keep" || !f.file || (b.top && !f.top)) continue;\n        const name'],
]);
rep("tools/prompt-lab/synth.html", [
  ["#grid .keep{border-color:#3c3}", "#grid .keep{border-color:#3c3}#grid .top{border-color:#fc0;box-shadow:0 0 0 2px #fc0}"],
  ['<option value="keep">РѕСЃС‚Р°РІР»РµРЅРЅС‹Рµ</option>', '<option value="keep">РѕСЃС‚Р°РІР»РµРЅРЅС‹Рµ</option><option value="top">С‚РѕРї</option>'],
  ['(show === "new" ? !f.mark : f.mark === show)', '(show === "new" ? !f.mark : show === "top" ? !!f.top : f.mark === show)'],
  ['d.className = f.mark ?? (f.pre ? "pre" : "");', 'd.className = (f.mark ?? (f.pre ? "pre" : "")) + (f.top ? " top" : "");'],
  ['${f.mark === "keep" ? "В· РћРЎРўРђР’Р›Р•Рќ" :', '${f.top ? "В· РўРћРџ" : f.mark === "keep" ? "В· РћРЎРўРђР’Р›Р•Рќ" :'],
  ['В· РѕСЃС‚Р°РІР»РµРЅРѕ ${R.frames.filter((f) => f.mark === "keep").length}', 'В· РѕСЃС‚Р°РІР»РµРЅРѕ ${R.frames.filter((f) => f.mark === "keep").length} (С‚РѕРї ${R.frames.filter((f) => f.top).length})'],
  ['async function mark(m) {\n  const f = view[cur];\n  f.mark = m;\n  void J("/api/synth/mark", { concept: R.concept, round: R.round, i: f.i, mark: m })',
   'async function mark(m) {\n  const f = view[cur];\n  const top = m === "top";\n  f.mark = top ? "keep" : m;\n  if (top) f.top = true; else delete f.top;\n  void J("/api/synth/mark", top ? { concept: R.concept, round: R.round, i: f.i, top: true } : { concept: R.concept, round: R.round, i: f.i, mark: m })'],
  ['else if (["d", "D", "РІ", "Р’", "ArrowLeft"]', 'else if (["t", "T", "Рµ", "Р•", "ArrowUp"].includes(e.key)) { e.preventDefault(); void mark("top"); }\n  else if (["d", "D", "РІ", "Р’", "ArrowLeft"]'],
]);
