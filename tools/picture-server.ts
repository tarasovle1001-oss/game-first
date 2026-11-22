// Picture server: draws the game's pictures on your own ComfyUI while you play, and keeps them.
// The game (even opened as a file) asks it for a picture by key with the prompt it built itself (promptFor);
// every heroine gets her own folder named after her card and the version of her look (cardFolder),
// laid out as a picture pack (pack.json, wife.json, <key>.png), so the folder is also a pack and the input of a rented run.
//
//   Start-Generator.bat   or   pnpm exec tsx tools/picture-server.ts [--port 8197] [--comfy http://127.0.0.1:8188] [--dir pictures]
//
// API (CORS open, local only): GET /api/status, GET /api/list?folder=, POST /api/card {folder, card},
// POST /api/draw {folder, file, positive, negative, size, seed?, replace?, lora?: {file, weight}} -> {id}, GET /api/job?id=, POST /api/cancel {folder?},
// GET /pic/<folder>/<file>.png
import { createServer } from "node:http";
import type { ServerResponse, IncomingMessage } from "node:http";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync, renameSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { comfyAlive, comfyRender, DEFAULT_DRAW } from "./gen/comfy";
import type { DrawSettings } from "./gen/comfy";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2);
const opt = (n: string, d: string) => {
  const i = argv.indexOf(`--${n}`);
  return i >= 0 && argv[i + 1] ? argv[i + 1]! : d;
};
const PORT = Number(opt("port", "8197"));
const COMFY = opt("comfy", "http://127.0.0.1:8188");
const DIR = resolve(root, opt("dir", "pictures"));
const INFLIGHT = Math.max(1, Number(opt("inflight", "1")));
mkdirSync(DIR, { recursive: true });

// drawing settings: the lab's flow; pictures/settings.json overrides any of them
const settingsFile = join(DIR, "settings.json");
const draw: DrawSettings = { ...DEFAULT_DRAW, ...(existsSync(settingsFile) ? (JSON.parse(readFileSync(settingsFile, "utf8")) as Partial<DrawSettings>) : {}) };

const FOLDER = /^h_[a-z0-9]{4,16}(_[a-z0-9]{1,10})?$|^default$/;
const FILE = /^[\w.+=,~-]{1,220}$/;
const SIZE = /^\d{3,4}x\d{3,4}$/;

type Job = { id: string; folder: string; file: string; positive: string; negative: string; size: string; seed: number; lora?: string; state: "queued" | "drawing" | "done" | "error"; error?: string; at: number };
const jobs = new Map<string, Job>();
const queue: Job[] = []; // newest request first: what is on screen now matters more than what was a minute ago
let drawing = 0;
let n = 0;

const pathOf = (folder: string, file: string) => join(DIR, folder, `${file}.png`);
const urlOf = (folder: string, file: string) => `/pic/${folder}/${encodeURIComponent(file)}.png`;

