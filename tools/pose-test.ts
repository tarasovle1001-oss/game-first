// Our own pose test: the hard layouts drawn by ComfyUI over the mannequin's depth map, in variants side by side
// (same seed in a row), with a page to look at them, rate them and count the rejects. Nothing but ComfyUI is needed.
//   pnpm exec tsx tools/pose-test.ts run <posesDir> <outDir> [--seeds 4] [--layouts a,b] [--variants plain,masks]
//        [--comfy http://127.0.0.1:8188] [--cast default] [--cn-strength 0.6] [--cn-end 0.6]
//   pnpm exec tsx tools/pose-test.ts page <posesDir> <outDir>     (the page again, e.g. after a change; pictures and marks stay)
//   pnpm exec tsx tools/pose-test.ts stats <outDir>/marks.json
// posesDir = Blender output (tools/blender/pose3d.py): LAYOUT.depth.png, LAYOUT.mask-N-ROLE.png, LAYOUT.pose.json.
// Variants: plain = one prompt for the whole frame; masks = every figure's prompt on its own mask (any number of figures);
//           none = the prompt alone, no depth (baseline); soft = depth held weakly and let go early.
// Flow: WAI + Lightning 8 step + Sora 0.7, 9 steps, cfg 1.5, euler_ancestral / simple, clip skip 2 - as in the old packs.
// Watch: <outDir>/compare.html (fills in as pictures arrive), <outDir>/progress.json, <outDir>/timings.csv.
import { appendFileSync, copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { content, promptFor } from "../packages/base/src";
import type { SceneDesc } from "../packages/core/src";

const argv = process.argv.slice(2);
const opt = (name: string, def: string) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] ? argv[i + 1]! : def;
};
const wife = { id: "wife", role: "wife" };
const man = (n: number) => ({ id: `p${n}`, role: n === 1 ? "patron" : `patron${n}` });
const her = { outfit: "daring", face: "aroused", under: "off", skirt: "up" };
// the hard ones: several men with one lying down, hands on him, endings
const TESTS: Record<string, SceneDesc> = {
  group_dp: { type: "group_dp", location: "cafe.staff", participants: [wife, man(1), man(2)], tags: { ...her, outfit: "naked", bare: "all", men: "2", size: "3", size2: "3" } },
  group_spitroast_hand: { type: "group_spitroast_hand", location: "cafe.staff", participants: [wife, man(1), man(2), man(3)], tags: { ...her, outfit: "naked", bare: "all", men: "3", size: "3", size2: "3", size3: "3" } },
  group_sex_hand: { type: "group_sex_hand", location: "cafe.lounge", participants: [wife, man(1), man(2)], tags: { ...her, men: "2", size: "3", size2: "3" } },
  patron_handjob: { type: "patron_handjob", location: "cafe.staff", participants: [wife, man(1)], tags: { outfit: "daring", face: "shy", size: "4" } },
  patron_riding: { type: "patron_riding", location: "hotel.room1", participants: [wife, man(1)], tags: { ...her, outfit: "lingerie", face: "ecstatic", size: "3" } },
  patron_fin_face: { type: "patron_fin_face", location: "cafe.staff", participants: [wife, man(1)], tags: { outfit: "daring", face: "aroused", fin: "face", size: "3" } },
};
const LABEL: Record<string, string> = { outfit: "одежда", bare: "раздета", face: "лицо", under: "трусики", skirt: "юбка", men: "мужчин", fin: "финал", marks: "следы", size: "гость", size2: "гость 2", size3: "гость 3", hsize: "муж", gape: "растянута", sore: "натёрта", after: "после", drunk: "пьяна", crowd: "зеваки" };
const SIZE = ["крошечный", "маленький", "средний", "большой", "огромный"];
const REASONS: Record<number, string> = { 1: "good", 2: "pose", 3: "anatomy", 4: "mixed", 5: "other" };

type Job = { layout: string; seed: number; variant: string; file: string };
type Node = { class_type: string; inputs: Record<string, unknown> };

