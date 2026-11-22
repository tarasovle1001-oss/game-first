// Image packs: a folder of pictures named after scene keys. The game shows the exact picture when the pack has it,
// otherwise the nearest one of the same scene (base: systems/packfind.ts), and the mannequin when there is none.
import { sceneKey } from "@tc/core";
import type { SceneDesc } from "@tc/core";
import { packIndex, packLayout, variantOf } from "@tc/base";
import type { Hit, PackIndex, PictureFrames } from "@tc/base";

/** Pack pictures by file stem; each variant keeps its file name (`stem~3.png`) so a note can point at it. */
const pictures = new Map<string, { url: string; name: string }[]>();
let packName = "";
let index: PackIndex | null = null;
const PICTURE = /\.(png|jpe?g|webp|avif|gif)$/i;

function setPack(name: string, files: File[]): number {
  for (const urls of pictures.values()) urls.forEach((u) => URL.revokeObjectURL(u.url));
  pictures.clear();
  index = null;
  const list = files.filter((f) => PICTURE.test(f.name)).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  for (const f of list) {
    const stem = f.name.replace(/\.[^.]+$/, "").replace(/~\d+$/, "");
    pictures.set(stem, [...(pictures.get(stem) ?? []), { url: URL.createObjectURL(f), name: f.name }]);
  }
  packName = name;
  return list.length;
}

/** Takes the files of a picked folder (the old way: asked again after every reload). Returns how many pictures were recognised. */
export function loadPack(files: FileList | File[]): number {
  const list = Array.from(files);
  const first = list[0] as (File & { webkitRelativePath?: string }) | undefined;
  return setPack(first?.webkitRelativePath?.split("/")[0] ?? "", list);
}

// ---- a folder the browser remembers (File System Access): picked once, picked up again on the next start
type Dir = { name: string; kind: "directory"; values(): AsyncIterable<Dir | Leaf>; queryPermission?(o: { mode: "read" }): Promise<string>; requestPermission?(o: { mode: "read" }): Promise<string> };
type Leaf = { name: string; kind: "file"; getFile(): Promise<File> };
const DB = "test-city";
const STORE = "handles";
const idb = <T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    const open = indexedDB.open(DB, 1);
    open.onupgradeneeded = () => open.result.createObjectStore(STORE);
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const req = run(open.result.transaction(STORE, mode).objectStore(STORE));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    };
  });
/** Folders that are not part of a pack: rejected frames and working files of the picture tools. */
const SKIP = /^(old|_.*|\..*)$/i;
async function readDir(dir: Dir, onCount?: (n: number) => void): Promise<File[]> {
  const out: File[] = [];
  const walk = async (d: Dir) => {
    for await (const e of d.values()) {
      if (e.kind === "directory") {
        if (!SKIP.test(e.name)) await walk(e);
      } else if (PICTURE.test(e.name)) {
        out.push(await e.getFile());
        if (onCount && out.length % 500 === 0) onCount(out.length);
      }
    }
  };
  await walk(dir);
  return out;
}
export const canRememberPack = () => typeof window !== "undefined" && "showDirectoryPicker" in window && typeof indexedDB !== "undefined";
/** Pick the pack folder; the browser keeps it for the next start. Null: cancelled. */
export async function pickPack(onCount?: (n: number) => void): Promise<number | null> {
  let dir: Dir;
  try {
    dir = await (window as unknown as { showDirectoryPicker(o: object): Promise<Dir> }).showDirectoryPicker({ id: "test-city-pack", mode: "read" });
  } catch {
    return null;
  }
  try {
    await idb("readwrite", (s) => s.put(dir, "pack"));
  } catch {
    /* not remembered: still loaded for this session */
  }
  return setPack(dir.name, await readDir(dir, onCount));
}
/** The folder remembered from last time: its name and whether it can be read without asking. */
export async function rememberedPack(): Promise<{ name: string; ready: boolean } | null> {
  if (!canRememberPack()) return null;
  try {
    const dir = await idb<Dir | undefined>("readonly", (s) => s.get("pack"));
    if (!dir) return null;
    return { name: dir.name, ready: (await dir.queryPermission?.({ mode: "read" })) === "granted" };
  } catch {
    return null;
  }
}
/** Load the remembered folder. `ask`: may show the browser's permission prompt (needs a click). Null: not allowed or gone. */
export async function reopenPack(ask: boolean, onCount?: (n: number) => void): Promise<number | null> {
  try {
    const dir = await idb<Dir | undefined>("readonly", (s) => s.get("pack"));
    if (!dir) return null;
    let state = await dir.queryPermission?.({ mode: "read" });
    if (state !== "granted" && ask) state = await dir.requestPermission?.({ mode: "read" });
    if (state !== "granted") return null;
    return setPack(dir.name, await readDir(dir, onCount));
  } catch {
    return null;
  }
}

