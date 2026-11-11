// Writes what an image generator needs for every scene type: an OpenPose skeleton image, one mask per figure,
// and a JSON with keypoints and boxes. Made from the same layouts as the in-game schematics.
// pnpm exec tsx tools/pose-export.ts [outDir=pose-export] [width=832] [height=1216]
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { content } from "../packages/base/src/content";
import { renderMask, renderOpenPose, toOpenPose } from "../packages/schematics/src";

const [out = "pose-export", w = "832", h = "1216"] = process.argv.slice(2);
const width = Number(w);
const height = Number(h);
mkdirSync(out, { recursive: true });
const index: Record<string, unknown> = {};
for (const scene of content.scenes) {
  const figures = scene.figures;
  const pose = toOpenPose(figures, width, height);
  writeFileSync(join(out, `${scene.id}.pose.svg`), renderOpenPose(figures, width, height));
  pose.forEach((f, i) => writeFileSync(join(out, `${scene.id}.mask-${i}-${f.role}.svg`), renderMask(f, width, height)));
  index[scene.id] = { width, height, figures: pose };
}
writeFileSync(join(out, "index.json"), JSON.stringify(index, null, 1));
console.log(`${content.scenes.length} scenes -> ${out}/ (pose + masks as SVG, index.json with keypoints and boxes)`);
