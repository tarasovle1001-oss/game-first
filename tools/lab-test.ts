// A pose test inside Alexey's laboratory (the local page at 127.0.0.1:8191), so the pictures are looked at
// and compared there. Each scene is drawn twice over the mannequin's depth map: without masks and with a mask
// per figure (her / the men), the prompt of each figure going to its own mask.
//   pnpm exec tsx tools/lab-test.ts <posesDir> <labDataDir> [seeds=4] [layouts=a,b,c] [lab=http://127.0.0.1:8191] [--start]
// posesDir holds the Blender output rendered 1216x832 (the lab draws landscape): LAYOUT.depth.png,
// LAYOUT.mask-N-ROLE.png and LAYOUT.mask-men.png (the men's masks joined).
import { copyFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { promptFor } from "../packages/base/src";
import type { SceneDesc } from "../packages/core/src";

const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const [poses, labData, seeds = "4", layoutsArg, lab = "http://127.0.0.1:8191"] = args;
if (!poses || !labData) {
  console.log("lab-test.ts <posesDir> <labDataDir> [seeds] [layouts] [lab] [--start]");
  process.exit(1);
}
const wife = { id: "wife", role: "wife" };
const man = (n: number) => ({ id: `p${n}`, role: n === 1 ? "patron" : `patron${n}` });
const her = { outfit: "daring", face: "aroused", under: "off", skirt: "up" };
// the hard ones: several men with one lying down, hands on him, endings
const TESTS: Record<string, SceneDesc> = {
  group_dp: { type: "group_dp", location: "cafe.staff", participants: [wife, man(1), man(2)], tags: { ...her, outfit: "naked", bare: "all", men: "2", size: "3", size2: "3" } },
  group_spitroast_hand: { type: "group_spitroast_hand", location: "cafe.staff", participants: [wife, man(1), man(2), man(3)], tags: { ...her, outfit: "naked", bare: "all", men: "3", size: "3", size2: "3", size3: "3" } },
  group_sex_hand: { type: "group_sex_hand", location: "cafe.lounge", participants: [wife, man(1), man(2)], tags: { ...her, men: "2", size: "3", size2: "3" } },
  patron_handjob: { type: "patron_handjob", location: "cafe.staff", participants: [wife, man(1)], tags: { outfit: "daring", face: "shy", size: "4" } },
  patron_riding: { type: "patron_riding", location: "hotel.room1", participants: [wife, man(1)], tags: { ...her, outfit: "lingerie", face: "ecstatic", size: "3" } },
  patron_fin_face: { type: "patron_fin_face", location: "cafe.staff", participants: [wife, man(1)], tags: { outfit: "daring", face: "aroused", fin: "face", size: "3" } },
};
const layouts = layoutsArg ? layoutsArg.split(",") : Object.keys(TESTS);

// the lab takes a pose template as files of a "run": runs/<id>/<n>-depth.png, pose-library/<id>/<n>-mask-*.png
const TEMPLATE = "7e57c17a-0000-4000-8000-000000000001";
mkdirSync(join(labData, "runs", TEMPLATE), { recursive: true });
mkdirSync(join(labData, "pose-library", TEMPLATE), { recursive: true });
const scenes: Record<string, unknown>[] = [];
layouts.forEach((layout, n) => {
  const desc = TESTS[layout];
  if (!desc) return console.log(`no test for ${layout}`);
  const depth = join(poses, `${layout}.depth.png`);
  const herMask = readdirSync(poses).find((f) => f.startsWith(`${layout}.mask-`) && f.endsWith("-wife.png"));
  const menMask = join(poses, `${layout}.mask-men.png`);
  if (!existsSync(depth) || !herMask || !existsSync(menMask)) return console.log(`skip ${layout}: depth or masks missing in ${poses}`);
  copyFileSync(depth, join(labData, "runs", TEMPLATE, `${n}-depth.png`));
  copyFileSync(join(poses, herMask), join(labData, "pose-library", TEMPLATE, `${n}-mask-heroine.png`));
  copyFileSync(menMask, join(labData, "pose-library", TEMPLATE, `${n}-mask-second.png`));
  const p = promptFor(desc);
  const men = Object.entries(p.regions).filter(([r]) => r !== "wife").map(([, t]) => t).join(", ");
  for (let i = 0; i < Number(seeds); i++)
    scenes.push({
      key: `tc_${layout}`,
      name: `${layout} #${i + 1}`,
      prompt: p.positive,
      negative: p.negative,
      seed: 5000 + n * 100 + i,
      poseTemplate: { run: TEMPLATE, task: n },
      regionText: { heroine: `${p.regions.wife}, ${p.shared}`, second: `${men}, ${p.shared}` },
    });
});
const pose = { strength: 0.6, end: 0.6 };
const spec = {
  name: `test-city: трудные позы, глубина без масок / с масками (${scenes.length})`,
  seed: 5000,
  concurrency: 1,
  scenes,
  variants: [
    { name: "глубина, без масок", workflow: "pose-guided", filterMode: "off", pose },
    { name: "глубина + маски по фигурам", workflow: "pose-guided", filterMode: "off", pose: { ...pose, regions: true } },
  ],
};
const post = async (path: string, body: unknown) => {
  const r = await fetch(lab + path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const j = (await r.json()) as { id?: string; error?: string; total?: number };
  if (!r.ok) throw Error(`${path}: ${j.error ?? r.status}`);
  return j;
};
const run = await post("/api/runs", spec);
console.log(`prepared in the lab: ${run.id}, ${scenes.length} scenes x 2 variants`);
if (process.argv.includes("--start")) {
  await post("/api/run/command", { id: run.id, action: "start" });
  console.log(`started. Watch it in the lab: ${lab} (the test is in the list of runs)`);
}
