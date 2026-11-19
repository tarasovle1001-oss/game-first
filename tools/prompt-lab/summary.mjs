// One JSON of the lab's state: per scene the marks, notes, status and the tags of each take (for analysis).
//   node tools/prompt-lab/summary.mjs > summary.json
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const data = join(dirname(fileURLToPath(import.meta.url)), "data");
const out = {};
for (const id of readdirSync(data)) {
  const f = join(data, id, "state.json");
  if (!existsSync(f)) continue;
  const s = JSON.parse(readFileSync(f, "utf8"));
  out[id] = { status: s.status, note: s.note ?? "", room: s.room, takes: s.takes.map((t) => ({ tags: t.tags, negative: t.negative, marks: t.marks, drawn: t.files.filter(Boolean).length, settings: { ckpt: t.settings.ckpt, loras: t.settings.loras } })) };
}
process.stdout.write(JSON.stringify(out, null, 1));
