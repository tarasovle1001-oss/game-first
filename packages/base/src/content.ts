import raw from "./generated/content.json";
import type { Act, Content, PatronType, Room } from "./content/schema";

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

const acts = new Map(content.acts.map((a) => [a.id, a]));
/** The act with this id, or nothing: for ids that come from saved state or from other content. */
export const actOf = (id: string | undefined): Act | undefined => (id === undefined ? undefined : acts.get(id));
/** The act with this id; an unknown id is a bug in content or code. */
export const actById = (id: string): Act => {
  const a = acts.get(id);
  if (!a) throw new Error(`unknown act "${id}"`);
  return a;
};
