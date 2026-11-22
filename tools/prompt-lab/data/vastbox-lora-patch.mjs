// day 21.11: vast-box fetch gets a --lora flag: the Civitai file goes to models/loras (and may be small), not to checkpoints.
import { readFileSync, writeFileSync } from "node:fs";
const f = "tools/vast-box.mjs";
let s = readFileSync(f, "utf8");
if (s.includes('argv.includes("--lora")')) { console.log("already patched"); process.exit(0); }
const rep = (a, b) => { if (!s.includes(a)) throw new Error("no: " + a.slice(0, 50)); s = s.replace(a, b); };
rep("const dst = `/workspace/ComfyUI/models/checkpoints/${name}`;", 'const isLora = argv.includes("--lora");\n  const dst = `/workspace/ComfyUI/models/${isLora ? "loras" : "checkpoints"}/${name}`;');
rep("p.stat().st_size>1e9", 'p.stat().st_size>${isLora ? "1e7" : "1e9"}');
rep("//   node tools/vast-box.mjs fetch --civitai <ver> --name <f>  another checkpoint onto the box", "//   node tools/vast-box.mjs fetch --civitai <ver> --name <f> [--lora]  another checkpoint (or, with --lora, a LoRA) onto the box");
writeFileSync(f, s);
console.log("patched");
