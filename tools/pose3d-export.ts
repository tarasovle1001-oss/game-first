// Writes every scene's solved figures (joints in scene units, what he has, what she holds) for the Blender script
// tools/blender/pose3d.py, which stands 3D mannequins in these poses and renders depth, masks and a skeleton.
// pnpm exec tsx tools/pose3d-export.ts [out=scenes3d.json]
import { writeFileSync } from "node:fs";
import { content } from "../packages/base/src/content";
import { solve } from "../packages/schematics/src";

const out = process.argv[2] ?? "scenes3d.json";
const round = (p: [number, number]) => [Math.round(p[0] * 100) / 100, Math.round(p[1] * 100) / 100];
const scenes = Object.fromEntries(
  content.scenes.map((s) => [
    s.id,
    solve(s.figures).map((f, i) => ({
      role: f.role,
      pose: s.figures[i]!.pose,
      prop: f.prop ?? null,
      side: s.figures[i]!.side ?? 0,
      scale: Math.round(f.scale * 1000) / 1000,
      flip: f.flip,
      j: Object.fromEntries(Object.entries(f.j).map(([k, v]) => [k, round(v)])),
      extras: f.extras.map((e) => ({ kind: e.kind, pts: e.pts.map(round) })),
    })),
  ]),
);
// a standing woman is 95.5 units * 0.95; call that 1.62 m
writeFileSync(out, JSON.stringify({ version: 1, unit: 1.62 / (95.5 * 0.95), scenes }));
console.log(`${content.scenes.length} scenes -> ${out}`);
