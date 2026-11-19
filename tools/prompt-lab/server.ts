// Prompt lab: tune the Danbooru tags of every scene and close-up against ComfyUI, one scene at a time.
// The prompt is assembled by the game itself (promptFor), so what you see here is what the pack generator sends.
// Saving writes the scene's tags / negative into packages/base/content/prompt.yaml (tags:, negatives:) and rebuilds content.
// Takes (each generation: the words used, seeds, files, marks) live in tools/prompt-lab/data/<scene>/ (not in git).
//
//   Start-PromptLab.bat   or   pnpm exec tsx tools/prompt-lab/server.ts [--port 8195] [--comfy http://127.0.0.1:8188]
//   then http://127.0.0.1:8195
// A second lab for a night run on a rented box (own data, nothing written into the game):
//   ... server.ts --port 8196 --data tools/prompt-lab/night --comfy http://127.0.0.1:18188 --inflight 4 --nosave
import { createServer } from "node:http";
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { parse } from "yaml";
import { content, promptFor } from "../../packages/base/src";
import type { SceneDesc } from "../../packages/core/src";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const here = join(root, "tools", "prompt-lab");
const yamlFile = join(root, "packages", "base", "content", "prompt.yaml");
const argv = process.argv.slice(2);
const opt = (n: string, d: string) => { const i = argv.indexOf(`--${n}`); return i >= 0 && argv[i + 1] ? argv[i + 1]! : d; };
const PORT = Number(opt("port", "8195"));
const dataDir = resolve(root, opt("data", join("tools", "prompt-lab", "data")));
// pictures drawn at once (a rented 5090 keeps several in flight; the laptop one)
const INFLIGHT = Math.max(1, Number(opt("inflight", "1")));
// a lab that must not write into the game (the night run: Alexey looks first)
const NOSAVE = argv.includes("--nosave");
mkdirSync(dataDir, { recursive: true });

// ---------- settings (persisted) ----------
type Settings = { comfy: string; ckpt: string; loras: string; steps: number; cfg: number; sampler: string; scheduler: string; sceneSize: string; detailSize: string; cast: string };
const settingsFile = join(dataDir, "settings.json");
const settings: Settings = {
  comfy: opt("comfy", "http://127.0.0.1:8188"), ckpt: "waiIllustriousSDXL_v170.safetensors",
  loras: "sdxl_lightning_8step_lora.safetensors:1,sora_v2-000010.safetensors:0.7", steps: 9, cfg: 1.5, sampler: "euler_ancestral", scheduler: "simple",
  sceneSize: "832x1216", detailSize: "1024x1024", cast: "default",
  ...(existsSync(settingsFile) ? JSON.parse(readFileSync(settingsFile, "utf8")) : {}),
};
const saveJson = (f: string, v: unknown) => { mkdirSync(dirname(f), { recursive: true }); writeFileSync(f + ".part", JSON.stringify(v, null, 1)); renameSync(f + ".part", f); };

