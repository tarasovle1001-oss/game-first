// Image packs: a folder of pictures named after scene keys. The game shows the most specific picture
// the pack has for the scene on screen and falls back to the mannequin when there is none.
import { sceneFileName, sceneKeyFallbacks } from "@tc/core";
import type { SceneDesc } from "@tc/core";

const pictures = new Map<string, string[]>();
let packName = "";

/** Takes the files of a picked folder. Returns how many pictures were recognised. */
export function loadPack(files: FileList | File[]): number {
  for (const urls of pictures.values()) urls.forEach((u) => URL.revokeObjectURL(u));
  pictures.clear();
  const list = Array.from(files).filter((f) => /\.(png|jpe?g|webp|avif|gif)$/i.test(f.name)).sort((a, b) => a.name.localeCompare(b.name));
  for (const f of list) {
    const stem = f.name.replace(/\.[^.]+$/, "").replace(/~\d+$/, "");
    pictures.set(stem, [...(pictures.get(stem) ?? []), URL.createObjectURL(f)]);
  }
  const first = list[0] as (File & { webkitRelativePath?: string }) | undefined;
  packName = first?.webkitRelativePath?.split("/")[0] ?? "";
  return list.length;
}

export const packInfo = () => ({ name: packName, keys: pictures.size });

/** The picture for a scene, most specific first; `pick` chooses between variants of the same key. */
export function pictureFor(desc: SceneDesc, pick: number): { url: string; key: string; exact: boolean } | null {
  if (pictures.size === 0) return null;
  const keys = sceneKeyFallbacks(desc);
  for (const [i, key] of keys.entries()) {
    const urls = pictures.get(sceneFileName(key));
    if (urls?.length) return { url: urls[Math.abs(pick) % urls.length]!, key, exact: i === 0 };
  }
  return null;
}