function cors(res: ServerResponse) {
  res.setHeader("access-control-allow-origin", "*");
  res.setHeader("access-control-allow-methods", "GET, POST, OPTIONS");
  res.setHeader("access-control-allow-headers", "content-type");
  // a page opened from a file or from the internet may reach this local server (Chrome private network access)
  res.setHeader("access-control-allow-private-network", "true");
}
function json(res: ServerResponse, code: number, body: unknown) {
  res.writeHead(code, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}
async function body(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  const s = Buffer.concat(chunks).toString("utf8");
  return s ? (JSON.parse(s) as Record<string, unknown>) : {};
}

async function pump() {
  if (drawing >= INFLIGHT) return;
  drawing++;
  try {
    for (let j = queue.shift(); j; j = queue.shift()) {
      if (j.state !== "queued") continue;
      j.state = "drawing";
      try {
        // a scene with a LoRA of its own (prompt.yaml: loras): loaded on top of the usual ones, for this picture only
        const png = await comfyRender(COMFY, j.positive, j.negative, j.seed, j.size, `test-city/${j.folder}`, j.lora ? { ...draw, loras: [draw.loras, j.lora].filter(Boolean).join(",") } : draw);
        mkdirSync(join(DIR, j.folder), { recursive: true });
        const tmp = `${pathOf(j.folder, j.file)}.part`;
        writeFileSync(tmp, png);
        renameSync(tmp, pathOf(j.folder, j.file));
        j.state = "done";
        console.log(`drawn ${j.folder}/${j.file}  (${queue.length} waiting)`);
      } catch (e) {
        j.state = "error";
        j.error = (e as Error).message.slice(0, 300);
        console.log(`error ${j.folder}/${j.file}: ${j.error}`);
      }
    }
  } finally {
    drawing--;
  }
}
const kick = () => {
  for (let i = drawing; i < INFLIGHT; i++) void pump();
};

createServer(async (req, res) => {
  cors(res);
  if (req.method === "OPTIONS") return void res.writeHead(204).end();
  const url = new URL(req.url ?? "/", "http://x");
  const r = url.pathname;
  try {
    if (r === "/api/status") return json(res, 200, { ok: true, comfy: await comfyAlive(COMFY), waiting: queue.length, drawing, dir: DIR });
    if (r === "/api/list") {
      const folder = url.searchParams.get("folder") ?? "";
      if (!FOLDER.test(folder)) return json(res, 400, { error: "bad folder" });
      const d = join(DIR, folder);
      const files = existsSync(d) ? readdirSync(d).filter((f) => f.endsWith(".png")).map((f) => f.slice(0, -4)) : [];
      return json(res, 200, { files });
    }
    if (r === "/api/card" && req.method === "POST") {
      const b = await body(req);
      const folder = String(b.folder ?? "");
      if (!FOLDER.test(folder) || !b.card || typeof b.card !== "object") return json(res, 400, { error: "bad card" });
      const card = b.card as { name?: string };
      mkdirSync(join(DIR, folder), { recursive: true });
      writeFileSync(join(DIR, folder, "wife.json"), JSON.stringify(b.card, null, 1));
      writeFileSync(join(DIR, folder, "pack.json"), JSON.stringify({ name: card.name ?? folder, folder, made: new Date().toISOString() }, null, 1));
      return json(res, 200, { ok: true });
    }
    if (r === "/api/draw" && req.method === "POST") {
      const b = await body(req);
      const folder = String(b.folder ?? ""), file = String(b.file ?? ""), size = String(b.size ?? "832x1216");
      if (!FOLDER.test(folder) || !FILE.test(file) || !SIZE.test(size)) return json(res, 400, { error: "bad request" });
      if (!b.replace && existsSync(pathOf(folder, file))) return json(res, 200, { state: "done", url: urlOf(folder, file) });
      // the same picture already on its way: one job
      const same = [...jobs.values()].find((j) => j.folder === folder && j.file === file && (j.state === "queued" || j.state === "drawing"));
      if (same) {
        if (same.state === "queued") queue.splice(queue.indexOf(same), 1), queue.unshift(same);
        return json(res, 200, { id: same.id, state: same.state, ahead: queue.indexOf(same) });
      }
      // {file, weight} from the game; only a plain file name gets through
      const lr = b.lora as { file?: unknown; weight?: unknown } | undefined;
      const lora = lr && typeof lr.file === "string" && /^[\w.-]+$/.test(lr.file) && Number(lr.weight) > 0 ? `${lr.file.replace(/\.safetensors$/, "")}.safetensors:${Number(lr.weight)}` : undefined;
      const job: Job = { id: `j${++n}`, folder, file, positive: String(b.positive ?? ""), negative: String(b.negative ?? ""), size, ...(lora ? { lora } : {}), seed: Number.isFinite(Number(b.seed)) ? Number(b.seed) : Math.floor(Math.random() * 2 ** 31), state: "queued", at: Date.now() };
      jobs.set(job.id, job);
      queue.unshift(job);
      // a long walk through the game leaves old wishes behind: keep the newest 40
      for (const old of queue.splice(40)) old.state = "error", (old.error = "dropped: too many waiting");
      kick();
      return json(res, 200, { id: job.id, state: job.state, ahead: 0 });
    }
    if (r === "/api/job") {
      const j = jobs.get(url.searchParams.get("id") ?? "");
      if (!j) return json(res, 404, { error: "no such job" });
      return json(res, 200, { state: j.state, error: j.error, ahead: j.state === "queued" ? queue.indexOf(j) : 0, url: j.state === "done" ? urlOf(j.folder, j.file) : undefined });
    }
    if (r === "/api/cancel" && req.method === "POST") {
      const b = await body(req);
      const folder = b.folder ? String(b.folder) : null;
      const drop = queue.filter((j) => !folder || j.folder === folder);
      for (const j of drop) j.state = "error", (j.error = "cancelled");
      queue.splice(0, queue.length, ...queue.filter((j) => !drop.includes(j)));
      return json(res, 200, { cancelled: drop.length });
    }
    if (r.startsWith("/pic/")) {
      const [, , folder = "", rawFile = ""] = r.split("/");
      const file = decodeURIComponent(rawFile).replace(/\.png$/, "");
      if (!FOLDER.test(folder) || !FILE.test(file) || !existsSync(pathOf(folder, file))) return json(res, 404, { error: "no picture" });
      res.writeHead(200, { "content-type": "image/png", "cache-control": "no-cache" });
      return void res.end(readFileSync(pathOf(folder, file)));
    }
    json(res, 404, { error: "not found" });
  } catch (e) {
    json(res, 500, { error: (e as Error).message });
  }
}).listen(PORT, "127.0.0.1", async () => {
  console.log(`picture server: http://127.0.0.1:${PORT}   pictures in ${DIR}`);
  console.log(`ComfyUI ${COMFY}: ${(await comfyAlive(COMFY)) ? "ok" : "NOT REACHABLE - start ComfyUI, the game will show the nearest saved pictures meanwhile"}`);
});
