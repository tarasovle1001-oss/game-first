// deletes the pictures Claude screened out (pre: "drop") in the given rounds; frames Alexey marked keep are never touched
// node tools/prompt-lab/data/del-round.mjs fd_behind:11 his_close:8 [--go]
import { readFileSync, existsSync, unlinkSync } from "node:fs";
const go = process.argv.includes("--go");
const root = "tools/prompt-lab/data/synth";
let total = 0;
for (const a of process.argv.slice(2).filter((x) => x.includes(":"))) {
  const [c, k] = a.split(":");
  const j = JSON.parse(readFileSync(`${root}/${c}/k${k}.json`, "utf8"));
  let n = 0;
  (j.frames ?? []).forEach((f, i) => {
    if (f.mark === "keep" || f.pre !== "drop") return;
    const p = `${root}/${c}/k${k}/${f.i ?? i}.png`;
    if (!existsSync(p)) return;
    n++;
    if (go) unlinkSync(p);
  });
  total += n;
  console.log(`${c} k${k}: ${n}`);
}
console.log(go ? `deleted ${total}` : `dry run: ${total} (add --go)`);
