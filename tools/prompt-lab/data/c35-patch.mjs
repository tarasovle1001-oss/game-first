// night 22.11: (1) the 500- and 1000-step checkpoints of tc_hisclose at 0.6 / 0.8 (the 1500-step file washes the picture out above 0.4);
// (2) control of tc_femdom on the four compositions of the evening: final @0.4, 1000 @0.6, 500 @0.8, and no LoRA for the same seeds.
import { readFileSync, writeFileSync } from "node:fs";
const f = "tools/prompt-lab/synth.yaml";
let s = readFileSync(f, "utf8");
if (/- id: c5_hand_06\r?\n/.test(s)) { console.log("already patched"); process.exit(0); }
const block = (id) => {
  const m = new RegExp("      - id: " + id + "\\r?\\n").exec(s);
  if (!m) throw new Error("no " + id);
  const rest = s.slice(m.index + 10);
  const e = rest.search(/\n {6}- id: |\n {2}- id: /);
  return [m.index, e < 0 ? s.length : m.index + 10 + e + 1];
};
const BASE = "sdxl_lightning_8step_lora.safetensors:1,sora_v2-000010.safetensors:0.7";
const mk = (src, id, title, lora, trigger, n, neg = "") => {
  const [a, b] = block(src);
  let blk = s.slice(a, b).replace(`- id: ${src}`, `- id: ${id}`).replace(/title: ".*"/, `title: "${title}"`)
    .replace(/count: \d+(\r?\n\s+loras: ".*")?/, `count: ${n}\n        loras: "${BASE}${lora ? "," + lora : ""}"`)
    .replace('prompt: "', `prompt: "${lora ? trigger + ", " : ""}`);
  if (neg) blk = blk.replace('negative: "', `negative: "${neg}`);
  if (!blk.includes(`- id: ${id}`) || !blk.includes("loras:")) throw new Error("mk " + id);
  return blk.endsWith("\n") ? blk : blk + "\n";
};
// his_close: sources are the ctl_*_0 targets (already carry precum and the negative), which have their own loras line
let his = "";
for (const sc of ["hand", "mouth"]) for (const [tag, file] of [["c5", "tc_hisclose-500"], ["c10", "tc_hisclose-1000"]]) for (const w of [0.6, 0.8])
  his += mk(`ctl_${sc}_0`, `${tag}_${sc}_${String(w).replace(".", "")}`, `КОНТРОЛЬ ${file} вес ${w}: ${sc}`, `${file}.safetensors:${w}`, "tc_hisclose", 12);
let [, e1] = block("ctl_soft_08");
s = s.slice(0, e1) + his + s.slice(e1);
let fem = "";
for (const src of ["fpov_finger", "fpov_fist3", "dildo11", "pegging4"]) for (const [tag, lora] of [["f0", ""], ["f15", "tc_femdom.safetensors:0.4"], ["f10", "tc_femdom-1000.safetensors:0.6"], ["f5", "tc_femdom-500.safetensors:0.8"]])
  fem += mk(src, `${tag}_${src}`, `КОНТРОЛЬ фемдом ${lora || "без LoRA"}: ${src}`, lora, "tc_femdom", 16);
const [, e2] = block("fpov_fist3");
s = s.slice(0, e2) + fem + s.slice(e2);
writeFileSync(f, s);
console.log("patched");
