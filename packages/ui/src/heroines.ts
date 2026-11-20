// The player's heroines: cards made in the builder, kept in this browser, with a small portrait each.
import { readCard } from "@tc/base";
import type { HeroineCard } from "@tc/base";

const LIST = "test-city.heroines";
const THUMB = "test-city.heroine.thumb.";

export function loadHeroines(): HeroineCard[] {
  try {
    const raw = JSON.parse(localStorage.getItem(LIST) ?? "[]") as unknown[];
    return raw.map(readCard).filter((c): c is HeroineCard => c !== null);
  } catch {
    return [];
  }
}

export function saveHeroines(list: HeroineCard[]): boolean {
  try {
    localStorage.setItem(LIST, JSON.stringify(list));
    return true;
  } catch {
    return false;
  }
}

export const thumbOf = (id: string): string | null => {
  try {
    return localStorage.getItem(THUMB + id);
  } catch {
    return null;
  }
};
export const dropThumb = (id: string) => {
  try {
    localStorage.removeItem(THUMB + id);
  } catch {
    /* no storage */
  }
};

/** A small JPEG of a picture for the picker (the generator may be off next time). */
export async function keepThumb(id: string, url: string): Promise<void> {
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.src = url;
  await img.decode();
  const w = 240;
  const h = Math.round((img.naturalHeight / img.naturalWidth) * w);
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  c.getContext("2d")!.drawImage(img, 0, 0, w, h);
  try {
    localStorage.setItem(THUMB + id, c.toDataURL("image/jpeg", 0.82));
  } catch {
    /* no room: the picker shows her initial */
  }
}

/** Her card as a file to keep or give to another player. */
export function downloadCard(card: HeroineCard) {
  const blob = new Blob([JSON.stringify(card, null, 1)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${card.name || card.id}.heroine.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

/** A card from a file (her own .heroine.json or a pack's wife.json); a card already here comes under a new id. */
export async function readCardFile(file: File, have: HeroineCard[]): Promise<HeroineCard | null> {
  try {
    const card = readCard(JSON.parse(await file.text()));
    if (!card) return null;
    if (have.some((c) => c.id === card.id && c.updatedAt !== card.updatedAt)) card.id = `h_${Math.random().toString(36).slice(2, 10)}`;
    return card;
  } catch {
    return null;
  }
}
