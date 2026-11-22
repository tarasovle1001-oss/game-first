// night 22.11 05:35: in the pack figure B reads wider in the hips than asked ("balanced, the bottom a bit more expressive, not big").
// Same 8 keys, same seeds, four body strings - to pick the one for the later passes. Nothing is written into the game.
import fs from "node:fs";
const dir = "tools/prompt-lab/data/pack/";
const B = "slender, medium breasts, (narrow waist:1.2), (wide hips:1.1), (ass visible through thighs:1.2), thigh gap, toned";
const V = {
  A: "slim, slender body, medium breasts, (narrow waist:1.3), (ass visible through thighs:1.3)",
  B,
  E: "slender, medium breasts, narrow waist, (ass visible through thighs:1.2), thigh gap, toned",
  S: "slender, medium breasts, narrow waist, toned",
  F: "slim, slender, medium breasts, (ass visible through thighs:1.1), toned, (narrow hips:0.8)",
};
const all = [...JSON.parse(fs.readFileSync(dir + "passes/pass01_none.json", "utf8")).plan, ...JSON.parse(fs.readFileSync(dir + "passes/hisclose_scenes.json", "utf8")).plan];
const want = ["by_hand", "edging", "tease_denial", "patron_chatting", "portrait", "portrait", "riding", "her_tidy"];
const rows = [], used = new Set();
for (const l of want) { const r = all.find((x) => x.layout === l && !used.has(x.key) && x.positive.includes(B)); if (r) { used.add(r.key); rows.push(r); } }
fs.mkdirSync(dir + "figtest", { recursive: true });
for (const [k, body] of Object.entries(V)) fs.writeFileSync(dir + `figtest/fig${k}.json`, JSON.stringify({ plan: rows.map((r) => ({ ...r, positive: r.positive.replaceAll(B, body) })), base: [] }));
console.log(rows.length, rows.map((r) => r.layout).join(" "));

