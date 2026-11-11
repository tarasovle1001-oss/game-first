// All scene layouts on one page, to look them over. pnpm exec tsx tools/contact-sheet.ts out.html [from]
import { readFileSync, writeFileSync } from "node:fs";
import { renderSchematic } from "../packages/schematics/src/index";
const [out = "contact-sheet.html", from = "0"] = process.argv.slice(2);
const c = JSON.parse(readFileSync(new URL("../packages/base/src/generated/content.json", import.meta.url), "utf8"));
const ru = c.locales?.ru ?? {};
const cells = (c.scenes as { id: string; figures: never[] }[])
  .slice(Number(from))
  .map((s) => `<div class="c">${renderSchematic(s.figures, {})}<b>${s.id}</b><i>${ru[`scene.${s.id}`] ?? ""}</i></div>`)
  .join("");
writeFileSync(out, `<meta charset="utf-8"><style>body{margin:12px;background:#15171c;color:#ddd;font:12px system-ui}.g{display:grid;grid-template-columns:repeat(6,1fr);gap:8px}.c{background:#1f232b;border-radius:6px;padding:4px;text-align:center}.c svg{width:100%;height:auto;display:block}b{display:block}i{color:#99a;font-style:normal}</style><div class="g">${cells}</div>`);
