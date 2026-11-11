// Rating a test run, by hand. The sheet is a page next to the pictures; the numbers come from the marks it exports.
//   pnpm exec tsx tools/review.ts sheet <dir>                 -> <dir>/review.html (open it from disk)
//   pnpm exec tsx tools/review.ts stats <dir>/marks.json [<dir>/timings.csv]
// Keys on the sheet: 1 good, 2 pose wrong, 3 body / hands / anatomy wrong, 4 figures mixed (her traits on him or back),
// 5 other; arrows move, Z undoes, E exports marks.json. Marks stay in the browser between visits.
import { readdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const REASONS = { 1: "good", 2: "pose", 3: "anatomy", 4: "mixed", 5: "other" } as const;

function sheet(dir: string) {
  const files = readdirSync(dir).filter((f) => /\.(png|jpe?g|webp)$/i.test(f)).sort();
  const prompts = existsSync(join(dir, "prompts.json")) ? (JSON.parse(readFileSync(join(dir, "prompts.json"), "utf8")) as { file: string; layout: string }[]) : [];
  const layoutOf = (f: string) => prompts.find((p) => f.startsWith(p.file.replace(/\.png$/, "")))?.layout ?? f.split("__")[0]!;
  const items = files.map((f) => ({ f, layout: layoutOf(f) }));
  const html = `<!doctype html><meta charset="utf-8"><title>review</title>
<style>
:root{color-scheme:dark}body{margin:0;background:#16161a;color:#ddd;font:14px system-ui}
header{position:sticky;top:0;background:#16161acc;backdrop-filter:blur(6px);padding:8px 16px;display:flex;gap:16px;align-items:center;z-index:2}
main{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:8px;padding:8px 16px}
figure{margin:0;position:relative;border:3px solid transparent;border-radius:6px;overflow:hidden;cursor:pointer}
figure.cur{border-color:#fff}img{width:100%;display:block}
figcaption{position:absolute;left:0;right:0;bottom:0;background:#000a;padding:2px 6px;font-size:11px}
.m1{border-color:#3a3}.m2{border-color:#c80}.m3{border-color:#c33}.m4{border-color:#a3c}.m5{border-color:#777}
.cur.m1,.cur.m2,.cur.m3,.cur.m4,.cur.m5{outline:2px solid #fff}
#big{position:fixed;inset:0;background:#000d;display:none;align-items:center;justify-content:center;z-index:3}#big img{max-height:96vh;max-width:96vw;width:auto}
kbd{background:#333;border-radius:3px;padding:0 4px}
</style>
<header><b id="count"></b><span><kbd>1</kbd> ok <kbd>2</kbd> поза <kbd>3</kbd> тело/руки <kbd>4</kbd> фигуры смешались <kbd>5</kbd> другое · <kbd>←→</kbd> <kbd>Space</kbd> крупно <kbd>Z</kbd> отмена <kbd>E</kbd> выгрузить marks.json</span></header>
<main id="grid"></main><div id="big"><img></div>
<script>
const items=${JSON.stringify(items)};const store="review:"+${JSON.stringify(dir)};
let marks={};try{marks=JSON.parse(localStorage.getItem(store)||"{}")}catch{}
let cur=0;const undo=[];const grid=document.getElementById("grid");
items.forEach((it,i)=>{const f=document.createElement("figure");f.innerHTML='<img loading="lazy" src="'+encodeURI(it.f)+'"><figcaption>'+it.layout+'</figcaption>';f.onclick=()=>{cur=i;draw()};grid.append(f)});
const save=()=>{try{localStorage.setItem(store,JSON.stringify(marks))}catch{}};
function draw(){[...grid.children].forEach((f,i)=>{f.className=(i===cur?"cur ":"")+(marks[items[i].f]?"m"+marks[items[i].f]:"")});
const n=Object.keys(marks).length;document.getElementById("count").textContent=n+" / "+items.length;grid.children[cur]?.scrollIntoView({block:"nearest"})}
addEventListener("keydown",e=>{const big=document.getElementById("big");
if(e.key>="1"&&e.key<="5"){undo.push([items[cur].f,marks[items[cur].f]]);marks[items[cur].f]=+e.key;save();cur=Math.min(cur+1,items.length-1)}
else if(e.key==="ArrowRight")cur=Math.min(cur+1,items.length-1);else if(e.key==="ArrowLeft")cur=Math.max(cur-1,0);
else if(e.key==="ArrowDown"||e.key==="ArrowUp"){const cols=getComputedStyle(grid).gridTemplateColumns.split(" ").length;cur=Math.max(0,Math.min(items.length-1,cur+(e.key==="ArrowDown"?cols:-cols)))}
else if(e.key==="z"||e.key==="Z"){const u=undo.pop();if(u){if(u[1])marks[u[0]]=u[1];else delete marks[u[0]];save();cur=items.findIndex(x=>x.f===u[0])}}
else if(e.key===" "){e.preventDefault();big.style.display=big.style.display==="flex"?"none":"flex";big.querySelector("img").src=encodeURI(items[cur].f);return}
else if(e.key==="e"||e.key==="E"){const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([JSON.stringify({marks,items},null,1)],{type:"application/json"}));a.download="marks.json";a.click();return}
else return;e.preventDefault();if(big.style.display==="flex")big.querySelector("img").src=encodeURI(items[cur].f);draw()});
draw();
</script>`;
  writeFileSync(join(dir, "review.html"), html);
  console.log(`${files.length} pictures -> ${join(dir, "review.html")}`);
}

function stats(marksFile: string, timings?: string) {
  const { marks, items } = JSON.parse(readFileSync(marksFile, "utf8")) as { marks: Record<string, number>; items: { f: string; layout: string }[] };
  const by = new Map<string, Record<string, number>>();
  for (const it of items) {
    const m = marks[it.f];
    if (!m) continue;
    const row = by.get(it.layout) ?? { n: 0, good: 0, pose: 0, anatomy: 0, mixed: 0, other: 0 };
    row.n!++;
    row[REASONS[m as keyof typeof REASONS]]!++;
    by.set(it.layout, row);
  }
  const pct = (a: number, n: number) => `${Math.round((100 * a) / Math.max(n, 1))}%`.padStart(5);
  console.log("layout".padEnd(26) + "    n   good  pose  body  mixed other   -> needs");
  let all = { n: 0, good: 0 };
  for (const [layout, r] of [...by.entries()].sort()) {
    all = { n: all.n + r.n!, good: all.good + r.good! };
    const needs = [r.mixed! / r.n! > 0.1 && "masks per figure", r.pose! / r.n! > 0.15 && "2nd ControlNet (openpose)", r.anatomy! / r.n! > 0.15 && "detailer (hands/body)"].filter(Boolean).join(", ") || "one pass is enough";
    console.log(`${layout.padEnd(26)}${String(r.n).padStart(5)}  ${pct(r.good!, r.n!)} ${pct(r.pose!, r.n!)} ${pct(r.anatomy!, r.n!)} ${pct(r.mixed!, r.n!)} ${pct(r.other!, r.n!)}   ${needs}`);
  }
  console.log(`all: ${all.n} rated, ${pct(all.good, all.n).trim()} good`);
  if (timings && existsSync(timings)) {
    const secs = readFileSync(timings, "utf8").trim().split("\n").slice(1).map((l) => Number(l.split(",")[3])).filter((x) => x > 0);
    const avg = secs.reduce((a, b) => a + b, 0) / Math.max(secs.length, 1);
    console.log(`time in ComfyUI: ${avg.toFixed(2)} s per picture over ${secs.length} (one prompt at a time per GPU)`);
  }
}

const [cmd, a, b] = process.argv.slice(2);
if (cmd === "sheet" && a) sheet(a);
else if (cmd === "stats" && a) stats(a, b);
else console.log("review.ts sheet <dir> | stats <marks.json> [timings.csv]");
