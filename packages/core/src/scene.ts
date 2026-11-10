import type { SceneDesc } from "./types";

/** Stable picture key: type + roles + location + sorted tags. Same scene -> same key. */
export function sceneKey(desc: SceneDesc): string {
  const roles = desc.participants
    .map((p) => p.role)
    .sort()
    .join("+");
  const tags = Object.entries(desc.tags ?? {})
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join(",");
  return [desc.type, roles || "none", desc.location, tags].filter(Boolean).join("/");
}
