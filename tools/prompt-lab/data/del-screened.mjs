// deletes the pictures Claude screened out (pre: "drop") in the night rounds of 21.11; frames Alexey marked keep are never touched
// node tools/prompt-lab/data/del-screened.mjs [--go]
import { readFileSync, existsSync, unlinkSync } from "node:fs";
const go = process.argv.includes("--go");
const root = "tools/prompt-lab/data/synth";
const rounds = [["fd_behind", 3], ["fd_behind", 4], ["fd_behind", 6], ["his_close", 2], ["his_close", 4], ["sixty_nine", 3]];
let total = 0;
for (const [c, k] of rounds) {
  const j = JSON.parse(readFileSync(`${root}/${c}/k${k}.json`, "utf8"));
  const frames = j.frames ?? [];
  let n = 0, kept = 0;
  frames.forEach((f, i) => {
    if (f.mark === "keep") { kept++; return; }
    if (f.pre !== "drop") return;
    const p = `${root}/${c}/k${k}/${f.i ?? i}.png`;
    if (!existsSync(p)) return;
    n++;
    if (go) unlinkSync(p);
  });
  total += n;
  console.log(`${c} k${k}: frames ${frames.length}, screened ${j.screened ? "yes" : "no"}, to delete ${n}, kept by Alexey ${kept}, keys ${Object.keys(frames[0] ?? {}).join(",")}`);
}
console.log(go ? `deleted ${total}` : `dry run: ${total} (add --go)`);
