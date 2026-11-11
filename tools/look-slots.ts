// The empty slots of prompt.yaml, handed out with context so a helper (another model or a person) can fill them,
// and taken back. Nothing here writes words itself.
//   pnpm slots export [size=40] [dir=slots]   -> slots/01.md, 02.md ... each a self-contained brief + YAML to fill
//   pnpm slots merge <file> [...]              -> puts the filled values into prompt.yaml (only known keys, only non-empty)
//   pnpm slots check                           -> how many are empty, and what is wrong with the filled ones
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse, parseDocument, Scalar, stringify } from "yaml";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const file = join(root, "packages/base/content/prompt.yaml");
const scenes = parse(readFileSync(join(root, "packages/base/content/scenes.yaml"), "utf8")) as { id: string; figures: Record<string, unknown>[] }[];
const acts = parse(readFileSync(join(root, "packages/base/content/acts.yaml"), "utf8")) as { id: string; scene: string }[];
const ru = parse(readFileSync(join(root, "packages/base/locales/ru.yaml"), "utf8")) as Record<string, string>;
const en = parse(readFileSync(join(root, "packages/base/locales/en.yaml"), "utf8")) as Record<string, string>;
type Words = { style: Record<string, string>; poses: Record<string, Record<string, string | null>> };
const load = () => parse(readFileSync(file, "utf8")) as Words;
const filled = (v: unknown) => typeof v === "string" && v.trim() !== "";

/** A layout in a few plain lines: who stands how, what reaches for what. Straight from scenes.yaml. */
function layoutLines(id: string): string[] {
  const s = scenes.find((x) => x.id === id)!;
  return s.figures.map((f) => {
    const bits = [`${f.role}: ${f.pose}${f.flip ? ", facing left" : ", facing right"}`];
    if (typeof f.torso === "number") bits.push(`torso ${f.torso} deg`);
    for (const limb of ["armR", "armL", "legR", "legL"]) {
      const v = f[limb] as { to?: string } | undefined;
      if (v && typeof v === "object" && "to" in v && v.to) bits.push(`${limb} -> ${v.to}`);
    }
    const p = f.penis as { to?: string } | boolean | undefined;
    if (p && typeof p === "object" && p.to) bits.push(`penis -> ${p.to}`);
    else if (p) bits.push("penis shown");
    if (f.toy) bits.push("holds a toy");
    return bits.join("; ");
  });
}

const BRIEF = `# Fill the empty slots

You fill prompt slots for an anime-style image model (Illustrious / NoobAI, danbooru tags).
The game builds each picture from a 3D mannequin (depth map) plus a prompt. Each figure has its own prompt,
so a slot describes ONE figure only. Clothes, face, marks, room and the act itself are added by the game - do not repeat them.

Rules:
- Danbooru-style tags, lowercase, comma separated, one line. No sentences. At most 20 tags per slot.
- "scene" slot: composition and camera only - camera angle, framing, distance, who is in front, eye contact between them.
- role slot (wife, husband, patron, patron2, patron3, watcher): that figure's pose, where the hands are, where it looks.
- Do NOT write counts (1girl, 1boy, 2boys...) - the game adds them.
- Do NOT use the words wife, husband, patron, watcher - the image model does not know them. Do NOT write "facing left/right", "side view", "profile": the camera angle comes from the 3D mannequin.
- Do NOT write appearance (hair, skin, eyes, body type) - that comes from the character card.
- All characters are adults.
- Return ONLY the YAML block below with the empty strings filled, same keys, nothing else.
`;

