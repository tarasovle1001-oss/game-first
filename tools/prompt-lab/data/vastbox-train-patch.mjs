// day 22.11: vast-box gets three commands for LoRA training on the box: sh (run a local bash script there), pushdir (a folder -> /workspace/tr/data/<name>), pull (a file from the box).
import { readFileSync, writeFileSync } from "node:fs";
const f = "tools/vast-box.mjs";
let s = readFileSync(f, "utf8");
if (s.includes('cmd === "pushdir"')) { console.log("already patched"); process.exit(0); }
const mark = 'else if (cmd === "fetch") {';
if (!s.includes(mark)) throw new Error("no fetch branch");
const add = `else if (cmd === "sh") {
  // run a local bash script on the box: sh <script.sh> [args...]; output goes to the console
  const [file, ...rest] = argv.slice(1);
  const r = spawnSync("ssh", [...sshArgs(), "bash", "-s", "--", ...rest], { input: readFileSync(file, "utf8").replace(/\\r\\n/g, "\\n"), stdio: ["pipe", "inherit", "inherit"], timeout: Number(opt("timeout", "3600")) * 1000 });
  process.exit(r.status ?? 1);
}
else if (cmd === "pushdir") {
  // a dataset folder onto the box: pushdir <folder> <name>  ->  /workspace/tr/data/<name>/
  const [dir, name] = argv.slice(1);
  if (!dir || !/^[\\w-]+$/.test(name ?? "")) { console.log("pushdir <folder> <name>"); process.exit(1); }
  const tarFile = join(tmpdir(), \`tc-\${name}.tar\`);
  let r = spawnSync("tar", ["-cf", tarFile, "-C", dir, "."], { stdio: "inherit" });
  if (r.status !== 0) process.exit(1);
  const a = sshArgs(); const target = a.pop(); const port = a.splice(a.indexOf("-p"), 2)[1];
  r = spawnSync("scp", [...a, "-P", port, tarFile, \`\${target}:/workspace/tc-\${name}.tar\`], { stdio: "inherit", timeout: 30 * 60000 });
  if (r.status !== 0) process.exit(1);
  r = spawnSync("ssh", [...sshArgs(), \`rm -rf /workspace/tr/data/\${name} && mkdir -p /workspace/tr/data/\${name} && tar -xf /workspace/tc-\${name}.tar -C /workspace/tr/data/\${name} && rm /workspace/tc-\${name}.tar && ls /workspace/tr/data/\${name} | wc -l\`], { stdio: "inherit" });
  process.exit(r.status ?? 1);
}
else if (cmd === "pull") {
  // a file from the box: pull <remote path> <local path>
  const [from, to] = argv.slice(1);
  const a = sshArgs(); const target = a.pop(); const port = a.splice(a.indexOf("-p"), 2)[1];
  const r = spawnSync("scp", [...a, "-P", port, \`\${target}:\${from}\`, to], { stdio: "inherit", timeout: 30 * 60000 });
  process.exit(r.status ?? 1);
}
`;
s = s.replace(mark, add + mark);
if (!/import \{[^}]*tmpdir[^}]*\} from "node:os"/.test(s)) {
  const m = /import \{([^}]*)\} from "node:os";/.exec(s);
  if (m) s = s.replace(m[0], `import {${m[1].trimEnd()}, tmpdir } from "node:os";`);
  else s = s.replace('import { spawn, spawnSync } from "node:child_process";', 'import { spawn, spawnSync } from "node:child_process";\nimport { tmpdir } from "node:os";');
}
writeFileSync(f, s);
console.log("patched");
