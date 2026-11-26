// The event catalog for mods (27.11): every event the game emits, who emits it, who listens, and the payload keys it is sent with.
// Read from the code itself, so it cannot drift: a test (packages/bots/test/events.test.ts) fails when docs/events.json is out of date.
//   pnpm events   -> docs/events.json + docs/EVENTS.md
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";

export type EventInfo = { emittedIn: string[]; listenedIn: string[]; payload: string[] };
const ROOT = join(import.meta.dirname, "..");
const files = (dir: string): string[] => readdirSync(dir).flatMap((n) => { const p = join(dir, n); return statSync(p).isDirectory() ? (n === "node_modules" || n === "generated" ? [] : files(p)) : p.endsWith(".ts") && !p.endsWith(".test.ts") ? [p] : []; });

export function scanEvents(): Record<string, EventInfo> {
  const out: Record<string, EventInfo> = {};
  const get = (k: string) => (out[k] ??= { emittedIn: [], listenedIn: [], payload: [] });
  for (const pkg of ["core", "base"]) for (const f of files(join(ROOT, "packages", pkg, "src"))) {
    const src = readFileSync(f, "utf8");
    const rel = relative(join(ROOT, "packages"), f).replace(/\\/g, "/");
    for (const m of src.matchAll(/emit\("([a-z_:.-]+)"(?:,\s*\{([^}]*)\})?/g)) {
      const e = get(m[1]!);
      if (!e.emittedIn.includes(rel)) e.emittedIn.push(rel);
      for (const k of (m[2] ?? "").split(",").map((x) => x.trim().split(/[:\s]/)[0]!).filter((x) => /^\w+$/.test(x))) if (!e.payload.includes(k)) e.payload.push(k);
    }
    for (const m of src.matchAll(/events\.on\(\s*"([a-z_:.-]+)"/g)) { const e = get(m[1]!); if (!e.listenedIn.includes(rel)) e.listenedIn.push(rel); }
  }
  for (const e of Object.values(out)) { e.emittedIn.sort(); e.listenedIn.sort(); e.payload.sort(); }
  return Object.fromEntries(Object.entries(out).sort(([a], [b]) => a.localeCompare(b)));
}

if (process.argv[1]?.endsWith("events.ts")) {
  const ev = scanEvents();
  writeFileSync(join(ROOT, "docs/events.json"), JSON.stringify(ev, null, 1) + "\n");
  const md = ["# События игры (для модов)", "", "Сгенерировано `pnpm events` из кода (тест следит, чтобы список был свежим). Подписка: `api.events.on(\"имя\", (ctx, e) => ...)`, данные в `e.payload`.", "", "| событие | данные (payload) | кто шлёт | кто слушает |", "|---|---|---|---|",
    ...Object.entries(ev).map(([k, e]) => `| \`${k}\` | ${e.payload.join(", ") || "-"} | ${e.emittedIn.map((x) => x.split("/").pop()).join(", ") || "-"} | ${e.listenedIn.map((x) => x.split("/").pop()).join(", ") || "-"} |`)];
  writeFileSync(join(ROOT, "docs/EVENTS.md"), md.join("\n") + "\n");
  console.log(`${Object.keys(ev).length} events -> docs/events.json, docs/EVENTS.md`);
}