function exportSlots(size: number, dir: string) {
  const w = load();
  type Item = { path: string[]; context: string[] };
  const items: Item[] = [];
  if (!filled(w.style.prefix)) items.push({ path: ["style", "prefix"], context: ["Quality / style tags at the start of every prompt."] });
  if (!filled(w.style.negative)) items.push({ path: ["style", "negative"], context: ["Shared negative prompt."] });
  for (const s of scenes) {
    const slots = w.poses[s.id] ?? {};
    const act = acts.find((a) => a.scene === s.id) ?? acts.find((a) => a.id === s.id);
    for (const k of Object.keys(slots))
      if (!filled(slots[k]))
        items.push({
          path: ["poses", s.id, k],
          context: [`scene "${s.id}": ${en[`scene.${s.id}`] ?? ""} / ${ru[`scene.${s.id}`] ?? ""}${act ? ` (act: ${act.id})` : ""}`, ...layoutLines(s.id).map((l) => `  ${l}`)],
        });
  }
  mkdirSync(dir, { recursive: true });
  let n = 0;
  for (let i = 0; i < items.length; ) {
    // keep a scene's slots in one chunk
    let end = Math.min(i + size, items.length);
    while (end < items.length && items[end]!.path[1] === items[end - 1]!.path[1]) end++;
    const chunk = items.slice(i, end);
    const tree: Record<string, unknown> = {};
    const ctx: string[] = [];
    let last = "";
    for (const it of chunk) {
      let node = tree as Record<string, unknown>;
      for (const p of it.path.slice(0, -1)) node = (node[p] ??= {}) as Record<string, unknown>;
      node[it.path.at(-1)!] = "";
      const head = it.path.slice(0, 2).join(".");
      if (head !== last) ctx.push(`- ${it.context.join("\n")}`);
      last = head;
    }
    n++;
    const name = join(dir, `${String(n).padStart(2, "0")}.md`);
    writeFileSync(name, `${BRIEF}\n## Context\n\n${ctx.join("\n")}\n\n## Fill this\n\n\`\`\`yaml\n${stringify(tree, { lineWidth: 0 })}\`\`\`\n`);
    i = end;
  }
  console.log(`${items.length} empty slots -> ${n} file(s) in ${dir}/. Hand them over one at a time, then: pnpm slots merge <answer>`);
}

function merge(files: string[]) {
  const doc = parseDocument(readFileSync(file, "utf8"));
  const current = load();
  let set = 0;
  const unknown: string[] = [];
  const walk = (node: unknown, path: string[]) => {
    if (node && typeof node === "object") for (const [k, v] of Object.entries(node)) walk(v, [...path, k]);
    else if (filled(node)) {
      let probe: unknown = current;
      for (const p of path) probe = probe && typeof probe === "object" ? (probe as Record<string, unknown>)[p] : undefined;
      if (probe === undefined) return void unknown.push(path.join("."));
      const value = new Scalar(String(node).replace(/\s+/g, " ").trim());
      value.type = "QUOTE_DOUBLE";
      doc.setIn(path, value);
      set++;
    }
  };
  for (const f of files) {
    const text = readFileSync(f, "utf8");
    const yaml = text.match(/```ya?ml\s*\n([\s\S]*?)```/)?.[1] ?? text;
    walk(parse(yaml), []);
  }
  writeFileSync(file, doc.toString({ lineWidth: 0 }));
  console.log(`merged ${set} value(s) into prompt.yaml`);
  if (unknown.length) console.log(`ignored, no such slot: ${unknown.join(", ")}`);
  check();
}

const COUNT = /^(\d+|multiple )?(girl|boy|other)s?$/;
function check(): number {
  const w = load();
  const problems: string[] = [];
  let empty = 0;
  let total = 0;
  const lint = (path: string, v: string | null | undefined, pose: boolean) => {
    total++;
    if (!filled(v)) return void empty++;
    const tags = v!.split(",").map((t) => t.trim()).filter(Boolean);
    if (/\n/.test(v!)) problems.push(`${path}: more than one line`);
    if (tags.length > 20) problems.push(`${path}: ${tags.length} tags, max 20`);
    for (const t of tags) if (COUNT.test(t.replace(/[()]/g, "").replace(/:[\d.]+$/, ""))) problems.push(`${path}: count tag "${t}" - the game adds counts`);
    if (pose && /\b(wife|husband|patron\d?|watcher)\b/i.test(v!)) problems.push(`${path}: names a role ("wife", "patron"...) - the model does not know these words; say "another", "partner", or drop it`);
    if (pose && /facing (left|right)|side view|from side|profile/i.test(v!)) problems.push(`${path}: fixes the side or a side view - the camera is three quarters round and comes from the mannequin, drop it`);
    if (pose && /[.!?]\s|\b(is|are|and then)\b/.test(v!)) problems.push(`${path}: looks like a sentence, want tags`);
  };
  lint("style.prefix", w.style.prefix, false);
  lint("style.negative", w.style.negative, false);
  for (const [id, slots] of Object.entries(w.poses)) for (const [k, v] of Object.entries(slots)) lint(`poses.${id}.${k}`, v, true);
  console.log(`prompt.yaml: ${total - empty} of ${total} slots filled, ${empty} empty, ${problems.length} problem(s)`);
  for (const p of problems) console.log(`  ${p}`);
  return problems.length;
}

const [cmd, ...args] = process.argv.slice(2);
if (cmd === "export") exportSlots(Number(args[0] ?? 40), args[1] ?? "slots");
else if (cmd === "merge" && args.length) merge(args);
else if (cmd === "check") process.exit(check() ? 1 : 0);
else console.log("pnpm slots export [size] [dir] | merge <file...> | check");
