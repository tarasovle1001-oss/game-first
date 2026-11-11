// Turns poses.json from the pose editor into skeleton images for a pose ControlNet, plus one box mask per figure.
// pnpm exec tsx tools/pose-render.ts poses.json [outDir=pose-export]
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

type P = [number, number] | null;
interface Variant { w: number; h: number; figures: { role: string; k: P[] }[] }
const [file, out = "pose-export"] = process.argv.slice(2);
if (!file) throw new Error("usage: pose-render.ts poses.json [outDir]");
const data = JSON.parse(readFileSync(file, "utf8")) as { scenes: Record<string, Variant[]> };
const LIMBS: [number, number, string][] = [
  [1, 2, "#ff0000"], [1, 5, "#ff5500"], [2, 3, "#ffaa00"], [3, 4, "#ffff00"], [5, 6, "#aaff00"], [6, 7, "#55ff00"],
  [1, 8, "#00ff00"], [8, 9, "#00ff55"], [9, 10, "#00ffaa"], [1, 11, "#00ffff"], [11, 12, "#00aaff"], [12, 13, "#0055ff"], [1, 0, "#0000ff"],
];
mkdirSync(out, { recursive: true });
let n = 0;
for (const [id, variants] of Object.entries(data.scenes)) {
  variants.forEach((v, i) => {
    const name = i === 0 ? id : `${id}~${i + 1}`;
    const sw = Math.max(4, Math.round(Math.max(v.w, v.h) / 150));
    const svg = (body: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${v.w} ${v.h}" width="${v.w}" height="${v.h}"><rect width="100%" height="100%" fill="#000"/>${body}</svg>`;
    const body = v.figures
      .map(({ k }) => LIMBS.map(([a, b, c]) => (k[a] && k[b] ? `<line x1="${k[a]![0]}" y1="${k[a]![1]}" x2="${k[b]![0]}" y2="${k[b]![1]}" stroke="${c}" stroke-width="${sw}" stroke-linecap="round" opacity="0.75"/>` : "")).join("") + k.map((p, j) => (p ? `<circle cx="${p[0]}" cy="${p[1]}" r="${sw * 0.7}" fill="${LIMBS[Math.min(j, LIMBS.length - 1)]![2]}"/>` : "")).join(""))
      .join("");
    writeFileSync(join(out, `${name}.pose.svg`), svg(body));
    v.figures.forEach((f, j) => {
      const pts = f.k.filter((p): p is [number, number] => p !== null);
      const pad = v.w * 0.06;
      const x0 = Math.max(0, Math.min(...pts.map((p) => p[0])) - pad);
      const y0 = Math.max(0, Math.min(...pts.map((p) => p[1])) - pad * 1.4);
      const x1 = Math.min(v.w, Math.max(...pts.map((p) => p[0])) + pad);
      const y1 = Math.min(v.h, Math.max(...pts.map((p) => p[1])) + pad);
      writeFileSync(join(out, `${name}.mask-${j}-${f.role}.svg`), svg(`<rect x="${x0}" y="${y0}" width="${x1 - x0}" height="${y1 - y0}" rx="${Math.round((x1 - x0) * 0.12)}" fill="#fff"/>`));
    });
    n++;
  });
}
console.log(`${n} poses -> ${out}/`);