/** What the picture is meant to show: the scene by name, the room, her state, the mannequin it is drawn over, the prompts. */
function contextOf(poses: string, dir: string, layout: string, cast: string) {
  const d = TESTS[layout]!;
  const ru = content.locales.ru ?? {};
  const p = promptFor(d, cast);
  const ref = join(poses, `${layout}.preview.png`);
  if (existsSync(ref)) copyFileSync(ref, join(dir, `_ref_${layout}.png`));
  return {
    title: ru[`scene.${layout}`] ?? layout,
    room: ru[`loc.${d.location}`] ?? d.location,
    who: d.participants.map((x) => x.role).join(", "),
    tags: Object.entries(d.tags ?? {}).map(([k, v]) => `${LABEL[k] ?? k}: ${k.includes("size") ? `${SIZE[Number(v)]}` : v}`).join(" · "),
    ref: existsSync(ref) ? `_ref_${layout}.png` : "",
    shared: p.shared,
    regions: p.regions,
    negative: p.negative,
  };
}

function page(poses: string, dir: string, layouts: string[], seeds: number[], variants: string[], cast: string) {
  const ctx = Object.fromEntries(layouts.map((l) => [l, contextOf(poses, dir, l, cast)]));
  const rows = layouts.flatMap((l) => seeds.map((s) => ({ layout: l, seed: s, files: variants.map((v) => `${l}__s${s}__${v}.png`) })));
  writeFileSync(
    join(dir, "compare.html"),
    `<!doctype html><meta charset="utf-8"><title>pose test</title>
<style>
:root{color-scheme:dark}body{margin:0;background:#16161a;color:#ddd;font:14px system-ui}
header{position:sticky;top:0;background:#16161aee;padding:8px 16px;z-index:2;display:flex;gap:16px;align-items:center;flex-wrap:wrap}
progress{width:220px}table{border-collapse:collapse;margin:8px 16px}th{position:sticky;top:44px;background:#16161a;padding:4px 8px;text-align:left}
td{padding:4px;vertical-align:top}td.n{color:#bbb;font-size:12px;width:230px;max-width:230px}td.n h3{margin:0 0 4px;font-size:15px;color:#fff}td.n img{width:220px;display:block;border-radius:4px;margin:4px 0;cursor:zoom-in}td.n small{color:#888}details{margin-top:4px}details p{margin:4px 0;color:#9a9;word-break:break-word}details p b{color:#ccc}
tr.first td{border-top:2px solid #333;padding-top:10px}
.c{border:3px solid transparent;border-radius:6px;overflow:hidden;position:relative;min-width:120px;min-height:80px;background:#222;cursor:pointer}
.c img{display:block;max-width:var(--w,380px);max-height:70vh}.c.wait img{visibility:hidden}.c.wait::after{content:"ждём";position:absolute;inset:0;display:grid;place-items:center;color:#666}
.cur{border-color:#fff}.m1{border-color:#3a3}.m2{border-color:#c80}.m3{border-color:#c33}.m4{border-color:#a3c}.m5{border-color:#777}.cur.m1,.cur.m2,.cur.m3,.cur.m4,.cur.m5{outline:2px solid #fff}
.c b{position:absolute;left:4px;top:2px;font-size:11px;background:#000a;padding:0 4px;border-radius:3px}
#big{position:fixed;inset:0;background:#000e;display:none;align-items:center;justify-content:center;z-index:3}#big img{max-height:98vh;max-width:98vw}
kbd{background:#333;border-radius:3px;padding:0 4px}
</style>
<header><b id="count"></b><progress id="bar" max="1" value="0"></progress><span id="rate"></span>
<span><kbd>1</kbd> ok <kbd>2</kbd> поза <kbd>3</kbd> тело/руки <kbd>4</kbd> фигуры смешались <kbd>5</kbd> другое · <kbd>←→↑↓</kbd> · <kbd>Space</kbd> крупно · <kbd>Z</kbd> отмена · <kbd>E</kbd> выгрузить marks.json · <kbd>+</kbd><kbd>-</kbd> размер</span></header>
<table id="t"><tr><th>что должно быть</th>${variants.map((v) => `<th>${v === "plain" ? "plain - один промпт на кадр" : v === "masks" ? "masks - промпт фигуры на её маске" : v === "none" ? "none - только промпт, без манекена" : v === "soft" ? "soft - манекен слабо (0.35 до 35%)" : v}</th>`).join("")}</tr></table><div id="big"><img></div>
<script>
const ctx=${JSON.stringify(ctx)},rows=${JSON.stringify(rows)},variants=${JSON.stringify(variants)},store="pose-test:"+location.pathname;
let marks={};try{marks=JSON.parse(localStorage.getItem(store)||"{}")}catch{}
const cells=[];const t=document.getElementById("t");let cur=0,w=380;const undo=[];
const esc=s=>String(s).replace(/[&<>]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;"}[c]));let last="";
rows.forEach(r=>{const tr=document.createElement("tr"),x=ctx[r.layout],first=r.layout!==last;last=r.layout;if(first)tr.className="first";
 tr.innerHTML='<td class="n">'+(first?'<h3>'+esc(x.title)+'</h3>'+esc(x.room)+'<br><small>'+esc(x.who)+'</small><br><small>'+esc(x.tags)+'</small>'+(x.ref?'<img class="ref" src="'+x.ref+'" title="манекен, по которому рисуется">':'')
  +'<details><summary>промпты</summary><p><b>общий:</b> '+esc(x.shared)+'</p>'+Object.entries(x.regions).map(([k,v])=>'<p><b>'+k+':</b> '+esc(v)+'</p>').join("")+'<p><b>негатив:</b> '+esc(x.negative)+'</p></details>':'<small>'+r.layout+'</small>')+'<br><small>seed '+r.seed+'</small></td>';
 const ri=tr.querySelector("img.ref");if(ri)ri.onclick=()=>{const b=document.getElementById("big");b.querySelector("img").src=ri.src;b.style.display="flex"};
 r.files.forEach((f,i)=>{const td=document.createElement("td");const c=document.createElement("div");c.className="c wait";c.innerHTML='<b></b><img>';const img=c.querySelector("img");
  const load=()=>{img.src=encodeURI(f)+"?"+Date.now()};img.onload=()=>{c.classList.remove("wait");c.dataset.ok=1;draw()};img.onerror=()=>setTimeout(load,5000);load();
  const n=cells.length;c.onclick=()=>{cur=n;draw()};cells.push({c,f,layout:r.layout,variant:variants[i]});td.append(c);tr.append(td)});t.append(tr)});
const save=()=>{try{localStorage.setItem(store,JSON.stringify(marks))}catch{}};
function draw(){let ok=0;cells.forEach((x,i)=>{if(x.c.dataset.ok)ok++;const m=marks[x.f];x.c.className="c"+(x.c.dataset.ok?"":" wait")+(i===cur?" cur":"")+(m?" m"+m:"");x.c.querySelector("b").textContent=m?m:""});
 document.getElementById("bar").value=ok/cells.length;document.getElementById("count").textContent="готово "+ok+" / "+cells.length+" · оценено "+Object.keys(marks).length;document.documentElement.style.setProperty("--w",w+"px")}
addEventListener("keydown",e=>{const big=document.getElementById("big"),n=variants.length;
 if(e.key>="1"&&e.key<="5"){undo.push([cells[cur].f,marks[cells[cur].f]]);marks[cells[cur].f]=+e.key;save();cur=Math.min(cur+1,cells.length-1)}
 else if(e.key==="ArrowRight")cur=Math.min(cur+1,cells.length-1);else if(e.key==="ArrowLeft")cur=Math.max(cur-1,0);
 else if(e.key==="ArrowDown")cur=Math.min(cur+n,cells.length-1);else if(e.key==="ArrowUp")cur=Math.max(cur-n,0);
 else if(e.key==="z"||e.key==="Z"||e.key==="я"){const u=undo.pop();if(u){if(u[1])marks[u[0]]=u[1];else delete marks[u[0]];save();cur=cells.findIndex(x=>x.f===u[0])}}
 else if(e.key==="+"||e.key==="="){w+=60}else if(e.key==="-"){w=Math.max(160,w-60)}
 else if(e.key===" "){e.preventDefault();big.style.display=big.style.display==="flex"?"none":"flex";big.querySelector("img").src=encodeURI(cells[cur].f);return}
 else if(e.key==="e"||e.key==="E"||e.key==="у"){const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([JSON.stringify({marks,cells:cells.map(x=>({f:x.f,layout:x.layout,variant:x.variant}))},null,1)],{type:"application/json"}));a.download="marks.json";a.click();return}
 else return;e.preventDefault();if(big.style.display==="flex")big.querySelector("img").src=encodeURI(cells[cur].f);draw();cells[cur].c.scrollIntoView({block:"nearest"})});
document.getElementById("big").onclick=e=>e.currentTarget.style.display="none";draw();
</script>`,
  );
}

