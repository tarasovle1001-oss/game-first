// "Derive, do not regenerate": take a picture that already came out right and repaint only a region of it -
// her face, her clothes, what is on her - leaving the pose and the contact untouched. Trial of whether the
// stack repaints a region cleanly (no seam, same style) so that one approved frame can give every state.
//
//   pnpm exec tsx tools/derive-test.ts serve <dir>   -> http://127.0.0.1:8192 : paint two masks per frame of <dir>/src
//   pnpm exec tsx tools/derive-test.ts run <dir> [--comfy http://127.0.0.1:8188] [--cast default] [--who "tags of the heroine"]
//
// <dir>/src      the approved frames (png / webp / jpg)
// <dir>/masks    NAME.face.png, NAME.cloth.png (white = repaint) and masks.json (boxes), written by the page
// <dir>/out      NAME__VARIANT.png ; <dir>/compare.html (hold the mouse on a picture to see the original under it)
// Flow of the old packs: WAI + Lightning 8 step + Sora 0.7, 9 steps, cfg 1.5. Words come from look.yaml.
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { basename, extname, join } from "node:path";
import { content } from "../packages/base/src";

const argv = process.argv.slice(2);
const opt = (name: string, def: string) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] ? argv[i + 1]! : def;
};
const W = content.look.words;
const P = content.prompt;
const IMG = /\.(png|jpe?g|webp)$/i;
type Box = { x: number; y: number; w: number; h: number };
type Masks = Record<string, { width: number; height: number; face?: Box; cloth?: Box }>;
const stem = (f: string) => basename(f, extname(f));

// what is repainted, on which mask, how hard, with which words (all from look.yaml)
const mood = (k: string) => (W.mood.find((m) => m.when === k)?.tags ?? []).join(", ");
const VARIANTS: { id: string; label: string; mask: "face" | "cloth"; denoise: number; words: string }[] = [
  { id: "face_aroused", label: "лицо: возбуждена", mask: "face", denoise: 0.5, words: `face, ${mood("aroused")}` },
  { id: "face_ecstatic", label: "лицо: на пике", mask: "face", denoise: 0.55, words: `face, ${mood("ecstatic")}` },
  { id: "face_shy", label: "лицо: стесняется", mask: "face", denoise: 0.5, words: `face, ${mood("shy")}` },
  { id: "face_marks", label: "лицо: следы", mask: "face", denoise: 0.5, words: `face, ${mood("aroused")}, ${W.cum.face}` },
  { id: "cloth_naked", label: "одежда: без неё", mask: "cloth", denoise: 0.8, words: [W.outfit.naked, ...(W.bare.all ?? [])].join(", ") },
  { id: "cloth_lingerie", label: "одежда: бельё", mask: "cloth", denoise: 0.8, words: W.outfit.lingerie ?? "" },
];

