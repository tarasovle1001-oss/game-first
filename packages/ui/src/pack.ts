// Image packs: a folder of pictures named after scene keys. The game shows the most specific picture
// the pack has for the scene on screen and falls back to the mannequin when there is none.
import { sceneFileName, sceneKey, sceneKeyFallbacks } from "@tc/core";
import type { SceneDesc } from "@tc/core";
import { PICTURE_TAGS, resolveFrames } from "@tc/base";
import type { PictureFrames } from "@tc/base";

/** Pack pictures by file stem; each variant keeps its file name (`stem~3.png`) so a note can point at it. */
const pictures = new Map<string, { url: string; name: string }[]>();
let packName = "";

/** Takes the files of a picked folder. Returns how many pictures were recognised. */
export function loadPack(files: FileList | File[]): number {
  for (const urls of pictures.values()) urls.forEach((u) => URL.revokeObjectURL(u.url));
  pictures.clear();
  const list = Array.from(files).filter((f) => /\.(png|jpe?g|webp|avif|gif)$/i.test(f.name)).sort((a, b) => a.name.localeCompare(b.name));
  for (const f of list) {
    const stem = f.name.replace(/\.[^.]+$/, "").replace(/~\d+$/, "");
    pictures.set(stem, [...(pictures.get(stem) ?? []), { url: URL.createObjectURL(f), name: f.name }]);
  }
  const first = list[0] as (File & { webkitRelativePath?: string }) | undefined;
  packName = first?.webkitRelativePath?.split("/")[0] ?? "";
  return list.length;
}

export const packInfo = () => ({ name: packName, keys: pictures.size });

// Pictures the generator on this computer has drawn for her (gen.ts): looked up after the pack, key by key.
const drawn = new Map<string, string>();
let drawnFolder = "";
/** Her folder on the generator: what it already has becomes part of what the game can show. */
export function setDrawn(folder: string, files: string[], url: (file: string) => string) {
  if (folder !== drawnFolder) drawn.clear();
  drawnFolder = folder;
  for (const f of files) if (!drawn.has(f)) drawn.set(f, url(f));
}
export const addDrawn = (folder: string, file: string, url: string) => {
  if (folder === drawnFolder) drawn.set(file, url);
};
export const drawnFolderNow = () => drawnFolder;
/** Is the exact picture there already (pack or drawn). */
export const hasExact = (file: string) => !!pictures.get(file)?.length || drawn.has(file);

/** The picture for a scene, most specific first; `pick` chooses between variants of the same key. */
export function pictureFor(desc: SceneDesc, pick: number): Shot | null {
  if (pictures.size === 0 && drawn.size === 0) return null;
  const keys = sceneKeyFallbacks(desc, PICTURE_TAGS);
  const asked = sceneKey(desc);
  for (const [i, key] of keys.entries()) {
    const file = sceneFileName(key);
    const urls = pictures.get(file);
    if (urls?.length) {
      const variant = Math.abs(pick) % urls.length;
      return { url: urls[variant]!.url, key, exact: i === 0, asked, desc, file: urls[variant]!.name, variant, source: "pack" };
    }
    const own = drawn.get(file);
    if (own) return { url: own, key, exact: i === 0, asked, desc, file: `${file}.png`, variant: 0, source: "gen" };
  }
  return null;
}

/** A picture on screen and where it came from: the key shown, the key the scene asked for, the file and its variant. */
export type Shot = { url: string; key: string; exact: boolean; asked: string; desc: SceneDesc; file: string; variant: number; source: "pack" | "gen" };
/** What to put on screen for a scene: the main picture and zero to three close-ups beside it. Null = draw the mannequin. */
export const layoutFor = (frames: PictureFrames, pick: number) => resolveFrames<Shot>(frames, (d, i) => pictureFor(d, pick + i));

// What is on screen right now, for a playtest note (F2): the big picture first, then the close-ups beside it.
export type OnScreen = { where: "here" | "away"; pick: number; split: boolean; frames: { slot: "main" | "insert"; shot: Shot }[] };
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