// ---------- the scenes and close-ups ----------
// type: the scene whose layout draws it (a portrait drawn on the layout of idle); close: drawn as a close-up of its own words
type Item = { id: string; kind: "scene" | "detail"; roles: string[]; room: string; tags: Record<string, string>; type?: string; close?: boolean; hands?: string[]; face?: boolean; about?: string; extra?: boolean };
const P = content.prompt as unknown as { tags: Record<string, string>; negatives: Record<string, string>; tags_wayward: Record<string, string>; poses: Record<string, Record<string, string>>; details: Record<string, string>; detail_hands: Record<string, string[]>; detail_with: Record<string, string[]> };
const items: Item[] = [];
for (const l of content.scenes) {
  const roles = [...new Set(l.figures.map((f) => f.role))];
  const act = content.acts.find((a) => a.scene === l.id);
  const husbandOnly = roles.includes("husband") && !roles.some((r) => r.startsWith("patron"));
  const room = l.id === "her_cook" ? "cafe.kitchen" : husbandOnly ? "home.bedroom" : act?.place === "private" ? "cafe.staff" : "cafe.hall";
  // what she wears by default: the work dress, a nightgown at home, nothing where the scene is about her being naked
  const outfit = /^(walk_naked|bath_walkin|bath_together)$/.test(l.id) ? "naked" : room.startsWith("home.") ? "nightgown" : "modest";
  items.push({ id: l.id, kind: "scene", roles, room, tags: roles.includes("wife") ? { outfit } : {} });
}
// close-ups: the list and who is in each from docs/INSERTS.md, in the neutral middle of their tags
for (const line of readFileSync(join(root, "docs", "INSERTS.md"), "utf8").split("\n").filter((x) => /^\| `/.test(x))) {
  const [, id, who, tags] = line.split("|").map((c) => c.trim().replace(/`/g, ""));
  const role = who!.split(/[ /]/)[0]!;
  items.push({ id: `detail_${id}`, kind: "detail", roles: [role], room: "any", tags: { ...(/\bsize\b/.test(tags!) ? { size: "2" } : {}), ...(/\btsize\b/.test(tags!) ? { tsize: "2" } : {}) } });
}
// what happens in each scene, in Russian (about.yaml), plus the game's own short name of the scene
const ABOUT = parse(readFileSync(join(here, "about.yaml"), "utf8")) as { scenes: Record<string, string>; details: Record<string, string> };
const RU = (content.locales as unknown as Record<string, Record<string, string>>).ru ?? {};
const aboutOf = (id: string) => items.find((x) => x.id === id)?.about ?? (id.startsWith("detail_") ? ABOUT.details[id.slice(7)] : ABOUT.scenes[id]) ?? "";
// keys the game has no line for yet (portraits, close-ups of an act): registered by a comparison, kept in <data>/items.json
const extraFile = join(dataDir, "items.json");
const extraTags: Record<string, string> = existsSync(extraFile) ? JSON.parse(readFileSync(extraFile, "utf8")).tags ?? {} : {};
for (const it of existsSync(extraFile) ? (JSON.parse(readFileSync(extraFile, "utf8")).items as Item[]) : []) items.push(it);
const saveExtra = () => saveJson(extraFile, { items: items.filter((x) => x.extra), tags: extraTags });
const ROOMS = Object.keys((content.look as unknown as { words: { room: Record<string, string> } }).words.room);

// per scene state: room / look overrides, marks, note, takes
type Take = { id: string; label?: string; at: string; tags: string; negative: string; positive: string; negativeFull: string; seeds: number[]; files: (string | null)[]; marks: (string | null)[]; settings: Partial<Settings>; room: string; size?: string };
type SceneState = { room?: string; look?: Record<string, string>; note?: string; status?: "todo" | "work" | "done"; takes: Take[]; savedTags?: string };
const stateFile = (id: string) => join(dataDir, id, "state.json");
const stateOf = (id: string): SceneState => (existsSync(stateFile(id)) ? JSON.parse(readFileSync(stateFile(id), "utf8")) : { takes: [] });
const saveState = (id: string, s: SceneState) => saveJson(stateFile(id), s);

