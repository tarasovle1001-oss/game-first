// YAML -> validation -> packages/base/src/generated/content.json
// Any problem here fails the build, so broken content never reaches the game.
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";
import type { ZodTypeAny, z } from "zod";
import { balanceSchema, nameSchema, patronTypeSchema, zoneFileSchema } from "../packages/base/src/content/schema";
import type { Content, Room } from "../packages/base/src/content/schema";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const base = join(root, "packages/base");
const errors: string[] = [];
const rel = (p: string) => relative(root, p);

function yamlFiles(dir: string): string[] {
  try {
    return readdirSync(dir)
      .filter((f) => f.endsWith(".yaml"))
      .sort()
      .map((f) => join(dir, f));
  } catch {
    return [];
  }
}

function load<S extends ZodTypeAny>(file: string, schema: S): z.infer<S> | null {
  let raw: unknown;
  try {
    raw = parse(readFileSync(file, "utf8"));
  } catch (e) {
    errors.push(`${rel(file)}: ${(e as Error).message}`);
    return null;
  }
  const res = schema.safeParse(raw);
  if (!res.success) {
    for (const issue of res.error.issues) errors.push(`${rel(file)}: ${issue.path.join(".") || "(root)"}: ${issue.message}`);
    return null;
  }
  return res.data;
}

function unique<T extends { id: string }>(items: T[], kind: string) {
  const seen = new Set<string>();
  for (const it of items) {
    if (seen.has(it.id)) errors.push(`${kind} "${it.id}" is defined twice`);
    seen.add(it.id);
  }
}

// --- locations ---
const rooms: Room[] = [];
for (const file of yamlFiles(join(base, "content/locations"))) {
  const zone = load(file, zoneFileSchema);
  if (zone) rooms.push(...zone.rooms.map((r) => ({ ...r, zone: zone.zone })));
}
unique(rooms, "room");
const roomIds = new Map(rooms.map((r) => [r.id, r]));
for (const r of rooms)
  for (const link of r.links) {
    const other = roomIds.get(link);
    if (!other) errors.push(`room "${r.id}" links to unknown room "${link}"`);
    else if (!other.links.includes(r.id)) errors.push(`room "${r.id}" links to "${link}", but not the other way round`);
  }

// --- patrons, names, balance ---
const patronTypes = yamlFiles(join(base, "content/patron-types")).flatMap((f) => {
  const t = load(f, patronTypeSchema);
  return t ? [t] : [];
});
unique(patronTypes, "patron type");
const names = load(join(base, "content/names.yaml"), nameSchema.array().min(1)) ?? [];
const balance = load(join(base, "content/balance.yaml"), balanceSchema);

// --- locales ---
const locales: Record<string, Record<string, string>> = {};
for (const file of yamlFiles(join(base, "locales"))) {
  const lang = file.replace(/^.*[\\/]/, "").replace(".yaml", "");
  const raw = parse(readFileSync(file, "utf8")) as Record<string, unknown>;
  const dict: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw ?? {})) {
    if (typeof v !== "string") errors.push(`${rel(file)}: "${k}" must be a string`);
    else dict[k] = v;
  }
  locales[lang] = dict;
}
const langs = Object.keys(locales);
if (!locales.en) errors.push("locales/en.yaml is missing");
for (const a of langs)
  for (const b of langs)
    if (a !== b) for (const key of Object.keys(locales[a]!)) if (!(key in locales[b]!)) errors.push(`locale "${b}" misses key "${key}" (present in "${a}")`);
const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(",");
for (const lang of langs)
  for (const [key, text] of Object.entries(locales[lang]!)) {
    const en = locales.en?.[key];
    if (en !== undefined && placeholders(en) !== placeholders(text)) errors.push(`locale "${lang}" key "${key}": placeholders differ from en`);
  }

// --- every content id needs its texts ---
const need = (key: string) => {
  if (locales.en && !(key in locales.en)) errors.push(`missing text key "${key}"`);
};
rooms.forEach((r) => need(`loc.${r.id}`));
new Set(rooms.map((r) => r.zone)).forEach((z) => need(`ui.zone.${z}`));
patronTypes.forEach((t) => need(`patron.type.${t.id}`));

if (errors.length > 0 || !balance) {
  console.error(`content: ${errors.length} problem(s)`);
  for (const e of errors) console.error(`  ${e}`);
  process.exit(1);
}

const content: Content = { rooms, patronTypes, names, balance, locales };
const out = join(base, "src/generated/content.json");
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(content, null, 1));
console.log(
  `content ok: ${rooms.length} rooms, ${patronTypes.length} patron types, ${names.length} names, ${langs.map((l) => `${l}=${Object.keys(locales[l]!).length}`).join(" ")} keys`,
);
