// Contact sheet of every scene schematic: pnpm exec tsx tools/scene-sheet.ts out.html
import { writeFileSync } from "node:fs";
import { content } from "../packages/base/src/content";
import { renderSchematic } from "../packages/schematics/src";

const out = process.argv[2] ?? "scene-sheet.html";
const t = (k: string) => content.locales.ru![k] ?? k;
const cells = content.scenes
  .map((s) => `<div>${renderSchematic(s.figures, { title: t(`scene.${s.id}`), subtitle: s.id, legend: { wife: t("role.wife"), patron: t("role.patron"), husband: t("role.husband") } })}</div>`)
  .join("");
writeFileSync(out, `<!doctype html><meta charset="utf-8"><body style="margin:16px;font-family:system-ui;display:grid;grid-template-columns:repeat(4,1fr);gap:12px;color:#222">${cells}</body>`);
console.log(`${content.scenes.length} scenes -> ${out}`);