// the words of an item: tags of a scene live in prompt.yaml (tags:), close-ups in details: (their own id line)
const tagsOf = (it: Item) => (it.extra ? extraTags[it.id] ?? "" : it.kind === "scene" ? P.tags[it.id] ?? "" : P.details[it.id.slice(7)] ?? "");
// how one picture is drawn: the item as it is, or a comparison variant that draws it another way
type Way = { roles?: string[]; close?: boolean; type?: string; hands?: string[]; face?: boolean; look?: Record<string, string>; cast?: Record<string, Record<string, string>> };
const wayOf = (it: Item, v: Way = {}): Required<Pick<Way, "roles" | "hands">> & Way => ({ roles: v.roles ?? it.roles, close: v.close ?? it.close ?? it.kind === "detail", type: v.type ?? it.type, hands: v.hands ?? it.hands ?? [], face: v.face ?? it.face, look: v.look, cast: v.cast });
// the key its words are read from while it is assembled: a scene (or the layout it borrows), a close-up line, or a scratch close-up
const NIGHT = "__variant";
function keyOf(it: Item, w: ReturnType<typeof wayOf>) {
  if (w.close) return { section: "details" as const, key: it.kind === "detail" && !it.extra && !w.type ? it.id.slice(7) : NIGHT };
  return { section: "tags" as const, key: w.type ?? it.id };
}
function descOf(it: Item, st: SceneState, w = wayOf(it)): SceneDesc {
  const k = keyOf(it, w);
  return { type: k.section === "details" ? `detail_${k.key}` : k.key, location: st.room ?? it.room, participants: w.roles.map((r) => ({ id: r, role: r })), tags: { ...it.tags, ...(st.look ?? {}), ...(w.look ?? {}) } };
}
function promptWith(it: Item, st: SceneState, tags: string, negative: string, v: Way = {}) {
  // try the edited words without saving: swap them in, assemble, put the old ones back
  const w = wayOf(it, v);
  const k = keyOf(it, w);
  const desc = descOf(it, st, w);
  const book = k.section === "details" ? P.details : P.tags;
  const keepT = book[k.key], keepN = P.negatives[desc.type], keepH = P.detail_hands[k.key], keepW = P.detail_with[k.key];
  book[k.key] = tags;
  P.negatives[desc.type] = negative;
  if (k.key === NIGHT) { P.detail_hands[NIGHT] = w.hands; P.detail_with[NIGHT] = []; }
  // card words changed for this picture only (her face in a portrait close-up, looser trousers, less body hair)
  const cast = content.casts.find((c) => c.id === settings.cast) ?? content.casts[0]!;
  const cards = cast as unknown as Record<string, Record<string, string>>;
  const kept: [Record<string, string>, string, string | undefined][] = [];
  const patch = (card: Record<string, string> | undefined, f: string, val: string) => { if (!card) return; kept.push([card, f, card[f]]); card[f] = val; };
  for (const [role, fields] of Object.entries(w.cast ?? {})) for (const [f, val] of Object.entries(fields)) patch(cards[role], f, val);
  if (w.face && cards.wife && !w.cast?.wife?.closeup) patch(cards.wife, "closeup", `${cards.wife.appearance}, ${cards.wife.body}`);
  try { return promptFor(desc, settings.cast); }
  finally {
    if (keepT === undefined) delete book[k.key]; else book[k.key] = keepT;
    if (keepN === undefined) delete P.negatives[desc.type]; else P.negatives[desc.type] = keepN;
    if (k.key === NIGHT) { if (keepH === undefined) delete P.detail_hands[NIGHT]; else P.detail_hands[NIGHT] = keepH; if (keepW === undefined) delete P.detail_with[NIGHT]; else P.detail_with[NIGHT] = keepW; }
    for (const [card, f, old] of kept.reverse()) { if (old === undefined) delete card[f]; else card[f] = old; }
  }
}

