import raw from "./generated/content.json";
import type { Content, PatronType, Room } from "./content/schema";

/** Built by tools/build-content.ts from the YAML files in packages/base/content. */
export const content = raw as unknown as Content;

const typeById = new Map(content.patronTypes.map((t) => [t.id, t]));
const roomById = new Map(content.rooms.map((r) => [r.id, r]));

export const patronType = (id: string): PatronType => {
  const t = typeById.get(id);
  if (!t) throw new Error(`unknown patron type "${id}"`);
  return t;
};
export const room = (id: string): Room | undefined => roomById.get(id);
