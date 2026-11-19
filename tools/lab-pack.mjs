// Puts a comfy-run output folder into the Wayward laboratory's "Ревью пака" (127.0.0.1:8191/review.html) as a pack:
// <Wayward>/packs/<name>/pack.json + the pictures, one lab "scene" per layout, so ok / reject and notes go by scene.
// Only creates its own folder; the pack is not imported into the game. Picture bytes are checked: WebP gets a .webp name.
//   node tools/lab-pack.mjs <run dir> [name=tc-<run dir>] [--wayward <dir>]
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join } from "node:path";

const argv = process.argv.slice(2);
const i = argv.indexOf("--wayward");
const wayward = i >= 0 ? argv[i + 1] : join(homedir(), "Documents", "disc", "Wayward");
const [run, name = `tc-${basename(argv[0] ?? "run")}`] = argv.filter((a, j) => !(i >= 0 && (j === i || j === i + 1)));
if (!run || !existsSync(run)) { console.log("node tools/lab-pack.mjs <run dir> [name]"); process.exit(1); }
const prompts = existsSync(join(run, "prompts.json")) ? JSON.parse(readFileSync(join(run, "prompts.json"), "utf8")) : [];
const layoutOf = (f) => prompts.find((p) => f.startsWith(p.file.replace(/\.png$/, "")))?.layout ?? f.split("__")[0];
const dir = join(wayward, "packs", name);
mkdirSync(dir, { recursive: true });
const entries = {};
for (const f of readdirSync(run).filter((x) => /\.(png|webp|jpe?g)$/i.test(x)).sort()) {
  const head = readFileSync(join(run, f)).subarray(0, 12);
  const ext = head.toString("latin1", 8, 12) === "WEBP" ? "webp" : "png";
  const rel = `${f.replace(/\.(png|webp|jpe?g)$/i, "").replace(/[^\w.~-]/g, "_")}.${ext}`;
  copyFileSync(join(run, f), join(dir, rel));
  entries[`tc__scene-${layoutOf(f).toLowerCase().replace(/[^a-z0-9_]/g, "_")}__${rel.replace(/\.\w+$/, "")}`] = rel;
}
writeFileSync(join(dir, "pack.json"), JSON.stringify({ name, folder: name, wife: { id: "tc-default" }, madeFor: "test-city probe", entries, entryCount: Object.keys(entries).length }, null, 1));
console.log(`${Object.keys(entries).length} pictures -> ${dir}. Lab: Start-Laboratory.bat, then http://127.0.0.1:8191/review.html, pack "${name}"`);