// ---------- saving into prompt.yaml ----------
const q = (s: string) => `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
function writeYaml(section: string, key: string, value: string) {
  const lines = readFileSync(yamlFile, "utf8").split("\n");
  const start = lines.findIndex((l) => l.startsWith(`${section}:`));
  if (start < 0) throw Error(`no ${section}: in prompt.yaml`);
  // the section's own lines: indented ones right after its header
  let end = start + 1;
  while (end < lines.length && lines[end]!.startsWith("  ")) end++;
  const body = lines.slice(start + 1, end);
  const keyRe = new RegExp(`^  "?${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"?:`);
  const at = body.findIndex((l) => keyRe.test(l));
  const line = `  ${section === "details" ? q(key) : key}: ${q(value)}`;
  if (!value.trim() && section === "negatives") { if (at >= 0) body.splice(at, 1); }
  else if (at >= 0) body[at] = line;
  else body.push(line);
  const header = section === "negatives" && !body.length ? `${section}: {}` : `${section}:`;
  lines.splice(start, end - start, header, ...body);
  writeFileSync(yamlFile, lines.join("\n"));
}
function rebuild() {
  const r = spawnSync(process.execPath, [join(root, "node_modules", "tsx", "dist", "cli.mjs"), join(root, "tools", "build-content.ts")], { cwd: root, encoding: "utf8" });
  return { ok: r.status === 0, out: (r.stdout + r.stderr).trim().split("\n").slice(-3).join("\n") };
}

// ---------- ComfyUI ----------
function graph(positive: string, negative: string, seed: number, size: string, prefix: string, use: Settings = settings) {
  const [w, h] = size.split("x").map(Number) as [number, number];
  const g: Record<string, { class_type: string; inputs: Record<string, unknown> }> = {};
  g.ckpt = { class_type: "CheckpointLoaderSimple", inputs: { ckpt_name: use.ckpt } };
  let model: [string, number] = ["ckpt", 0];
  let clip: [string, number] = ["ckpt", 1];
  use.loras.split(",").map((s) => s.trim()).filter(Boolean).forEach((s, i) => {
    const [name, wt] = s.split(":");
    g[`lora${i}`] = { class_type: "LoraLoader", inputs: { model, clip, lora_name: name, strength_model: Number(wt ?? 1), strength_clip: Number(wt ?? 1) } };
    model = [`lora${i}`, 0];
    clip = [`lora${i}`, 1];
  });
  g.skip = { class_type: "CLIPSetLastLayer", inputs: { clip, stop_at_clip_layer: -2 } };
  g.pos = { class_type: "CLIPTextEncode", inputs: { clip: ["skip", 0], text: positive } };
  g.neg = { class_type: "CLIPTextEncode", inputs: { clip: ["skip", 0], text: negative } };
  g.latent = { class_type: "EmptyLatentImage", inputs: { width: w, height: h, batch_size: 1 } };
  g.sample = { class_type: "KSampler", inputs: { model, positive: ["pos", 0], negative: ["neg", 0], latent_image: ["latent", 0], seed, steps: use.steps, cfg: use.cfg, sampler_name: use.sampler, scheduler: use.scheduler, denoise: 1 } };
  g.decode = { class_type: "VAEDecode", inputs: { samples: ["sample", 0], vae: ["ckpt", 2] } };
  g.save = { class_type: "SaveImage", inputs: { images: ["decode", 0], filename_prefix: `prompt-lab/${prefix}` } };
  return g;
}
type Job = { scene: string; take: string; i: number; status: "queued" | "drawing" | "done" | "error"; error?: string; promptId?: string; batch?: boolean; tries?: number };
const jobs: Job[] = [];
let running = 0;
let loaded = "";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function pump() {
  // one at a time on a laptop GPU, in order; whatever else is in the ComfyUI queue is left alone
  // up to INFLIGHT workers, each takes the next picture; one is enough on a laptop GPU
  if (running >= INFLIGHT) return;
  running++;
  try {
    // your own clicks go first; the batch over the scenes waits behind them
    // within the batch, stay on the checkpoint / LoRA set already loaded: switching reloads the model (tens of seconds)
    const setOf = (j: Job) => { const t = stateOf(j.scene).takes.find((x) => x.id === j.take); return `${t?.settings.ckpt ?? ""}|${t?.settings.loras ?? ""}`; };
    const next = () => {
      const mine = jobs.find((x) => x.status === "queued" && !x.batch);
      if (mine) return mine;
      const queued = jobs.filter((x) => x.status === "queued");
      const same = loaded ? queued.find((x) => setOf(x) === loaded) : undefined;
      const j = same ?? queued[0];
      if (j) loaded = setOf(j);
      return j;
    };
    for (let j = next(); j; j = next()) {
      j.status = "drawing";
      try { await draw(j); j.status = "done"; }
      catch (e) {
        // a dropped tunnel or a busy box: back into the queue a few times before it counts as an error
        j.tries = (j.tries ?? 0) + 1;
        j.error = (e as Error).message.slice(0, 300);
        if (j.tries < 6) { j.status = "queued"; await sleep(5000 * j.tries); } else j.status = "error";
      }
    }
  } finally { running--; }
}
const kick = () => { for (let i = running; i < INFLIGHT; i++) void pump(); };
async function draw(j: Job) {
  const st = stateOf(j.scene);
  const t = st.takes.find((x) => x.id === j.take)!;
  const it = items.find((x) => x.id === j.scene)!;
  // a take is drawn with the settings it was made with (a comparison of checkpoints / LoRAs keeps each its own)
  const use: Settings = { ...settings, ...t.settings, comfy: settings.comfy };
  const size = t.size ?? (it.kind === "detail" ? use.detailSize : use.sceneSize);
  const prefix = `${j.scene}_${j.take}_${j.i}`;
  const r = await fetch(`${settings.comfy}/prompt`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ prompt: graph(t.positive, t.negativeFull, t.seeds[j.i]!, size, prefix, use), client_id: "prompt-lab" }) });
  if (!r.ok) throw Error(`ComfyUI ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const { prompt_id } = (await r.json()) as { prompt_id: string };
  j.promptId = prompt_id;
  for (let waited = 0; waited < 15 * 60000; waited += 700) {
    await sleep(700);
    const h = (await (await fetch(`${settings.comfy}/history/${prompt_id}`)).json()) as Record<string, { status?: { status_str?: string }; outputs?: Record<string, { images?: { filename: string; subfolder: string; type: string }[] }> }>;
    const e = h[prompt_id];
    if (!e) continue;
    if (e.status?.status_str === "error") throw Error("ComfyUI error (see its console)");
    const img = Object.values(e.outputs ?? {}).flatMap((o) => o.images ?? [])[0];
    if (!img) continue;
    const qs = new URLSearchParams({ filename: img.filename, subfolder: img.subfolder, type: img.type });
    const file = `${j.take}_${j.i + 1}.png`;
    writeFileSync(join(dataDir, j.scene, file), Buffer.from(await (await fetch(`${settings.comfy}/view?${qs}`)).arrayBuffer()));
    const s2 = stateOf(j.scene);
    const t2 = s2.takes.find((x) => x.id === j.take)!;
    t2.files[j.i] = file;
    saveState(j.scene, s2);
    return;
  }
  throw Error("no picture after 15 min");
}


