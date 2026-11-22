// vast-box sh: "--timeout N" is the command's own option, it must not reach the script on the box
import { readFileSync, writeFileSync } from "node:fs";
const f = "tools/vast-box.mjs";
let s = readFileSync(f, "utf8");
const a = "const [file, ...rest] = argv.slice(1);";
if (!s.includes(a)) { console.log(s.includes("const [file, ...all]") ? "already" : "no anchor"); process.exit(0); }
s = s.replace(a, 'const [file, ...all] = argv.slice(1);\n  const ti = all.indexOf("--timeout");\n  const rest = ti >= 0 ? [...all.slice(0, ti), ...all.slice(ti + 2)] : all;');
writeFileSync(f, s);
console.log("fixed");
