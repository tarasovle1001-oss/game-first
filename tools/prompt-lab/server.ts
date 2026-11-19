// Prompt lab: tune the Danbooru tags of every scene and close-up against ComfyUI, one scene at a time.
// The prompt is assembled by the game itself (promptFor), so what you see here is what the pack generator sends.
// Saving writes the scene's tags / negative into packages/base/content/prompt.yaml (tags:, negatives:) and rebuilds content.
// Takes (each generation: the words used, seeds, files, marks) live in tools/prompt-lab/data/<scene>/ (not in git).
//
//   Start-PromptLab.bat   or   pnpm exec tsx tools/prompt-lab/server.ts [--port 8195] [--comfy http://127.0.0.1:8188]
//   then http://127.0.0.1:8195
import { createServer } from "node:http";
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { parse } from "yaml";
import { content, promptFor } from "../../packages/base/src";
import type { SceneDesc } from "../../packages/core/src";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const here = join(root, "tools", "prompt-lab");
const dataDir = join(here, "data");
const yamlFile = join(root, "packages", "base", "content", "prompt.yaml");
const argv = process.argv.slice(2);
const opt = (n: string, d: string) => { const i = argv.indexOf(`--${n}`); return i >= 0 && argv[i + 1] ? argv[i + 1]! : d; };
const PORT = Number(opt("port", "8195"));
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
type Item = { id: string; kind: "scene" | "detail"; roles: string[]; room: string; tags: Record<string, string> };
const P = content.prompt as unknown as { tags: Record<string, string>; negatives: Record<string, string>; tags_wayward: Record<string, string>; poses: Record<string, Record<string, string>>; details: Record<string, string> };
const items: Item[] = [];
for (const l of content.scenes) {
  const roles = [...new Set(l.figures.map((f) => f.role))];
  const act = content.acts.find((a) => a.scene === l.id);
  const husbandOnly = roles.includes("husband") && !roles.some((r) => r.startsWith("patron"));
  const room = husbandOnly ? "home.bedroom" : act?.place === "private" ? "cafe.staff" : "cafe.hall";
  items.push({ id: l.id, kind: "scene", roles, room, tags: roles.includes("wife") ? { outfit: room.startsWith("home.") ? "nightgown" : "modest" } : {} });
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
const aboutOf = (id: string) => (id.startsWith("detail_") ? ABOUT.details[id.slice(7)] : ABOUT.scenes[id]) ?? "";
const ROOMS = Object.keys((content.look as unknown as { words: { room: Record<string, string> } }).words.room);

// per scene state: room / look overrides, marks, note, takes
type Take = { id: string; at: string; tags: string; negative: string; positive: string; negativeFull: string; seeds: number[]; files: (string | null)[]; marks: (string | null)[]; settings: Partial<Settings>; room: string };
type SceneState = { room?: string; look?: Record<string, string>; note?: string; status?: "todo" | "work" | "done"; takes: Take[]; savedTags?: string };
const stateFile = (id: string) => join(dataDir, id, "state.json");
const stateOf = (id: string): SceneState => (existsSync(stateFile(id)) ? JSON.parse(readFileSync(stateFile(id), "utf8")) : { takes: [] });
const saveState = (id: string, s: SceneState) => saveJson(stateFile(id), s);

// the words of an item: tags of a scene live in prompt.yaml (tags:), close-ups in details: (their own id line)
const tagsOf = (it: Item) => (it.kind === "scene" ? P.tags[it.id] ?? "" : P.details[it.id.slice(7)] ?? "");
function descOf(it: Item, st: SceneState): SceneDesc {
  return { type: it.id, location: st.room ?? it.room, participants: it.roles.map((r) => ({ id: r, role: r })), tags: { ...it.tags, ...(st.look ?? {}) } };
}
function promptWith(it: Item, st: SceneState, tags: string, negative: string) {
  // try the edited words without saving: swap them in, assemble, put the old ones back
  const keepT = it.kind === "scene" ? P.tags[it.id] : P.details[it.id.slice(7)];
  const keepN = P.negatives[it.id];
  if (it.kind === "scene") P.tags[it.id] = tags; else P.details[it.id.slice(7)] = tags;
  P.negatives[it.id] = negative;
  try { return promptFor(descOf(it, st), settings.cast); }
  finally {
    if (it.kind === "scene") P.tags[it.id] = keepT!; else P.details[it.id.slice(7)] = keepT!;
    if (keepN === undefined) delete P.negatives[it.id]; else P.negatives[it.id] = keepN;
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
function graph(positive: string, negative: string, seed: number, size: string, prefix: string) {
  const [w, h] = size.split("x").map(Number) as [number, number];
  const g: Record<string, { class_type: string; inputs: Record<string, unknown> }> = {};
  g.ckpt = { class_type: "CheckpointLoaderSimple", inputs: { ckpt_name: settings.ckpt } };
  let model: [string, number] = ["ckpt", 0];
  let clip: [string, number] = ["ckpt", 1];
  settings.loras.split(",").map((s) => s.trim()).filter(Boolean).forEach((s, i) => {
    const [name, wt] = s.split(":");
    g[`lora${i}`] = { class_type: "LoraLoader", inputs: { model, clip, lora_name: name, strength_model: Number(wt ?? 1), strength_clip: Number(wt ?? 1) } };
    model = [`lora${i}`, 0];
    clip = [`lora${i}`, 1];
  });
  g.skip = { class_type: "CLIPSetLastLayer", inputs: { clip, stop_at_clip_layer: -2 } };
  g.pos = { class_type: "CLIPTextEncode", inputs: { clip: ["skip", 0], text: positive } };
  g.neg = { class_type: "CLIPTextEncode", inputs: { clip: ["skip", 0], text: negative } };
  g.latent = { class_type: "EmptyLatentImage", inputs: { width: w, height: h, batch_size: 1 } };
  g.sample = { class_type: "KSampler", inputs: { model, positive: ["pos", 0], negative: ["neg", 0], latent_image: ["latent", 0], seed, steps: settings.steps, cfg: settings.cfg, sampler_name: settings.sampler, scheduler: settings.scheduler, denoise: 1 } };
  g.decode = { class_type: "VAEDecode", inputs: { samples: ["sample", 0], vae: ["ckpt", 2] } };
  g.save = { class_type: "SaveImage", inputs: { images: ["decode", 0], filename_prefix: `prompt-lab/${prefix}` } };
  return g;
}
type Job = { scene: string; take: string; i: number; status: "queued" | "drawing" | "done" | "error"; error?: string; promptId?: string };
const jobs: Job[] = [];
let running = 0;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function pump() {
  // one at a time on a laptop GPU, in order; whatever else is in the ComfyUI queue is left alone
  if (running) return;
  running = 1;
  try {
    for (let j = jobs.find((x) => x.status === "queued"); j; j = jobs.find((x) => x.status === "queued")) {
      j.status = "drawing";
      try { await draw(j); j.status = "done"; } catch (e) { j.status = "error"; j.error = (e as Error).message.slice(0, 300); }
    }
  } finally { running = 0; }
}
async function draw(j: Job) {
  const st = stateOf(j.scene);
  const t = st.takes.find((x) => x.id === j.take)!;
  const it = items.find((x) => x.id === j.scene)!;
  const size = it.kind === "detail" ? settings.detailSize : settings.sceneSize;
  const prefix = `${j.scene}_${j.take}_${j.i}`;
  const r = await fetch(`${settings.comfy}/prompt`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ prompt: graph(t.positive, t.negativeFull, t.seeds[j.i]!, size, prefix), client_id: "prompt-lab" }) });
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

// ---------- HTTP ----------
const json = (res: import("node:http").ServerResponse, code: number, v: unknown) => { res.writeHead(code, { "content-type": "application/json; charset=utf-8" }); res.end(JSON.stringify(v)); };
const body = (req: import("node:http").IncomingMessage) => new Promise<Record<string, unknown>>((ok) => { let b = ""; req.on("data", (c) => (b += c)); req.on("end", () => ok(b ? JSON.parse(b) : {})); });
const SAFE = /^[a-z0-9_]+$/;

createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://x");
  const r = url.pathname;
  try {
    if (r === "/") { res.writeHead(200, { "content-type": "text/html; charset=utf-8" }); res.end(readFileSync(join(here, "index.html"))); return; }
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
      const n = Math.max(1, Math.min(8, Number(b.n) || 1));
      const st = stateOf(it.id);
      if (b.room) st.room = String(b.room);
      const tags = String(b.tags ?? tagsOf(it)), negative = String(b.negative ?? "");
      const p = promptWith(it, st, tags, negative);
      // same seeds as the last take (to see what an edit changed) or fresh ones
      const last = st.takes[st.takes.length - 1];
      const seeds = b.sameSeeds && last ? Array.from({ length: n }, (_, i) => last.seeds[i] ?? Math.floor(Math.random() * 2 ** 31)) : Array.from({ length: n }, () => Math.floor(Math.random() * 2 ** 31));
      const id = `t${Date.now().toString(36)}`;
      const { comfy: _c, ...used } = settings;
      st.takes.push({ id, at: new Date().toISOString(), tags, negative, positive: p.positive, negativeFull: p.negative, seeds, files: seeds.map(() => null), marks: seeds.map(() => null), settings: used, room: st.room ?? it.room });
      if (!st.status || st.status === "todo") st.status = "work";
      saveState(it.id, st);
      seeds.forEach((_, i) => jobs.push({ scene: it.id, take: id, i, status: "queued" }));
      void pump();
      return json(res, 200, { take: id });
    }
    if (r === "/api/jobs") {
      const live = jobs.filter((j) => j.status === "queued" || j.status === "drawing");
      const errs = jobs.filter((j) => j.status === "error").slice(-3);
      let comfyOk = false;
      try { comfyOk = (await fetch(`${settings.comfy}/system_stats`, { signal: AbortSignal.timeout(1500) })).ok; } catch {}
      return json(res, 200, { queued: live.filter((j) => j.status === "queued").length, drawing: live.find((j) => j.status === "drawing") ?? null, errors: errs, comfyOk, comfy: settings.comfy });
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