async function run(poses: string, out: string) {
  const comfy = opt("comfy", "http://127.0.0.1:8188").replace(/\/$/, "");
  const layouts = opt("layouts", Object.keys(TESTS).join(",")).split(",").filter((l) => TESTS[l] && existsSync(join(poses, `${l}.depth.png`)));
  const seeds = Array.from({ length: Number(opt("seeds", "4")) }, (_, i) => 5000 + i);
  const variants = opt("variants", "plain,masks").split(",");
  mkdirSync(out, { recursive: true });
  page(poses, out, layouts, seeds, variants, opt("cast", "default"));
  const jobs: Job[] = layouts.flatMap((layout) => seeds.flatMap((seed) => variants.map((variant) => ({ layout, seed, variant, file: `${layout}__s${seed}__${variant}.png` })))).filter((j) => !existsSync(join(out, j.file)));
  const prompts = Object.fromEntries(layouts.map((l) => [l, promptFor(TESTS[l]!, opt("cast", "default"))]));
  writeFileSync(join(out, "prompts.json"), JSON.stringify(prompts, null, 1));
  console.log(`${layouts.length} layouts x ${seeds.length} seeds x ${variants.length} variants: ${jobs.length} to draw -> ${out}\nopen ${join(out, "compare.html")}`);

  const upload = async (path: string) => {
    const form = new FormData();
    form.append("image", new Blob([readFileSync(path)], { type: "image/png" }), `tc_${basename(path)}`);
    form.append("overwrite", "true");
    const r = await fetch(`${comfy}/upload/image`, { method: "POST", body: form });
    if (!r.ok) throw Error(`upload ${path}: ${r.status}`);
    return ((await r.json()) as { name: string }).name;
  };
  const files = new Map<string, { depth: string; masks: Record<string, string>; w: number; h: number }>();
  for (const l of layouts) {
    const pose = JSON.parse(readFileSync(join(poses, `${l}.pose.json`), "utf8")) as { width: number; height: number };
    const masks: Record<string, string> = {};
    for (const f of readdirSync(poses)) {
      const m = f.match(new RegExp(`^${l}\\.mask-\\d+-(\\w+)\\.png$`));
      if (m) masks[m[1]!] = await upload(join(poses, f));
    }
    files.set(l, { depth: await upload(join(poses, `${l}.depth.png`)), masks, w: pose.width, h: pose.height });
  }

  const graph = (job: Job) => {
    const p = prompts[job.layout]!;
    const f = files.get(job.layout)!;
    const g: Record<string, Node> = {};
    g.ckpt = { class_type: "CheckpointLoaderSimple", inputs: { ckpt_name: opt("ckpt", "waiIllustriousSDXL_v170.safetensors") } };
    g.l0 = { class_type: "LoraLoader", inputs: { model: ["ckpt", 0], clip: ["ckpt", 1], lora_name: "sdxl_lightning_8step_lora.safetensors", strength_model: 1, strength_clip: 1 } };
    g.l1 = { class_type: "LoraLoader", inputs: { model: ["l0", 0], clip: ["l0", 1], lora_name: "sora_v2-000010.safetensors", strength_model: 0.7, strength_clip: 0.7 } };
    g.skip = { class_type: "CLIPSetLastLayer", inputs: { clip: ["l1", 1], stop_at_clip_layer: -2 } };
    const enc = (id: string, text: string): [string, number] => {
      g[id] = { class_type: "CLIPTextEncode", inputs: { clip: ["skip", 0], text } };
      return [id, 0];
    };
    let positive: [string, number];
    if (job.variant === "masks") {
      // the frame as a whole knows only the shared words; who each figure is lives on its mask
      positive = enc("pos", p.shared);
      for (const [role, text] of Object.entries(p.regions)) {
        if (!f.masks[role]) continue;
        g[`img_${role}`] = { class_type: "LoadImage", inputs: { image: f.masks[role] } };
        g[`mask_${role}`] = { class_type: "ImageToMask", inputs: { image: [`img_${role}`, 0], channel: "red" } };
        g[`set_${role}`] = { class_type: "ConditioningSetMask", inputs: { conditioning: enc(`txt_${role}`, `${text}, ${p.shared}`), mask: [`mask_${role}`, 0], strength: 1, set_cond_area: "default" } };
        g[`mix_${role}`] = { class_type: "ConditioningCombine", inputs: { conditioning_1: positive, conditioning_2: [`set_${role}`, 0] } };
        positive = [`mix_${role}`, 0];
      }
    } else positive = enc("pos", p.positive);
    g.neg = { class_type: "CLIPTextEncode", inputs: { clip: ["skip", 0], text: p.negative } };
    g.depth = { class_type: "LoadImage", inputs: { image: f.depth } };
    g.cn = { class_type: "ControlNetLoader", inputs: { control_net_name: opt("cn", "noob_depth_fp16.safetensors") } };
    const soft = job.variant === "soft";
    g.apply = { class_type: "ControlNetApplyAdvanced", inputs: { positive, negative: ["neg", 0], control_net: ["cn", 0], image: ["depth", 0], strength: soft ? 0.35 : Number(opt("cn-strength", "0.6")), start_percent: 0, end_percent: soft ? 0.35 : Number(opt("cn-end", "0.6")) } };
    // "none": the prompt alone, no mannequin - the baseline everything else has to beat
    const cond = job.variant === "none" ? { positive, negative: ["neg", 0] as [string, number] } : { positive: ["apply", 0] as [string, number], negative: ["apply", 1] as [string, number] };
    g.latent = { class_type: "EmptyLatentImage", inputs: { width: f.w, height: f.h, batch_size: 1 } };
    g.sample = { class_type: "KSampler", inputs: { model: ["l1", 0], positive: cond.positive, negative: cond.negative, latent_image: ["latent", 0], seed: job.seed, steps: 9, cfg: 1.5, sampler_name: "euler_ancestral", scheduler: "simple", denoise: 1 } };
    g.decode = { class_type: "VAEDecode", inputs: { samples: ["sample", 0], vae: ["ckpt", 2] } };
    g.save = { class_type: "SaveImage", inputs: { images: ["decode", 0], filename_prefix: `test-city/${job.file.replace(/\.png$/, "")}` } };
    return g;
  };

  const csv = join(out, "timings.csv");
  if (!existsSync(csv)) writeFileSync(csv, "file,layout,variant,seed,seconds_in_comfy\n");
  const t0 = Date.now();
  let done = 0;
  let failed = 0;
  const report = (now = "") => {
    const rate = done / Math.max((Date.now() - t0) / 60000, 1e-6);
    const left = jobs.length - done - failed;
    writeFileSync(join(out, "progress.json"), JSON.stringify({ done, failed, total: jobs.length, perMinute: +rate.toFixed(2), etaMinutes: rate > 0 ? +(left / rate).toFixed(1) : null, now, at: new Date().toISOString() }));
    console.log(`${done}/${jobs.length} done, ${failed} failed, ${rate.toFixed(2)}/min ${now}`);
  };
  report("starting");
  for (const job of jobs) {
    try {
      const r = await fetch(`${comfy}/prompt`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ prompt: graph(job), client_id: "test-city" }) });
      if (!r.ok) throw Error(`queue ${r.status}: ${(await r.text()).slice(0, 400)}`);
      const { prompt_id } = (await r.json()) as { prompt_id: string };
      for (;;) {
        await new Promise((res) => setTimeout(res, 500));
        const h = (await (await fetch(`${comfy}/history/${prompt_id}`)).json()) as Record<string, { status?: { status_str?: string; messages?: [string, { timestamp?: number }][] }; outputs?: Record<string, { images?: { filename: string; subfolder: string; type: string }[] }> }>;
        const e = h[prompt_id];
        if (!e) continue;
        if (e.status?.status_str === "error") throw Error(`comfy error: ${JSON.stringify(e.status.messages?.at(-1)).slice(0, 400)}`);
        const img = Object.values(e.outputs ?? {}).flatMap((o) => o.images ?? [])[0];
        if (!img) continue;
        writeFileSync(join(out, job.file), Buffer.from(await (await fetch(`${comfy}/view?${new URLSearchParams({ filename: img.filename, subfolder: img.subfolder, type: img.type })}`)).arrayBuffer()));
        const ts = (e.status?.messages ?? []).map(([, m]) => m.timestamp ?? 0).filter(Boolean);
        appendFileSync(csv, `${job.file},${job.layout},${job.variant},${job.seed},${ts.length > 1 ? ((Math.max(...ts) - Math.min(...ts)) / 1000).toFixed(2) : ""}\n`);
        break;
      }
      done++;
    } catch (e) {
      failed++;
      console.log(`${job.file}: ${(e as Error).message}`);
    }
    report(job.file);
  }
  report("finished");
}

