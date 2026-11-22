// day 22.11: control of the pilot LoRA tc_hisclose. Four scenes x (no LoRA, 0.4, 0.6, 0.8): ctl_<scene>_<w>. Trigger word in the prompt,
// the unwanted honest tags (dark, abs, veiny, pubic hair, large) in the negative, precum asked for.
import { readFileSync, writeFileSync } from "node:fs";
const f = "tools/prompt-lab/synth.yaml";
let s = readFileSync(f, "utf8");
if (s.includes("- id: ctl_hand_0\n") || s.includes("- id: ctl_hand_0\r")) { console.log("already patched"); process.exit(0); }
const block = (id) => {
  const m = new RegExp("      - id: " + id + "\\r?\\n").exec(s);
  if (!m) throw new Error("no " + id);
  const rest = s.slice(m.index + 10);
  const e = rest.search(/\n {6}- id: |\n {2}- id: /);
  return [m.index, e < 0 ? s.length : m.index + 10 + e + 1];
};
const BASE = "sdxl_lightning_8step_lora.safetensors:1,sora_v2-000010.safetensors:0.7";
const NEG = "(dark-skinned male:1.4), dark skin, tan, (abs:1.3), muscular male, muscular, (veiny penis:1.3), pubic hair, male pubic hair, (large penis:1.4), leg hair, ";
let out = "";
for (const [src, name] of [["handjob4", "hand"], ["mouth3", "mouth"], ["foot5", "foot"], ["soft5", "soft"]]) {
  const [a, b] = block(src);
  const base = s.slice(a, b);
  for (const w of [0, 0.4, 0.6, 0.8]) {
    const id = `ctl_${name}_${String(w).replace(".", "")}`;
    let blk = base.replace(`- id: ${src}`, `- id: ${id}`).replace(/title: ".*"/, `title: "КОНТРОЛЬ LoRA вставок мужа: ${name}, вес ${w}"`).replace(/count: \d+/, `count: 12\n        loras: "${BASE}${w ? `,tc_hisclose.safetensors:${w}` : ""}"`)
      .replace('prompt: "', `prompt: "${w ? "tc_hisclose, " : ""}precum, `).replace('negative: "', `negative: "${NEG}`);
    if (!blk.includes(id) || !blk.includes("loras:") || !blk.includes(NEG)) throw new Error("mk " + id);
    if (!blk.endsWith("\n")) blk += "\n";
    out += blk;
  }
}
const [, end] = block("soft5");
s = s.slice(0, end) + out + s.slice(end);
writeFileSync(f, s);
console.log("patched");
