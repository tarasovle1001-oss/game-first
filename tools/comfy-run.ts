// Draws pictures of a pack plan with ComfyUI: one pass over the mannequin's depth map, the flow of the old
// packs (WAI + Lightning + Sora, 9 steps). Keeps a few prompts in flight, never touches what else is queued,
// resumes where it stopped (skips files that exist), times every picture.
//
//   pnpm exec tsx tools/comfy-run.ts --plan pack-plan.json --poses <dir with LAYOUT.depth.png> --out <dir>
//     [--comfy http://127.0.0.1:8188] [--layouts a,b,c | --top 200] [--per 8] [--seed 1000]
//     [--size 832x1216] [--steps 9] [--cfg 1.5] [--sampler euler_ancestral] [--scheduler simple]
//     [--ckpt waiIllustriousSDXL_v170.safetensors] [--loras sdxl_lightning_8step_lora.safetensors:1,sora_v2-000010.safetensors:0.7]
//     [--cn noob_depth_fp16.safetensors] [--cn-strength 0.6] [--cn-end 0.6] [--inflight 3] [--dry]
//
// Progress: <out>/progress.json (done, total, per minute, eta) and one console line. Timings: <out>/timings.csv.
import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync } from "node:fs";
import { basename, join } from "node:path";

const argv = process.argv.slice(2);
const opt = (name: string, def?: string) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] && !argv[i + 1]!.startsWith("--") ? argv[i + 1]! : def;
};
const flag = (name: string) => argv.includes(`--${name}`);

const comfy = opt("comfy", "http://127.0.0.1:8188")!.replace(/\/$/, "");
const planFile = opt("plan");
const poses = opt("poses");
const outDir = opt("out", "comfy-out")!;
if (!planFile || !poses) {
  console.log("need --plan and --poses (see the head of this file)");
  process.exit(1);
}
const [W, H] = opt("size", "832x1216")!.split("x").map(Number) as [number, number];
const per = Number(opt("per", "8"));
const seed0 = Number(opt("seed", "1000"));
const inflight = Number(opt("inflight", "3"));
const loras = opt("loras", "sdxl_lightning_8step_lora.safetensors:1,sora_v2-000010.safetensors:0.7")!
  .split(",")
  .filter(Boolean)
  .map((s) => ({ name: s.split(":")[0]!, w: Number(s.split(":")[1] ?? 1) }));
const cn = opt("cn", "noob_depth_fp16.safetensors")!;

type Row = { key: string; file: string; layout: string; positive: string; negative: string; empty: string[] };
const plan = JSON.parse(readFileSync(planFile, "utf8")) as { plan: Row[]; base: Row[] };
let rows: Row[] = plan.plan;
const layouts = opt("layouts")?.split(",");
if (layouts) {
  // the most seen picture of each wanted layout
  rows = layouts.map((l) => plan.plan.find((r) => r.layout === l) ?? plan.base.find((r) => r.layout === l)).filter((r): r is Row => !!r);
  const missing = layouts.filter((l) => !rows.some((r) => r.layout === l));
  if (missing.length) console.log(`no picture in the plan for: ${missing.join(", ")}`);
} else rows = rows.slice(0, Number(opt("top", "50")));
rows = rows.filter((r) => {
  const ok = existsSync(join(poses, `${r.layout}.depth.png`));
  if (!ok) console.log(`skip ${r.key}: no ${r.layout}.depth.png in ${poses}`);
  return ok;
});

mkdirSync(outDir, { recursive: true });
const stem = (r: Row) => r.file.replace(/\.png$/, "");
const jobs = rows.flatMap((r) => Array.from({ length: per }, (_, i) => ({ row: r, i, seed: seed0 + i, name: `${stem(r)}~${i + 1}.png` }))).filter((j) => !existsSync(join(outDir, j.name)));
writeFileSync(join(outDir, "prompts.json"), JSON.stringify(rows, null, 1));
console.log(`${rows.length} picture keys x ${per} = ${jobs.length} to draw (existing skipped) -> ${outDir}`);
if (flag("dry")) process.exit(0);

async function upload(path: string): Promise<string> {
  const form = new FormData();
  form.append("image", new Blob([readFileSync(path)], { type: "image/png" }), `tc_${basename(path)}`);
  form.append("overwrite", "true");
  const r = await fetch(`${comfy}/upload/image`, { method: "POST", body: form });
  if (!r.ok) throw Error(`upload ${path}: ${r.status}`);
  return ((await r.json()) as { name: string }).name;
}