function stats(marksFile: string) {
  const { marks, cells } = JSON.parse(readFileSync(marksFile, "utf8")) as { marks: Record<string, number>; cells: { f: string; layout: string; variant: string }[] };
  const by = new Map<string, Record<string, number>>();
  for (const c of cells) {
    const m = marks[c.f];
    if (!m) continue;
    for (const k of [`${c.layout} / ${c.variant}`, `ALL / ${c.variant}`]) {
      const row = by.get(k) ?? { n: 0, good: 0, pose: 0, anatomy: 0, mixed: 0, other: 0 };
      row.n!++;
      row[REASONS[m]!]!++;
      by.set(k, row);
    }
  }
  const pct = (a: number, n: number) => `${Math.round((100 * a) / Math.max(n, 1))}%`.padStart(6);
  console.log("layout / variant".padEnd(36) + "    n   good   pose   body  mixed  other");
  for (const [k, r] of [...by.entries()].sort()) console.log(`${k.padEnd(36)}${String(r.n).padStart(5)} ${pct(r.good!, r.n!)} ${pct(r.pose!, r.n!)} ${pct(r.anatomy!, r.n!)} ${pct(r.mixed!, r.n!)} ${pct(r.other!, r.n!)}`);
  const csv = join(marksFile, "..", "timings.csv");
  if (existsSync(csv)) {
    const t = new Map<string, number[]>();
    for (const l of readFileSync(csv, "utf8").trim().split("\n").slice(1)) {
      const [, , variant, , s] = l.split(",");
      if (Number(s) > 0) t.set(variant!, [...(t.get(variant!) ?? []), Number(s)]);
    }
    for (const [v, a] of t) console.log(`time in ComfyUI, ${v}: ${(a.reduce((x, y) => x + y, 0) / a.length).toFixed(2)} s per picture over ${a.length}`);
  }
}

const [cmd, a, b] = argv;
if (cmd === "run" && a && b) await run(a, b);
else if (cmd === "page" && a && b) {
  // only the page again (context, layout), the pictures and marks stay
  const layouts = opt("layouts", Object.keys(TESTS).join(",")).split(",").filter((l) => TESTS[l] && existsSync(join(a, `${l}.depth.png`)));
  page(a, b, layouts, Array.from({ length: Number(opt("seeds", "4")) }, (_, i) => 5000 + i), opt("variants", "plain,masks").split(","), opt("cast", "default"));
  console.log(`page written: ${join(b, "compare.html")}`);
}
else if (cmd === "stats" && a) stats(a);
else console.log("pose-test.ts run <posesDir> <outDir> [...] | page <posesDir> <outDir> | stats <marks.json>");
