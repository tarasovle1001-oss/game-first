import type { SceneDesc } from "./types";

const rolesOf = (desc: SceneDesc) => [...new Set(desc.participants.map((p) => p.role))].sort().join("+") || "none";
const tagsOf = (tags: Record<string, string>) =>
  Object.entries(tags)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join(",");

/** Stable picture key: type + roles + location + sorted tags. Same scene -> same key. */
export function sceneKey(desc: SceneDesc): string {
  // a crowd of the same role does not make a new picture: roles are counted once
  return [desc.type, rolesOf(desc), desc.location, tagsOf(desc.tags ?? {})].filter(Boolean).join("/");
}

/**
 * The key and its ever more general versions, most specific first. An image pack that lacks the exact picture
 * can still show the nearest one: first tags are dropped one at a time (least important first, see `order`), then the room,
 * then the roles. The caller falls back to the schematic when nothing matches.
 */
export function sceneKeyFallbacks(desc: SceneDesc, order: string[] = []): string[] {
  const roles = rolesOf(desc);
  const out: string[] = [];
  // tags named in `order` are kept longest, in that order; the rest go first, last-sorted first
  const rank = (k: string) => (order.includes(k) ? order.indexOf(k) : order.length);
  const entries = Object.entries(desc.tags ?? {}).sort(([a], [b]) => rank(a) - rank(b) || a.localeCompare(b));
  for (let n = entries.length; n >= 0; n--) {
    const tags = tagsOf(Object.fromEntries(entries.slice(0, n)));
    out.push([desc.type, roles, desc.location, tags].filter(Boolean).join("/"));
  }
  for (let n = entries.length; n >= 0; n--) {
    const tags = tagsOf(Object.fromEntries(entries.slice(0, n)));
    out.push([desc.type, roles, "*", tags].filter(Boolean).join("/"));
  }
  out.push(`${desc.type}/*`);
  return [...new Set(out)];
}

/**
 * File name (without extension) an image pack uses for a key: "/" becomes "__", "*" becomes "any".
 * Several pictures for one key: add "~2", "~3" to the name.
 */
export const sceneFileName = (key: string): string => key.replace(/\//g, "__").replace(/\*/g, "any");