function serve(dir: string) {
  const src = join(dir, "src");
  const masks = join(dir, "masks");
  mkdirSync(src, { recursive: true });
  mkdirSync(masks, { recursive: true });
  const page = `<!doctype html><meta charset="utf-8"><title>маски</title>
<style>:root{color-scheme:dark}body{margin:0;background:#16161a;color:#ddd;font:14px system-ui;display:flex;flex-direction:column;height:100vh}
header{padding:8px 16px;display:flex;gap:14px;align-items:center;flex-wrap:wrap}button{font:inherit;padding:4px 10px}button.on{outline:2px solid #fff}
#wrap{flex:1;display:grid;place-items:center;overflow:hidden}#stage{position:relative}canvas{position:absolute;left:0;top:0}#stage img{display:block;max-width:96vw;max-height:calc(100vh - 70px)}
kbd{background:#333;border-radius:3px;padding:0 4px}</style>
<header><b id="name"></b><button id="bf">лицо <kbd>F</kbd></button><button id="bc">одежда <kbd>C</kbd></button>
<span>кисть <kbd>[</kbd><kbd>]</kbd> <span id="size"></span> · <kbd>E</kbd> ластик <span id="er"></span> · <kbd>X</kbd> очистить слой · <kbd>S</kbd> сохранить и дальше · <kbd>←→</kbd> листать</span><b id="msg"></b></header>
<div id="wrap"><div id="stage"><img id="im"><canvas id="cv"></canvas></div></div>
<script>
let files=[],i=0,layer="face",size=40,erase=false,down=false;const L={face:null,cloth:null};const COL={face:"rgba(255,60,60,.55)",cloth:"rgba(60,120,255,.55)"};
const im=document.getElementById("im"),cv=document.getElementById("cv"),ctx=cv.getContext("2d");
const off=k=>{const c=document.createElement("canvas");c.width=im.naturalWidth;c.height=im.naturalHeight;return c};
function ui(){document.getElementById("bf").className=layer==="face"?"on":"";document.getElementById("bc").className=layer==="cloth"?"on":"";document.getElementById("size").textContent=size;document.getElementById("er").textContent=erase?"(вкл)":"";document.getElementById("name").textContent=(i+1)+"/"+files.length+" "+(files[i]||"")}
function draw(){cv.width=im.clientWidth;cv.height=im.clientHeight;ctx.clearRect(0,0,cv.width,cv.height);for(const k of ["cloth","face"]){if(!L[k])continue;const t=document.createElement("canvas");t.width=cv.width;t.height=cv.height;const x=t.getContext("2d");x.drawImage(L[k],0,0,cv.width,cv.height);x.globalCompositeOperation="source-in";x.fillStyle=COL[k];x.fillRect(0,0,cv.width,cv.height);ctx.drawImage(t,0,0)}}
function open(n){i=(n+files.length)%files.length;im.onload=()=>{L.face=off();L.cloth=off();draw();ui()};im.src="/src/"+encodeURIComponent(files[i])+"?"+Date.now()}
function dab(e){const r=cv.getBoundingClientRect(),s=im.naturalWidth/r.width,x=(e.clientX-r.left)*s,y=(e.clientY-r.top)*s,c=L[layer].getContext("2d");c.globalCompositeOperation=erase?"destination-out":"source-over";c.fillStyle="#fff";c.beginPath();c.arc(x,y,size*s/2,0,7);c.fill();draw()}
cv.onpointerdown=e=>{down=true;cv.setPointerCapture(e.pointerId);dab(e)};cv.onpointermove=e=>{if(down)dab(e)};cv.onpointerup=()=>down=false;
function box(c){const d=c.getContext("2d").getImageData(0,0,c.width,c.height).data;let x0=1e9,y0=1e9,x1=-1,y1=-1;for(let y=0;y<c.height;y++)for(let x=0;x<c.width;x++)if(d[(y*c.width+x)*4+3]>10){if(x<x0)x0=x;if(x>x1)x1=x;if(y<y0)y0=y;if(y>y1)y1=y}return x1<0?null:{x:x0,y:y0,w:x1-x0+1,h:y1-y0+1}}
function png(c){const t=document.createElement("canvas");t.width=c.width;t.height=c.height;const x=t.getContext("2d");x.fillStyle="#000";x.fillRect(0,0,t.width,t.height);x.drawImage(c,0,0);return t.toDataURL("image/png")}
async function save(){const body={file:files[i],width:im.naturalWidth,height:im.naturalHeight};for(const k of ["face","cloth"]){const b=box(L[k]);if(b){body[k]={box:b,png:png(L[k])}}}
 const r=await fetch("/save",{method:"POST",body:JSON.stringify(body)});document.getElementById("msg").textContent=r.ok?"сохранено: "+files[i]:"ошибка";if(r.ok)open(i+1)}
addEventListener("keydown",e=>{const k=e.key.toLowerCase();if(k==="f"||k==="а")layer="face";else if(k==="c"||k==="с")layer="cloth";else if(k==="[")size=Math.max(6,size-8);else if(k==="]")size+=8;else if(k==="e"||k==="у")erase=!erase;else if(k==="x"||k==="ч"){L[layer]=off();draw()}else if(k==="s"||k==="ы"){e.preventDefault();save()}else if(e.key==="ArrowRight")open(i+1);else if(e.key==="ArrowLeft")open(i-1);ui()});
document.getElementById("bf").onclick=()=>{layer="face";ui()};document.getElementById("bc").onclick=()=>{layer="cloth";ui()};addEventListener("resize",draw);
fetch("/list").then(r=>r.json()).then(l=>{files=l;if(files.length)open(0);else document.getElementById("msg").textContent="в папке src пусто"});
</script>`;
  createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://x");
    if (url.pathname === "/") return void res.writeHead(200, { "content-type": "text/html; charset=utf-8" }).end(page);
    if (url.pathname === "/list") return void res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(readdirSync(src).filter((f) => IMG.test(f)).sort()));
    if (url.pathname.startsWith("/src/")) {
      const f = join(src, basename(decodeURIComponent(url.pathname.slice(5))));
      return existsSync(f) ? void res.writeHead(200).end(readFileSync(f)) : void res.writeHead(404).end();
    }
    if (url.pathname === "/save" && req.method === "POST") {
      const chunks: Buffer[] = [];
      req.on("data", (c: Buffer) => chunks.push(c));
      req.on("end", () => {
        const b = JSON.parse(Buffer.concat(chunks).toString("utf8")) as { file: string; width: number; height: number; face?: { box: Box; png: string }; cloth?: { box: Box; png: string } };
        const file = join(masks, "masks.json");
        const all: Masks = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : {};
        const name = stem(basename(b.file));
        all[b.file] = { width: b.width, height: b.height };
        for (const k of ["face", "cloth"] as const)
          if (b[k]) {
            writeFileSync(join(masks, `${name}.${k}.png`), Buffer.from(b[k]!.png.split(",")[1]!, "base64"));
            all[b.file]![k] = b[k]!.box;
          }
        writeFileSync(file, JSON.stringify(all, null, 1));
        res.writeHead(200).end("ok");
      });
      return;
    }
    res.writeHead(404).end();
  }).listen(8192, "127.0.0.1", () => console.log(`paint masks: http://127.0.0.1:8192  (frames from ${src})`));
}