export const packInfo = () => ({ name: packName, keys: pictures.size });

// Pictures the generator on this computer has drawn for her (gen.ts): looked up together with the pack.
const drawn = new Map<string, string>();
let drawnFolder = "";
/** Her folder on the generator: what it already has becomes part of what the game can show. */
export function setDrawn(folder: string, files: string[], url: (file: string) => string) {
  if (folder !== drawnFolder) drawn.clear();
  drawnFolder = folder;
  for (const f of files) if (!drawn.has(f)) drawn.set(f, url(f));
  index = null;
}
export const addDrawn = (folder: string, file: string, url: string) => {
  if (folder === drawnFolder) drawn.set(file, url);
  index = null;
};
export const drawnFolderNow = () => drawnFolder;
/** Is the exact picture there already (pack or drawn). */
export const hasExact = (file: string) => !!pictures.get(file)?.length || drawn.has(file);

/** A picture on screen and where it came from: the key shown, the key the scene asked for, the file and its variant. */
export type Shot = { url: string; key: string; exact: boolean; asked: string; desc: SceneDesc; file: string; variant: number; source: "pack" | "gen" };
function shotOf(hit: Hit, salt: string): Shot {
  const base = { key: hit.key, exact: hit.exact, asked: sceneKey(hit.desc), desc: hit.desc };
  const urls = pictures.get(hit.stem);
  if (urls?.length) {
    const variant = variantOf(hit.desc, salt, urls.length);
    return { ...base, url: urls[variant]!.url, file: urls[variant]!.name, variant, source: "pack" };
  }
  return { ...base, url: drawn.get(hit.stem)!, file: `${hit.stem}.png`, variant: 0, source: "gen" };
}
/**
 * What to put on screen for a scene: the main picture and zero to three close-ups beside it. Null = draw the mannequin.
 * `salt` (the game's seed and the day) picks between variants: the picture changes when the scene does, not on every move.
 */
export function layoutFor(frames: PictureFrames, salt: string): { main: Shot; inserts: Shot[]; split: boolean } | null {
  if (pictures.size === 0 && drawn.size === 0) return null;
  index ??= packIndex([...pictures.keys(), ...drawn.keys()]);
  const got = packLayout(index, frames);
  return got && { main: shotOf(got.main, salt), inserts: got.inserts.map((h) => shotOf(h, salt)), split: got.split };
}
// What is on screen right now, for a playtest note (F2): the big picture first, then the close-ups beside it.
export type OnScreen = { where: "here" | "away"; pick: string; split: boolean; frames: { slot: "main" | "insert"; shot: Shot }[] };
let onScreen: OnScreen | null = null;
export const setOnScreen = (next: OnScreen | null) => void (onScreen = next);
export const getOnScreen = () => onScreen;

/** The picture block of a note: a line per frame a person can read, then one line of JSON for a script (no prompts: promptFor(desc) rebuilds them). */
export function picNote(card?: string): string[] {
  const on = onScreen;
  if (!on || on.frames.length === 0) return [];
  let n = 0;
  const lines = on.frames.map(({ slot, shot }) => {
    const name = slot === "main" ? "main" : `ins${(n += 1)}`;
    return `pic ${name} | показан: ${shot.key} | просили: ${shot.asked} | ${shot.exact ? "точный" : "запасной"} | ${shot.source} ${shot.file} ~${shot.variant}${on.where === "away" ? " | away" : ""}`;
  });
  const json = {
    pick: on.pick,
    split: on.split,
    where: on.where,
    ...(card ? { card } : {}),
    frames: on.frames.map(({ slot, shot }) => ({ slot, key: shot.key, asked: shot.asked, exact: shot.exact, source: shot.source, file: shot.file, variant: shot.variant, desc: shot.desc })),
  };
  return [...lines, `pics ${JSON.stringify(json)}`];
}
