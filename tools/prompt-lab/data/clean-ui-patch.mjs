// day 21.11, Alexey 19:01 "too much junk": /synth lists only the rounds that have something for him to look at
// (screened by Claude and with frames left, or with kept frames); the label says what is in the round. "все круги" brings the rest back.
import { readFileSync, writeFileSync } from "node:fs";
let f = "tools/prompt-lab/synth.ts", s = readFileSync(f, "utf8");
if (!s.includes("left: r.screened")) {
  const a = 'errors: r.frames.filter((f) => f.error && !f.file).length };';
  if (!s.includes(a)) throw new Error("ts anchor");
  s = s.replace(a, 'errors: r.frames.filter((f) => f.error && !f.file).length, screened: !!r.screened, left: r.screened ? r.frames.filter((f) => f.file && !f.pre && !f.mark).length : 0, byTarget: r.screened ? r.frames.filter((f) => f.file && !f.pre && !f.mark).reduce((o: Record<string, number>, f) => { o[f.target] = (o[f.target] ?? 0) + 1; return o; }, {}) : {} };');
  writeFileSync(f, s); console.log("ts patched");
}
f = "tools/prompt-lab/synth.html"; s = readFileSync(f, "utf8");
if (!s.includes('id="allrounds"')) {
  const re = /\$\("round"\)\.replaceChildren\(\.\.\.c\.rounds\.map\(\(r\) => new Option\(`[^`]*`, r\.round\)\)\);/;
  if (!re.test(s)) throw new Error("html anchor 1");
  s = s.replace(re, 'const short = (id) => titleOf(id).split(":")[0].split(" (")[0];\n  const shown = c.rounds.filter((r) => $("allrounds").checked || r.left > 0 || r.keep > 0);\n  $("round").replaceChildren(...shown.map((r) => new Option($("allrounds").checked && !r.left ? `К${r.round} · ${r.drawn}/${r.total}${r.screened ? "" : " · не отсеян"}` : `К${r.round} · смотреть ${r.left}: ${Object.entries(r.byTarget).map(([t, n]) => `${short(t)} ${n}`).join(", ")}${r.keep ? ` · оставлено ${r.keep}` : ""}`, r.round)));');
  s = s.replace('if (keep && wasR) $("round").value = wasR; else if (c.rounds.length) $("round").value = c.rounds.at(-1).round;', 'if (keep && wasR && shown.some((r) => String(r.round) === String(wasR))) $("round").value = wasR; else if (shown.length) $("round").value = (shown.find((r) => r.left > 0) ?? shown.at(-1)).round;');
  const b = '<select id="round"></select>';
  if (!s.includes(b)) throw new Error("html anchor 2");
  s = s.replace(b, '<select id="round"></select> <label><input type="checkbox" id="allrounds"> все круги</label>');
  const c2 = '$("concept").onchange = async () => {';
  if (!s.includes(c2)) throw new Error("html anchor 3");
  s = s.replace(c2, '$("allrounds").onchange = async () => { await loadBook(true); await loadRound(); };\n' + c2);
  writeFileSync(f, s); console.log("html patched");
}
