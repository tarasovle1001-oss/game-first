// day 22.11 01:30: the holder destroyed the box in the middle of LoRA training: ComfyUI did not answer for 20 min while the trainer held the GPU,
// and the watchdog took it for a dead box. --train switches that watchdog off (budget, hours and idle limits stay).
import { readFileSync, writeFileSync } from "node:fs";
const f = "tools/night-run.mjs";
let s = readFileSync(f, "utf8");
if (s.includes('argv.includes("--train")')) { console.log("already patched"); process.exit(0); }
const a = "if (!j.comfyOk) { deadSince ||= Date.now();";
if (!s.includes(a)) throw new Error("no watchdog line");
s = s.replace(a, 'if (!j.comfyOk && !argv.includes("--train")) { deadSince ||= Date.now();');
writeFileSync(f, s);
console.log("patched");