async function run(dir: string) {
  const comfy = opt("comfy", "http://127.0.0.1:8188").replace(/\/$/, "");
  const src = join(dir, "src");
  const out = join(dir, "out");
  mkdirSync(out, { recursive: true });
  const masks: Masks = JSON.parse(readFileSync(join(dir, "masks", "masks.json"), "utf8"));
  const cast = content.casts.find((c) => c.id === opt("cast", "default")) ?? content.casts[0]!;
  // her look: --who "tags", or <dir>/who.txt when it is there, else the cast card
  const whoFile = join(dir, "who.txt");
  const who = opt("who", existsSync(whoFile) ? readFileSync(whoFile, "utf8").trim() : [cast.wife.appearance, cast.wife.body].filter(Boolean).join(", "));
  const jobs = Object.keys(masks).flatMap((file) => VARIANTS.filter((v) => masks[file]![v.mask]).map((v) => ({ file, v, name: `${stem(file)}__${v.id}.png` })));
  const todo = jobs.filter((j) => !existsSync(join(out, j.name)));

  const upload = async (path: string, as: string) => {
    const form = new FormData();
    form.append("image", new Blob([readFileSync(path)]), as);
    form.append("overwrite", "true");
    const r = await fetch(`${comfy}/upload/image`, { method: "POST", body: form });
    if (!r.ok) throw Error(`upload ${path}: ${r.status}`);
    return ((await r.json()) as { name: string }).name;
  };
  const up = new Map<string, string>();
  for (const file of Object.keys(masks)) {
    up.set(file, await upload(join(src, file), `tcd_${file}`));
    for (const k of ["face", "cloth"] as const) if (masks[file]![k]) up.set(`${file}:${k}`, await upload(join(dir, "masks", `${stem(file)}.${k}.png`), `tcd_${stem(file)}.${k}.png`));
  }

  // rows of the page
  const rows = Object.keys(masks).map((file) => ({ file, cells: VARIANTS.filter((v) => masks[file]![v.mask]).map((v) => ({ label: v.label, f: `out/${stem(file)}__${v.id}.png` })) }));
  writeFileSync(
    join(dir, "compare.html"),
    `<!doctype html><meta charset="utf-8"><title>derive test</title><style>:root{color-scheme:dark}body{margin:0;background:#16161a;color:#ddd;font:14px system-ui}
header{position:sticky;top:0;background:#16161aee;padding:8px 16px;z-index:2}table{border-collapse:collapse;margin:8px 16px}td{padding:4px;vertical-align:top}
.c{position:relative;background:#222;min-width:120px;min-height:80px;border-radius:6px;overflow:hidden;cursor:pointer}.c img{display:block;max-width:var(--w,420px)}.c b{position:absolute;left:4px;top:2px;font-size:11px;background:#000a;padding:0 4px;border-radius:3px}
.c.wait img{visibility:hidden}.c.wait::after{content:"ждём";position:absolute;inset:0;display:grid;place-items:center;color:#666}
#big{position:fixed;inset:0;background:#000e;display:none;align-items:center;justify-content:center;z-index:3}#big img{max-height:98vh;max-width:98vw}kbd{background:#333;border-radius:3px;padding:0 4px}</style>
<header>Слева оригинал. <b>Зажми мышь на картинке</b> - покажется оригинал на её месте (так виден шов и что изменилось). <kbd>Space</kbd> под курсором - крупно, там же зажатие работает. <kbd>+</kbd><kbd>-</kbd> размер. <span id="n"></span></header>
<table id="t"></table><div id="big"><img></div><script>
const rows=${JSON.stringify(rows)};let w=420,hover=null;const t=document.getElementById("t"),big=document.getElementById("big"),bi=big.querySelector("img");let total=0,ok=0;
const cell=(label,f,orig)=>{const c=document.createElement("div");c.className="c"+(orig===f?"":" wait");c.innerHTML="<b>"+label+"</b><img>";const im=c.querySelector("img");
 if(orig===f){im.src=encodeURI(f)}else{total++;const load=()=>{im.src=encodeURI(f)+"?"+Date.now()};im.onload=()=>{if(c.classList.contains("wait")){c.classList.remove("wait");ok++;document.getElementById("n").textContent="готово "+ok+" / "+total}};im.onerror=()=>setTimeout(load,4000);load();
  c.onpointerdown=()=>{im.dataset.v=im.src;im.src=encodeURI(orig)};c.onpointerup=c.onpointerleave=()=>{if(im.dataset.v){im.src=im.dataset.v;delete im.dataset.v}}}
 c.onmouseenter=()=>hover={f,orig};return c};
rows.forEach(r=>{const tr=document.createElement("tr"),o="src/"+r.file;const td=document.createElement("td");td.append(cell("оригинал",o,o));tr.append(td);r.cells.forEach(x=>{const d=document.createElement("td");d.append(cell(x.label,x.f,o));tr.append(d)});t.append(tr)});
addEventListener("keydown",e=>{if(e.key===" "&&hover){e.preventDefault();if(big.style.display==="flex"){big.style.display="none"}else{bi.src=encodeURI(hover.f);big.style.display="flex";big.onpointerdown=()=>bi.src=encodeURI(hover.orig);big.onpointerup=()=>bi.src=encodeURI(hover.f)}}else if(e.key==="+"||e.key==="="){w+=60}else if(e.key==="-"){w=Math.max(160,w-60)}document.documentElement.style.setProperty("--w",w+"px")});
</script>`,
  );
  console.log(`${Object.keys(masks).length} frames, ${jobs.length} repaints, ${todo.length} to do -> ${out}\nopen ${join(dir, "compare.html")}`);

  const snap = (n: number) => Math.max(8, Math.round(n / 8) * 8);
  const graph = (job: (typeof jobs)[number], seed: number) => {
    const m = masks[job.file]!;
    const b = m[job.v.mask]!;
    const pad = job.v.mask === "face" ? 56 : 40;
    const x = Math.max(0, Math.floor((b.x - pad) / 8) * 8);
    const y = Math.max(0, Math.floor((b.y - pad) / 8) * 8);
    const w = Math.min(m.width - x, snap(b.x + b.w + pad - x));
    const h = Math.min(m.height - y, snap(b.y + b.h + pad - y));
    // a small region is worked on enlarged, the way a detailer does it
    const s = Math.min(4, Math.max(1, 1024 / Math.max(w, h)));
    const W2 = snap(w * s);
    const H2 = snap(h * s);
    const text = [P.style.prefix, "1girl", "adult woman, mature female", who, job.v.words].filter(Boolean).join(", ");
    const g: Record<string, { class_type: string; inputs: Record<string, unknown> }> = {};
    g.ckpt = { class_type: "CheckpointLoaderSimple", inputs: { ckpt_name: "waiIllustriousSDXL_v170.safetensors" } };
    g.l0 = { class_type: "LoraLoader", inputs: { model: ["ckpt", 0], clip: ["ckpt", 1], lora_name: "sdxl_lightning_8step_lora.safetensors", strength_model: 1, strength_clip: 1 } };
    g.l1 = { class_type: "LoraLoader", inputs: { model: ["l0", 0], clip: ["l0", 1], lora_name: "sora_v2-000010.safetensors", strength_model: 0.7, strength_clip: 0.7 } };
    g.skip = { class_type: "CLIPSetLastLayer", inputs: { clip: ["l1", 1], stop_at_clip_layer: -2 } };
    g.pos = { class_type: "CLIPTextEncode", inputs: { clip: ["skip", 0], text } };
    g.neg = { class_type: "CLIPTextEncode", inputs: { clip: ["skip", 0], text: P.style.negative } };
    g.img = { class_type: "LoadImage", inputs: { image: up.get(job.file) } };
    g.mimg = { class_type: "LoadImage", inputs: { image: up.get(`${job.file}:${job.v.mask}`) } };
    g.crop = { class_type: "ImageCrop", inputs: { image: ["img", 0], width: w, height: h, x, y } };
    g.mcrop = { class_type: "ImageCrop", inputs: { image: ["mimg", 0], width: w, height: h, x, y } };
    g.big = { class_type: "ImageScale", inputs: { image: ["crop", 0], upscale_method: "lanczos", width: W2, height: H2, crop: "disabled" } };
    g.mbig = { class_type: "ImageScale", inputs: { image: ["mcrop", 0], upscale_method: "bilinear", width: W2, height: H2, crop: "disabled" } };
    g.mlat = { class_type: "ImageToMask", inputs: { image: ["mbig", 0], channel: "red" } };
    g.grow = { class_type: "GrowMask", inputs: { mask: ["mlat", 0], expand: 12, tapered_corners: true } };
    g.enc = { class_type: "VAEEncode", inputs: { pixels: ["big", 0], vae: ["ckpt", 2] } };
    g.lat = { class_type: "SetLatentNoiseMask", inputs: { samples: ["enc", 0], mask: ["grow", 0] } };
    g.sample = { class_type: "KSampler", inputs: { model: ["l1", 0], positive: ["pos", 0], negative: ["neg", 0], latent_image: ["lat", 0], seed, steps: 9, cfg: 1.5, sampler_name: "euler_ancestral", scheduler: "simple", denoise: job.v.denoise } };
    g.dec = { class_type: "VAEDecode", inputs: { samples: ["sample", 0], vae: ["ckpt", 2] } };
    g.small = { class_type: "ImageScale", inputs: { image: ["dec", 0], upscale_method: "lanczos", width: w, height: h, crop: "disabled" } };
    // only the painted region goes back, with a soft edge; every other pixel stays the original's
    g.mblur = { class_type: "ImageBlur", inputs: { image: ["mcrop", 0], blur_radius: 6, sigma: 3 } };
    g.mpaste = { class_type: "ImageToMask", inputs: { image: ["mblur", 0], channel: "red" } };
    g.paste = { class_type: "ImageCompositeMasked", inputs: { destination: ["img", 0], source: ["small", 0], x, y, resize_source: false, mask: ["mpaste", 0] } };
    g.save = { class_type: "SaveImage", inputs: { images: ["paste", 0], filename_prefix: `test-city-derive/${job.name.replace(/\.png$/, "")}` } };
    return g;
  };

  const csv = join(dir, "timings.csv");
  if (!existsSync(csv)) writeFileSync(csv, "file,variant,seconds_in_comfy\n");
  const t0 = Date.now();
  let done = 0;
  let failed = 0;
  const report = (now: string) => {
    const rate = done / Math.max((Date.now() - t0) / 60000, 1e-6);
    writeFileSync(join(dir, "progress.json"), JSON.stringify({ done, failed, total: todo.length, perMinute: +rate.toFixed(2), etaMinutes: rate > 0 ? +((todo.length - done - failed) / rate).toFixed(1) : null, now, at: new Date().toISOString() }));
    console.log(`${done}/${todo.length} done, ${failed} failed, ${rate.toFixed(2)}/min ${now}`);
  };
  report("starting");
  for (const [n, job] of todo.entries()) {
    try {
      const r = await fetch(`${comfy}/prompt`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ prompt: graph(job, 7000 + n), client_id: "test-city" }) });
      if (!r.ok) throw Error(`queue ${r.status}: ${(await r.text()).slice(0, 500)}`);
      const { prompt_id } = (await r.json()) as { prompt_id: string };
      for (;;) {
        await new Promise((res) => setTimeout(res, 500));
        const h = (await (await fetch(`${comfy}/history/${prompt_id}`)).json()) as Record<string, { status?: { status_str?: string; messages?: [string, { timestamp?: number }][] }; outputs?: Record<string, { images?: { filename: string; subfolder: string; type: string }[] }> }>;
        const e = h[prompt_id];
        if (!e) continue;
        if (e.status?.status_str === "error") throw Error(`comfy error: ${JSON.stringify(e.status.messages?.at(-1)).slice(0, 500)}`);
        const img = Object.values(e.outputs ?? {}).flatMap((o) => o.images ?? [])[0];
        if (!img) continue;
        writeFileSync(join(out, job.name), Buffer.from(await (await fetch(`${comfy}/view?${new URLSearchParams({ filename: img.filename, subfolder: img.subfolder, type: img.type })}`)).arrayBuffer()));
        const ts = (e.status?.messages ?? []).map(([, m]) => m.timestamp ?? 0).filter(Boolean);
        appendFileSync(csv, `${job.file},${job.v.id},${ts.length > 1 ? ((Math.max(...ts) - Math.min(...ts)) / 1000).toFixed(2) : ""}\n`);
        break;
      }
      done++;
    } catch (e) {
      failed++;
      console.log(`${job.name}: ${(e as Error).message}`);
    }
    report(job.name);
  }
  report("finished");
}

const [cmd, dir] = argv;
if (cmd === "serve" && dir) serve(dir);
else if (cmd === "run" && dir) await run(dir);
else console.log("derive-test.ts serve <dir> | run <dir> [--cast id] [--who tags]");
