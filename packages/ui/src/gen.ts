// The picture server on the player's own computer (tools/picture-server.ts, Start-Generator.bat): draws what is missing.
// The prompt is built here by the game itself (promptFor), with her card; the server only draws and keeps the pictures.
// Off, or the server not running: the game shows the nearest saved picture (pack.ts), nothing is asked for.
import { useSyncExternalStore } from "react";
import { cardFolder, cardToCast, promptFor } from "@tc/base";
import type { CastCard, HeroineCard, PictureFrames } from "@tc/base";
import { addDrawn, drawnFolderNow, hasExact, setDrawn } from "./pack";
import { sceneFileName, sceneKey } from "@tc/core";
import type { SceneDesc } from "@tc/core";

const KEY = "test-city.generator";
type Setup = { on: boolean; url: string };
const read = (): Setup => {
  try {
    return { on: false, url: "http://127.0.0.1:8197", ...(JSON.parse(localStorage.getItem(KEY) ?? "{}") as Partial<Setup>) };
  } catch {
    return { on: false, url: "http://127.0.0.1:8197" };
  }
};
let setup = read();
/** null = not asked yet; false = not running */
let alive: { comfy: boolean; waiting: number } | false | null = null;
let version = 0;
const listeners = new Set<() => void>();
const changed = () => {
  version++;
  listeners.forEach((f) => f());
};
const subscribe = (f: () => void) => (listeners.add(f), () => listeners.delete(f));
/** Re-render on any change of the generator: a picture came, the server went away. */
export const useGen = () => useSyncExternalStore(subscribe, () => version);

export const genSetup = () => setup;
export const genAlive = () => alive;
export function setGen(next: Partial<Setup>) {
  setup = { ...setup, ...next };
  try {
    localStorage.setItem(KEY, JSON.stringify(setup));
  } catch {
    /* no storage */
  }
  changed();
  void checkGen();
}

async function call<T>(path: string, body?: unknown, ms = 4000): Promise<T> {
  const r = await fetch(`${setup.url}${path}`, body === undefined ? { signal: AbortSignal.timeout(ms) } : { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(ms) });
  if (!r.ok) throw Error(`${r.status}`);
  return (await r.json()) as T;
}

export async function checkGen(): Promise<typeof alive> {
  try {
    const s = await call<{ comfy: boolean; waiting: number }>("/api/status", undefined, 2500);
    alive = { comfy: s.comfy, waiting: s.waiting };
  } catch {
    alive = false;
  }
  changed();
  return alive;
}

/** Her picture folder: her card and the version of her look; without a card, the default cast. */
export const folderOf = (card: HeroineCard | undefined | null) => (card ? cardFolder(card) : "default");
export const wifeOf = (card: HeroineCard | undefined | null): CastCard | undefined => (card ? cardToCast(card) : undefined);
export const fileOf = (desc: SceneDesc) => sceneFileName(sceneKey(desc));
const sizeOf = (desc: SceneDesc) => (desc.type.startsWith("detail_") ? "1024x1024" : "832x1216");
export const picUrl = (folder: string, file: string, bust = "") => `${setup.url}/pic/${folder}/${encodeURIComponent(file)}.png${bust ? `?v=${bust}` : ""}`;

/** What the server already has for a folder (file stems). */
export async function listFolder(folder: string): Promise<string[]> {
  try {
    return (await call<{ files: string[] }>(`/api/list?folder=${folder}`)).files;
  } catch {
    return [];
  }
}

/** Her card goes into her folder (wife.json, pack.json): the folder is then a pack with its own card. */
export async function sendCard(card: HeroineCard): Promise<boolean> {
  try {
    await call("/api/card", { folder: cardFolder(card), card });
    return true;
  } catch {
    return false;
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const pending = new Map<string, Promise<string | null>>();

/** Draws one picture (or finds it drawn) and resolves with its URL; null when it could not be drawn. */
export function drawPicture(desc: SceneDesc, card: HeroineCard | undefined | null, opts: { replace?: boolean; onWait?: (ahead: number) => void } = {}): Promise<string | null> {
  const folder = folderOf(card);
  const file = fileOf(desc);
  const id = `${folder}/${file}`;
  const was = pending.get(id);
  if (was && !opts.replace) return was;
  const p = (async () => {
    try {
      const pr = promptFor(desc, "default", wifeOf(card));
      let job = await call<{ id?: string; state: string; url?: string; ahead?: number; error?: string }>("/api/draw", { folder, file, positive: pr.positive, negative: pr.negative, size: sizeOf(desc), replace: !!opts.replace });
      const jobId = job.id;
      const started = Date.now();
      while (job.state === "queued" || job.state === "drawing") {
        opts.onWait?.(job.ahead ?? 0);
        await sleep(job.state === "drawing" ? 1200 : 2000);
        job = await call(`/api/job?id=${jobId}`);
        if (Date.now() - started > 20 * 60000) return null;
      }
      return job.state === "done" ? picUrl(folder, file, String(Date.now())) : null;
    } catch {
      return null;
    } finally {
      pending.delete(id);
    }
  })();
  pending.set(id, p);
  return p;
}

// ---------- live: the scene on screen ----------

let syncing = "";
/** Her folder becomes what the game can show (once per folder, again after the server comes back). */
export async function syncFolder(card: HeroineCard | undefined | null): Promise<void> {
  const folder = folderOf(card);
  if (syncing === folder && drawnFolderNow() === folder) return;
  if (alive) syncing = folder;
  const files = alive ? await listFolder(folder) : [];
  setDrawn(folder, files, (f) => picUrl(folder, f));
  changed();
}

/** With the generator on: draw what the scene on screen lacks. Its whole picture, or her portrait and close-ups for a split scene. */
export function wantFrames(frames: PictureFrames, card: HeroineCard | undefined | null) {
  if (!setup.on || !alive || !alive.comfy) return;
  // pictures are of her: a room without her is not worth a picture
  if (!frames.full.participants.some((p) => p.role === "wife")) return;
  const folder = folderOf(card);
  const want = frames.splitOnly && frames.portrait ? [frames.portrait, ...frames.inserts] : [frames.full];
  for (const d of want) {
    const file = fileOf(d);
    if (hasExact(file)) continue;
    void drawPicture(d, card).then((url) => {
      if (url) {
        addDrawn(folder, file, url);
        changed();
      }
    });
  }
}