let takeN = 0;
function newTake(it: Item, nIn: number, tagsIn: string | undefined, negative: string, room: string | undefined, sameSeeds: boolean, batch: boolean, over?: { label: string; settings: Partial<Settings>; extra: string; seeds: number[]; way?: Way }) {
  const n = Math.max(1, Math.min(8, nIn));
  const st = stateOf(it.id);
  // a comparison variant's room is its own; a click in the lab moves the scene to that room
  if (room && !over) st.room = room;
  const at = room && over ? { ...st, room } : st;
  const tags = tagsIn ?? tagsOf(it);
  const base = promptWith(it, at, tags, negative, over?.way);
  const close = wayOf(it, over?.way).close;
  // a comparison variant may add its trigger words right after the quality tags
  const p = over?.extra ? { ...base, positive: base.positive.replace(/^(masterpiece, best quality, )?/, (m) => `${m}${over.extra}, `) } : base;
  // same seeds as the last take (to see what an edit changed) or fresh ones
  const last = st.takes[st.takes.length - 1];
  const seeds = over ? over.seeds.slice(0, n) : sameSeeds && last ? Array.from({ length: n }, (_, i) => last.seeds[i] ?? Math.floor(Math.random() * 2 ** 31)) : Array.from({ length: n }, () => Math.floor(Math.random() * 2 ** 31));
  const id = `t${Date.now().toString(36)}${(takeN++ % 1000).toString(36)}`;
  const { comfy: _c, ...used } = settings;
  st.takes.push({ id, label: over?.label, at: new Date().toISOString(), tags, negative, positive: p.positive, negativeFull: p.negative, seeds, files: seeds.map(() => null), marks: seeds.map(() => null), settings: { ...used, ...(over?.settings ?? {}) }, room: at.room ?? it.room, size: close ? settings.detailSize : settings.sceneSize });
  st.status = "work"; // a new take means the scene is being looked at again, even if it was marked done
  saveState(it.id, st);
  seeds.forEach((_, i) => jobs.push({ scene: it.id, take: id, i, status: "queued", batch }));
  kick();
  return id;
}
// pictures still owed after a restart (a closed window, a crash): put them back in the queue
for (const it of items) {
  if (!existsSync(stateFile(it.id))) continue;
  for (const t of stateOf(it.id).takes) t.files.forEach((f, i) => { if (!f) jobs.push({ scene: it.id, take: t.id, i, status: "queued", batch: true }); });
}
if (jobs.length) { console.log(`resuming ${jobs.length} pictures left from last time`); kick(); }
// ---------- HTTP ----------
const json = (res: import("node:http").ServerResponse, code: number, v: unknown) => { res.writeHead(code, { "content-type": "application/json; charset=utf-8" }); res.end(JSON.stringify(v)); };
const body = (req: import("node:http").IncomingMessage) => new Promise<Record<string, unknown>>((ok) => { let b = ""; req.on("data", (c) => (b += c)); req.on("end", () => ok(b ? JSON.parse(b) : {})); });
const SAFE = /^[a-z0-9_]+$/;

createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://x");
  const r = url.pathname;
  try {
    if (r === "/") { res.writeHead(200, { "content-type": "text/html; charset=utf-8" }); res.end(readFileSync(join(here, "index.html"))); return; }
    // the morning page of a night run (night-report.mjs writes it into the data folder)
    if (r === "/report") { const f = join(dataDir, "report.html"); res.writeHead(existsSync(f) ? 200 : 404, { "content-type": "text/html; charset=utf-8" }); res.end(existsSync(f) ? readFileSync(f) : "no report yet: node tools/prompt-lab/night-report.mjs"); return; }
    if (r === "/sheet") { const f = join(dataDir, "_sheets", (url.searchParams.get("f") ?? "").replace(/[^\w.-]/g, "")); if (!existsSync(f)) return json(res, 404, { error: "no sheet" }); res.writeHead(200, { "content-type": "image/jpeg" }); res.end(readFileSync(f)); return; }
    if (r === "/api/list") {
      return json(res, 200, items.map((it) => {
        const st = stateOf(it.id);
        const marks = st.takes.flatMap((t) => t.marks);
        return { id: it.id, name: RU[`scene.${it.id}`] ?? "", about: aboutOf(it.id), kind: it.kind, roles: it.roles, status: st.status ?? (st.takes.length ? "work" : "todo"), takes: st.takes.length, ok: marks.filter((m) => m === "ok").length, bad: marks.filter((m) => m === "bad").length, note: !!st.note };
      }));
    }
    if (r === "/api/scene") {
      const id = url.searchParams.get("id") ?? "";
      const it = items.find((x) => x.id === id);
      if (!it) return json(res, 404, { error: "no such scene" });
      const st = stateOf(id);
      const tags = tagsOf(it), negative = P.negatives[id] ?? "";
      const p = promptWith(it, st, tags, negative);
      return json(res, 200, { ...it, name: RU[`scene.${it.id}`] ?? "", about: aboutOf(it.id), room: st.room ?? it.room, look: { ...it.tags, ...(st.look ?? {}) }, rooms: ROOMS, tags, negative, positive: p.positive, negativeFull: p.negative, rules: p.rules ?? [], wayward: P.tags_wayward[id] ?? "", grok: P.poses[id] ?? {}, note: st.note ?? "", status: st.status ?? "todo", takes: [...st.takes].reverse() });
    }
    if (r === "/api/preview" && req.method === "POST") {
      const b = await body(req);
      const it = items.find((x) => x.id === b.id);
      if (!it) return json(res, 404, { error: "no such scene" });
      const st = { ...stateOf(it.id), room: String(b.room ?? "") || undefined };
      const p = promptWith(it, st, String(b.tags ?? ""), String(b.negative ?? ""));
      return json(res, 200, { positive: p.positive, negativeFull: p.negative, rules: p.rules ?? [] });
    }
    if (r === "/api/generate" && req.method === "POST") {
      const b = await body(req);
      const it = items.find((x) => x.id === b.id);
      if (!it || !SAFE.test(it.id)) return json(res, 404, { error: "no such scene" });
      const id = newTake(it, Number(b.n) || 1, b.tags === undefined ? undefined : String(b.tags), String(b.negative ?? P.negatives[it.id] ?? ""), b.room ? String(b.room) : undefined, !!b.sameSeeds, false);
      return json(res, 200, { take: id });
    }
    if (r === "/api/batch" && req.method === "POST") {
      // N frames for every scene (or close-up) that has no takes yet, in list order, behind your own clicks
      const b = await body(req);
      const kind = b.kind === "detail" ? "detail" : b.kind === "all" ? null : "scene";
      // ids: an explicit list (e.g. the weak scenes to redo); otherwise every scene of the kind that has no takes yet
      const ids = Array.isArray(b.ids) ? (b.ids as string[]) : null;
      const todo = ids ? items.filter((it) => ids.includes(it.id)) : items.filter((it) => (!kind || it.kind === kind) && stateOf(it.id).takes.length === 0);
      for (const it of todo) newTake(it, Number(b.n) || 4, undefined, P.negatives[it.id] ?? "", undefined, false, true);
      return json(res, 200, { scenes: todo.length, pictures: todo.length * (Number(b.n) || 4) });
    }
    if (r === "/api/compare" && req.method === "POST") {
      // the same scenes and seeds under several checkpoints / LoRA sets: one labelled take per variant
      // a variant may also draw the scene another way: its own tags / negative / room, other figures, as a close-up, on another layout
      type V = Way & { label: string; ckpt?: string; loras?: string; extra?: string; tags?: string; negative?: string; room?: string };
      const b = (await body(req)) as { ids: string[]; n?: number; first?: boolean; sameSeeds?: boolean; seeds?: number[]; variants: V[]; add?: (Item & { tags_text?: string })[]; plan?: { id: string; seeds?: number[]; variants: V[] }[] };
      const n = Number(b.n) || 4;
      let takes = 0;
      // new keys (portraits, close-ups of an act): kept in this lab only, never in the game
      for (const a of b.add ?? []) {
        if (!SAFE.test(a.id) || items.some((x) => x.id === a.id && !x.extra)) continue;
        const { tags_text, ...it } = a;
        const i = items.findIndex((x) => x.id === a.id);
        const item: Item = { ...it, extra: true, tags: it.tags ?? {} };
        if (i >= 0) items[i] = item; else items.push(item);
        extraTags[a.id] = tags_text ?? "";
      }
      if (b.add?.length) saveExtra();
      const one = (it: Item, variants: V[], given?: number[]) => {
        const prev = stateOf(it.id).takes.at(-1);
        const seeds = given?.length ? given.slice(0, n) : b.sameSeeds && prev ? prev.seeds.slice(0, n) : Array.from({ length: n }, () => Math.floor(Math.random() * 2 ** 31));
        for (const v of variants) {
          const over: Partial<Settings> = {};
          if (v.ckpt) over.ckpt = v.ckpt;
          if (v.loras !== undefined) over.loras = v.loras;
          const { label, ckpt: _k, loras: _l, extra, tags, negative, room, ...way } = v;
          newTake(it, n, tags, negative ?? P.negatives[it.id] ?? "", room, false, !b.first, { label, settings: over, extra: extra ?? "", seeds, way });
          takes++;
        }
      };
      // plan: each scene with its own variants, all on the same seeds
      for (const e of b.plan ?? []) { const it = items.find((x) => x.id === e.id); if (it) one(it, e.variants, e.seeds); }
      if (b.plan) return json(res, 200, { takes, pictures: takes * n });
      for (const it of items.filter((x) => b.ids.includes(x.id))) {
        // sameSeeds: the seeds of the scene's last take, to add a variant to a comparison already drawn
        const prev = stateOf(it.id).takes.at(-1);
        const seeds = b.sameSeeds && prev ? prev.seeds.slice(0, n) : Array.from({ length: n }, () => Math.floor(Math.random() * 2 ** 31));
        for (const v of b.variants) {
          const over: Partial<Settings> = {};
          if (v.ckpt) over.ckpt = v.ckpt;
          if (v.loras !== undefined) over.loras = v.loras;
          newTake(it, n, undefined, P.negatives[it.id] ?? "", undefined, false, !b.first, { label: v.label, settings: over, extra: v.extra ?? "", seeds }); // first: ahead of the running batch
          takes++;
        }
      }
      return json(res, 200, { takes, pictures: takes * n });
    }
    if (r === "/api/batch/cancel" && req.method === "POST") {
      // drop the batch pictures not drawn yet; takes left without a single picture are removed, drawn ones stay
      const dropped = jobs.filter((j) => j.status === "queued" && j.batch);
      for (const j of dropped) j.status = "error", j.error = "cancelled";
      for (const id of new Set(dropped.map((j) => j.scene))) {
        const st = stateOf(id);
        st.takes = st.takes.filter((t) => t.files.some(Boolean) || jobs.some((j) => j.take === t.id && (j.status === "queued" || j.status === "drawing")));
        st.takes.forEach((t) => { const keep = t.files.map((f, i) => !!f || jobs.some((j) => j.take === t.id && j.i === i && j.status === "drawing")); t.seeds = t.seeds.filter((_, i) => keep[i]); t.files = t.files.filter((_, i) => keep[i]); t.marks = t.marks.filter((_, i) => keep[i]); });
        if (!st.takes.length && st.status === "work") st.status = "todo";
        saveState(id, st);
      }
      return json(res, 200, { cancelled: dropped.length });
    }
    if (r === "/api/jobs") {
      const live = jobs.filter((j) => j.status === "queued" || j.status === "drawing");
      const drawingAll = live.filter((j) => j.status === "drawing").length;
      const errs = jobs.filter((j) => j.status === "error" && j.error !== "cancelled").slice(-3);
      let comfyOk = false;
      try { comfyOk = (await fetch(`${settings.comfy}/system_stats`, { signal: AbortSignal.timeout(1500) })).ok; } catch {}
      const done = jobs.filter((j) => j.status === "done").length;
      return json(res, 200, { done, total: jobs.length, nosave: NOSAVE, batch: live.filter((j) => j.batch).length, queued: live.filter((j) => j.status === "queued").length, drawing: live.find((j) => j.status === "drawing") ?? null, drawingAll, errors: errs, comfyOk, comfy: settings.comfy });
    }
    if (r === "/api/mark" && req.method === "POST") {
      const b = await body(req);
      const st = stateOf(String(b.id));
      const t = st.takes.find((x) => x.id === b.take);
      if (!t) return json(res, 404, { error: "no take" });
      t.marks[Number(b.i)] = b.mark === "ok" || b.mark === "bad" ? String(b.mark) : null;
      saveState(String(b.id), st);
      return json(res, 200, { ok: true });
    }
    if (r === "/api/note" && req.method === "POST") {
      const b = await body(req);
      const st = stateOf(String(b.id));
      if (b.note !== undefined) st.note = String(b.note);
      if (b.status) st.status = b.status as SceneState["status"];
      if (b.look) st.look = b.look as Record<string, string>;
      saveState(String(b.id), st);
      return json(res, 200, { ok: true });
    }
    if (r === "/api/save" && req.method === "POST" && NOSAVE) return json(res, 403, { error: "this lab does not write into the game (--nosave)" });
    if (r === "/api/save" && req.method === "POST") {
      // into the game: tags (or the close-up's line) and the scene's negative in prompt.yaml, then rebuild content
      const b = await body(req);
      const it = items.find((x) => x.id === b.id);
      if (!it) return json(res, 404, { error: "no such scene" });
      const tags = String(b.tags ?? "").trim(), negative = String(b.negative ?? "").trim();
      if (it.kind === "scene") { writeYaml("tags", it.id, tags); P.tags[it.id] = tags; }
      else { writeYaml("details", it.id.slice(7), tags); P.details[it.id.slice(7)] = tags; }
      writeYaml("negatives", it.id, negative);
      if (negative) P.negatives[it.id] = negative; else delete P.negatives[it.id];
      const st = stateOf(it.id);
      st.savedTags = tags;
      saveState(it.id, st);
      return json(res, 200, rebuild());
    }
    if (r === "/api/settings") {
      if (req.method === "POST") { Object.assign(settings, await body(req)); saveJson(settingsFile, settings); }
      return json(res, 200, settings);
    }
    if (r === "/img") {
      const id = url.searchParams.get("id") ?? "", f = url.searchParams.get("f") ?? "";
      if (!SAFE.test(id) || !/^[\w.-]+\.png$/.test(f)) return json(res, 400, { error: "bad path" });
      const p = join(dataDir, id, f);
      if (!existsSync(p)) return json(res, 404, { error: "no file" });
      res.writeHead(200, { "content-type": "image/png", "cache-control": "max-age=86400" });
      res.end(readFileSync(p));
      return;
    }
    json(res, 404, { error: "not found" });
  } catch (e) {
    json(res, 500, { error: (e as Error).message });
  }
}).listen(PORT, "127.0.0.1", () => console.log(`prompt lab: http://127.0.0.1:${PORT}  (ComfyUI ${settings.comfy}, ${items.length} scenes and close-ups, data in ${dataDir})`));
