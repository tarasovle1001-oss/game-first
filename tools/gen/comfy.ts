// ComfyUI: the one text-to-image graph the game's pictures are drawn with, and one call that draws a picture.
// Shared by the prompt lab and the picture server, so a picture looks the same wherever it was made.

export type DrawSettings = { ckpt: string; loras: string; steps: number; cfg: number; sampler: string; scheduler: string };

export const DEFAULT_DRAW: DrawSettings = {
  ckpt: "waiIllustriousSDXL_v170.safetensors",
  loras: "sdxl_lightning_8step_lora.safetensors:1,sora_v2-000010.safetensors:0.7",
  steps: 9,
  cfg: 1.5,
  sampler: "euler_ancestral",
  scheduler: "simple",
};

export function comfyGraph(positive: string, negative: string, seed: number, size: string, prefix: string, use: DrawSettings, init?: { name: string; denoise: number }) {
  const [w, h] = size.split("x").map(Number) as [number, number];
  const g: Record<string, { class_type: string; inputs: Record<string, unknown> }> = {};
  g.ckpt = { class_type: "CheckpointLoaderSimple", inputs: { ckpt_name: use.ckpt } };
  let model: [string, number] = ["ckpt", 0];
  let clip: [string, number] = ["ckpt", 1];
  use.loras.split(",").map((s) => s.trim()).filter(Boolean).forEach((s, i) => {
    const [name, wt] = s.split(":");
    g[`lora${i}`] = { class_type: "LoraLoader", inputs: { model, clip, lora_name: name, strength_model: Number(wt ?? 1), strength_clip: Number(wt ?? 1) } };
    model = [`lora${i}`, 0];
    clip = [`lora${i}`, 1];
  });
  g.skip = { class_type: "CLIPSetLastLayer", inputs: { clip, stop_at_clip_layer: -2 } };
  g.pos = { class_type: "CLIPTextEncode", inputs: { clip: ["skip", 0], text: positive } };
  g.neg = { class_type: "CLIPTextEncode", inputs: { clip: ["skip", 0], text: negative } };
  g.latent = { class_type: "EmptyLatentImage", inputs: { width: w, height: h, batch_size: 1 } };
  // painted over an earlier picture (already in ComfyUI's input folder): its latent instead of an empty one, part of the noise only
  if (init) { g.load = { class_type: "LoadImage", inputs: { image: init.name } }; g.latent = { class_type: "VAEEncode", inputs: { pixels: ["load", 0], vae: ["ckpt", 2] } }; }
  g.sample = { class_type: "KSampler", inputs: { model, positive: ["pos", 0], negative: ["neg", 0], latent_image: ["latent", 0], seed, steps: use.steps, cfg: use.cfg, sampler_name: use.sampler, scheduler: use.scheduler, denoise: init?.denoise ?? 1 } };
  g.decode = { class_type: "VAEDecode", inputs: { samples: ["sample", 0], vae: ["ckpt", 2] } };
  g.save = { class_type: "SaveImage", inputs: { images: ["decode", 0], filename_prefix: prefix } };
  return g;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** One picture: send the graph, wait, bring the PNG back. */
export async function comfyRender(comfy: string, positive: string, negative: string, seed: number, size: string, prefix: string, use: DrawSettings, onId?: (id: string) => void, clientId = "test-city", over?: { png: Buffer; denoise: number }): Promise<Buffer> {
  let init: { name: string; denoise: number } | undefined;
  if (over) {
    const fd = new FormData();
    fd.append("image", new Blob([new Uint8Array(over.png)], { type: "image/png" }), `${prefix.replace(/[^\w.-]+/g, "_")}_src.png`);
    fd.append("overwrite", "true");
    const up = await fetch(`${comfy}/upload/image`, { method: "POST", body: fd });
    if (!up.ok) throw Error(`ComfyUI upload ${up.status}`);
    init = { name: ((await up.json()) as { name: string }).name, denoise: over.denoise };
  }
  const r = await fetch(`${comfy}/prompt`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ prompt: comfyGraph(positive, negative, seed, size, prefix, use, init), client_id: clientId }) });
  if (!r.ok) throw Error(`ComfyUI ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const { prompt_id } = (await r.json()) as { prompt_id: string };
  onId?.(prompt_id);
  for (let waited = 0; waited < 15 * 60000; waited += 700) {
    await sleep(700);
    const h = (await (await fetch(`${comfy}/history/${prompt_id}`)).json()) as Record<string, { status?: { status_str?: string }; outputs?: Record<string, { images?: { filename: string; subfolder: string; type: string }[] }> }>;
    const e = h[prompt_id];
    if (!e) continue;
    if (e.status?.status_str === "error") throw Error("ComfyUI error (see its console)");
    const img = Object.values(e.outputs ?? {}).flatMap((o) => o.images ?? [])[0];
    if (!img) continue;
    const qs = new URLSearchParams({ filename: img.filename, subfolder: img.subfolder, type: img.type });
    return Buffer.from(await (await fetch(`${comfy}/view?${qs}`)).arrayBuffer());
  }
  throw Error("no picture after 15 min");
}

/** Is ComfyUI there at all. */
export async function comfyAlive(comfy: string): Promise<boolean> {
  try {
    const r = await fetch(`${comfy}/system_stats`, { signal: AbortSignal.timeout(2500) });
    return r.ok;
  } catch {
    return false;
  }
}