function graph(job: (typeof jobs)[number], depth: string) {
  const g: Record<string, { class_type: string; inputs: Record<string, unknown> }> = {};
  g.ckpt = { class_type: "CheckpointLoaderSimple", inputs: { ckpt_name: opt("ckpt", "waiIllustriousSDXL_v170.safetensors") } };
  let model: [string, number] = ["ckpt", 0];
  let clip: [string, number] = ["ckpt", 1];
  loras.forEach((l, i) => {
    g[`lora${i}`] = { class_type: "LoraLoader", inputs: { model, clip, lora_name: l.name, strength_model: l.w, strength_clip: l.w } };
    model = [`lora${i}`, 0];
    clip = [`lora${i}`, 1];
  });
  g.skip = { class_type: "CLIPSetLastLayer", inputs: { clip, stop_at_clip_layer: -2 } };
  g.pos = { class_type: "CLIPTextEncode", inputs: { clip: ["skip", 0], text: job.row.positive } };
  g.neg = { class_type: "CLIPTextEncode", inputs: { clip: ["skip", 0], text: job.row.negative } };
  g.depth = { class_type: "LoadImage", inputs: { image: depth } };
  g.cn = { class_type: "ControlNetLoader", inputs: { control_net_name: cn } };
  g.apply = {
    class_type: "ControlNetApplyAdvanced",
    inputs: { positive: ["pos", 0], negative: ["neg", 0], control_net: ["cn", 0], image: ["depth", 0], strength: Number(opt("cn-strength", "0.6")), start_percent: 0, end_percent: Number(opt("cn-end", "0.6")) },
  };
  g.latent = { class_type: "EmptyLatentImage", inputs: { width: W, height: H, batch_size: 1 } };
  g.sample = {
    class_type: "KSampler",
    inputs: { model, positive: ["apply", 0], negative: ["apply", 1], latent_image: ["latent", 0], seed: job.seed, steps: Number(opt("steps", "9")), cfg: Number(opt("cfg", "1.5")), sampler_name: opt("sampler", "euler_ancestral"), scheduler: opt("scheduler", "simple"), denoise: 1 },
  };
  g.decode = { class_type: "VAEDecode", inputs: { samples: ["sample", 0], vae: ["ckpt", 2] } };
  g.save = { class_type: "SaveImage", inputs: { images: ["decode", 0], filename_prefix: `test-city/${stem(job.row)}` } };
  return g;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const t0 = Date.now();
let done = 0;
let failed = 0;
const csv = join(outDir, "timings.csv");
if (!existsSync(csv)) writeFileSync(csv, "file,layout,seed,seconds_in_comfy,finished_at\n");
const report = () => {
  const min = (Date.now() - t0) / 60000;
  const rate = done / Math.max(min, 1e-6);
  const left = jobs.length - done - failed;
  const p = { done, failed, total: jobs.length, perMinute: +rate.toFixed(2), etaMinutes: rate > 0 ? +(left / rate).toFixed(1) : null, at: new Date().toISOString() };
  writeFileSync(join(outDir, "progress.json"), JSON.stringify(p));
  process.stdout.write(`\r${done}/${jobs.length} done, ${failed} failed, ${p.perMinute}/min, eta ${p.etaMinutes ?? "?"} min   `);
};

async function run(job: (typeof jobs)[number], depths: Map<string, string>) {
  const r = await fetch(`${comfy}/prompt`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ prompt: graph(job, depths.get(job.row.layout)!), client_id: "test-city" }) });
  if (!r.ok) throw Error(`queue: ${r.status} ${await r.text()}`);
  const { prompt_id } = (await r.json()) as { prompt_id: string };
  for (;;) {
    await sleep(400);
    const h = (await (await fetch(`${comfy}/history/${prompt_id}`)).json()) as Record<string, { status?: { status_str?: string; messages?: [string, { timestamp?: number }][] }; outputs?: Record<string, { images?: { filename: string; subfolder: string; type: string }[] }> }>;
    const e = h[prompt_id];
    if (!e) continue;
    if (e.status?.status_str === "error") throw Error(`comfy error on ${job.name}`);
    const img = Object.values(e.outputs ?? {}).flatMap((o) => o.images ?? [])[0];
    if (!img) continue;
    const q = new URLSearchParams({ filename: img.filename, subfolder: img.subfolder, type: img.type });
    writeFileSync(join(outDir, job.name), Buffer.from(await (await fetch(`${comfy}/view?${q}`)).arrayBuffer()));
    const ts = (e.status?.messages ?? []).map(([, m]) => m.timestamp ?? 0).filter(Boolean);
    const secs = ts.length > 1 ? (Math.max(...ts) - Math.min(...ts)) / 1000 : "";
    appendFileSync(csv, `${job.name},${job.row.layout},${job.seed},${secs},${new Date().toISOString()}\n`);
    return;
  }
}

const depths = new Map<string, string>();
for (const l of new Set(jobs.map((j) => j.row.layout))) depths.set(l, await upload(join(poses, `${l}.depth.png`)));
const queue = [...jobs];
await Promise.all(
  Array.from({ length: inflight }, async () => {
    for (let job = queue.shift(); job; job = queue.shift()) {
      try {
        await run(job, depths);
        done++;
      } catch (e) {
        failed++;
        console.log(`\n${(e as Error).message}`);
      }
      report();
    }
  }),
);
report();
console.log(`\nfinished: ${done} drawn, ${failed} failed in ${((Date.now() - t0) / 60000).toFixed(1)} min. Rate them: pnpm exec tsx tools/review.ts sheet ${outDir}`);
