// night 22.11: acts on data/pack/scan.json (WD tagger sweep).  node pack-scan-act.mjs [--go]
//  a) young-look signals -> listed; with --go moved to pack/old/_young_check (looked at on a sheet, then deleted)
//  b) "patron alone" inserts with a second figure -> with --go moved to pack/old/insert_extra_person
import fs from "node:fs";
const dir = "tools/prompt-lab/data/pack/", goY = process.argv.includes("--young"), goX = process.argv.includes("--extra"), go = goY || goX;
const scan = JSON.parse(fs.readFileSync(dir + "scan.json", "utf8"));
const Y = ["loli", "child", "aged down", "petite", "flat chest", "school uniform", "serafuku", "shota", "oppai loli", "randoseru", "kindergarten uniform", "child on child"];
const hf = dir + "scan-handled.json"; const handled = new Set(fs.existsSync(hf) ? JSON.parse(fs.readFileSync(hf, "utf8")) : fs.existsSync(dir + "old/insert_extra_person") ? fs.readdirSync(dir + "old/insert_extra_person").map((x) => x.replace("__", "/")) : []); // moved once and redrawn since: the scan entry is stale
const young = [], extra = [];
for (const [f, t] of Object.entries(scan)) {
  if (!fs.existsSync(dir + "out/" + f) || handled.has(f)) continue;
  const y = Y.filter((k) => (t[k] ?? 0) >= 0.3);
  if (y.length) young.push([f, y.map((k) => k + "=" + t[k]).join(" ")]);
  else if (/\/insert_patron_/.test(f) && ((t["1girl"] ?? 0) >= 0.5 || (t["2boys"] ?? 0) >= 0.5 || (t["multiple boys"] ?? 0) >= 0.5 || (t["2girls"] ?? 0) >= 0.5)) extra.push(f);
}
const cnt = {}; for (const f of extra) for (const k of ["1girl", "2boys", "multiple boys", "2girls"]) if ((scan[f][k] ?? 0) >= 0.5) cnt[k] = (cnt[k] ?? 0) + 1; console.log("extra by tag", JSON.stringify(cnt), "of inserts scanned", Object.keys(scan).filter((f) => /\/insert_patron_/.test(f)).length);
console.log("scanned", Object.keys(scan).length, "| young-look signals", young.length, "| inserts with a second figure", extra.length);
for (const [f, y] of young.slice(0, 60)) console.log("  ", y, "|", f.slice(0, 90));
if (go) {
  const mv = (list, to) => { fs.mkdirSync(dir + "old/" + to, { recursive: true }); for (const f of list) fs.renameSync(dir + "out/" + f, dir + "old/" + to + "/" + f.replace("/", "__")); };
  if (goY) mv(young.map((x) => x[0]), "_young_check"); if (goX) mv(extra, "insert_extra_person");
  for (const f of [...(goY ? young.map((x) => x[0]) : []), ...(goX ? extra : [])]) handled.add(f); fs.writeFileSync(hf, JSON.stringify([...handled]));
  console.log("moved");
}



