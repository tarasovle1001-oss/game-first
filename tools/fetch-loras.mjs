// Downloads candidate LoRAs / checkpoints from Civitai into ComfyUI (see the project doc claude/style-loras.md).
// Token: optional, from the CIVITAI_TOKEN environment variable (some adult models need it). Skips files already there.
//   PowerShell: $env:CIVITAI_TOKEN="<key from civitai.com/user/account -> API keys>"; node tools/fetch-loras.mjs [--comfy C:\ComfyUI] [--only part,part]
import { createWriteStream, existsSync, mkdirSync, renameSync, statSync } from "node:fs";
import { join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const COMFY = opt("comfy", "C:\\ComfyUI");
const only = opt("only", "")?.split(",").filter(Boolean);
const token = process.env.CIVITAI_TOKEN ?? "";
const auth = token ? { Authorization: `Bearer ${token}` } : {};

// model id on Civitai, or a search query when the id is not known; kind: loras | checkpoints
const LIST = [
  { name: "kokoya_art (style)", model: 2315903, kind: "loras" },
  { name: "stylized (style)", model: 1937774, kind: "loras" },
  { name: "flat painting (de-AI)", model: 1075503, kind: "loras" },
  { name: "flat color v2 (style)", model: 1132089, kind: "loras" },
  { name: "afrobull (style)", query: "afrobull", kind: "loras" },
  { name: "prostate milking", model: 1674173, kind: "loras" },
  { name: "rimjob", model: 1337683, kind: "loras" },
  { name: "stepping footjob", model: 1124199, kind: "loras" },
  { name: "caught ntr (netorare)", query: "walk in netorare", kind: "loras" },
  { name: "facesitting reverse pov", query: "facesitting close-up reverse pov", kind: "loras" },
  { name: "padlocked chastity cage", query: "padlocked colored tube chastity", kind: "loras", version: "1.5" }, // v1.5: the newer ones pull towards photos
  { name: "NTR MIX XIII (checkpoint)", model: 926443, kind: "checkpoints", version: "XIII" },
];

async function api(path) {
  const r = await fetch(`https://civitai.com/api/v1/${path}`, { headers: auth });
  if (!r.ok) throw Error(`civitai ${r.status} on ${path}`);
  return r.json();
}
async function resolve(e) {
  let m;
  if (e.model) m = await api(`models/${e.model}`);
  else {
    const s = await api(`models?query=${encodeURIComponent(e.query)}&types=${e.kind === "loras" ? "LORA" : "Checkpoint"}&baseModels=Illustrious&nsfw=true&limit=5`);
    m = s.items?.[0];
    if (!m) throw Error("not found by search");
  }
  const vs = (m.modelVersions ?? []).filter((v) => /illustrious|noob/i.test(v.baseModel ?? ""));
  const v = (e.version ? vs.find((x) => x.name?.includes(e.version)) : null) ?? vs[0] ?? m.modelVersions?.[0];
  const f = v.files?.find((x) => x.primary) ?? v.files?.[0];
  return { model: m.name, id: m.id, version: v.name, url: f.downloadUrl, file: f.name, mb: Math.round((f.sizeKB ?? 0) / 1024) };
}

for (const e of LIST) {
  if (only?.length && !only.some((o) => e.name.includes(o))) continue;
  try {
    const r = await resolve(e);
    const dir = join(COMFY, "models", e.kind);
    mkdirSync(dir, { recursive: true });
    const dst = join(dir, r.file);
    if (existsSync(dst)) { console.log(`have  ${e.name}: ${r.file}`); continue; }
    process.stdout.write(`get   ${e.name}: "${r.model}" ${r.version} -> ${r.file} (${r.mb} MB) ... `);
    const res = await fetch(r.url + (token ? (r.url.includes("?") ? "&" : "?") + `token=${token}` : ""), { headers: auth, redirect: "follow" });
    if (!res.ok || !res.body) throw Error(`download ${res.status}${res.status === 401 || res.status === 403 ? " (needs a Civitai token: set CIVITAI_TOKEN)" : ""}`);
    await pipeline(Readable.fromWeb(res.body), createWriteStream(dst + ".part"));
    renameSync(dst + ".part", dst);
    console.log(`ok, ${Math.round(statSync(dst).size / 1048576)} MB`);
  } catch (err) {
    console.log(`FAIL  ${e.name}: ${err.message}`);
  }
}
