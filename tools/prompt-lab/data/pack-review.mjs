// night 22.11: review of the night pack. A small page on http://127.0.0.1:8197 - the frames of tools/prompt-lab/data/pack/out by scene
// (layout), keep / drop / top marks kept in data/pack/marks.json. Reads the folders live, so frames drawn later show up on reload.
//   node tools/prompt-lab/data/pack-review.mjs [port=8197]
import { createServer } from "node:http";
import { readFileSync, writeFileSync, readdirSync, existsSync, createReadStream } from "node:fs";
import { join, resolve } from "node:path";
const root = resolve("tools/prompt-lab/data/pack");
const out = join(root, "out"), marksFile = join(root, "marks.json");
const marks = existsSync(marksFile) ? JSON.parse(readFileSync(marksFile, "utf8")) : {};
const list = () => {
  const items = [];
  for (const g of existsSync(out) ? readdirSync(out) : []) for (const f of readdirSync(join(out, g)).filter((x) => x.endsWith(".png")))
    items.push({ f: `${g}/${f}`, layout: f.split("__")[0], group: g, mark: marks[`${g}/${f}`] ?? "" });
  return items;
};
const PAGE = `<!doctype html><meta charset="utf-8"><title>Пак - ревью</title><style>
:root{color-scheme:dark}body{margin:0;background:#16161a;color:#ddd;font:14px system-ui}
header{position:sticky;top:0;background:#16161aee;padding:8px 14px;display:flex;gap:12px;align-items:center;flex-wrap:wrap;z-index:2}
select,button{background:#26262c;color:#ddd;border:1px solid #444;border-radius:6px;padding:5px 9px;font:inherit}
main{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:8px;padding:8px 14px}
figure{margin:0;position:relative;border:3px solid transparent;border-radius:6px;overflow:hidden;cursor:pointer}
figure.cur{border-color:#fff}figure.keep{border-color:#3c9}figure.top{border-color:#fc3}figure.drop{opacity:.25}
img{width:100%;display:block}figcaption{position:absolute;left:0;bottom:0;right:0;background:#000a;padding:2px 6px;font-size:11px;white-space:nowrap;overflow:hidden}
</style><header><b>Пак</b><select id=lay></select><select id=flt><option value="">все</option><option value=new>не размечено</option><option value=keep>оставлено</option><option value=top>топ</option><option value=drop>отклонено</option></select>
<span id=stat></span><span style="opacity:.6">K оставить · D отклонить · T топ · пробел снять · стрелки</span></header><main id=m></main><script>
let all=[],view=[],cur=0;const $=id=>document.getElementById(id);
async function load(){all=await (await fetch('/api/list')).json();const by={};for(const i of all)(by[i.layout]||=[]).push(i);
const keep=$('lay').value;$('lay').innerHTML='<option value="">ВСЕ СЦЕНЫ ('+all.length+')</option>'+Object.keys(by).sort().map(l=>'<option value="'+l+'">'+l+' ('+by[l].filter(i=>!i.mark).length+'/'+by[l].length+')</option>').join('');$('lay').value=keep;draw()}
function draw(){const l=$('lay').value,f=$('flt').value;view=all.filter(i=>(!l||i.layout===l)&&(!f||(f==='new'?!i.mark:i.mark===f))).slice(0,600);
$('m').innerHTML=view.map((i,n)=>'<figure data-n="'+n+'" class="'+i.mark+'"><img loading=lazy src="/img?f='+encodeURIComponent(i.f)+'"><figcaption>'+i.f.split('/')[1].replace(/__/g,' ')+'</figcaption></figure>').join('');
cur=Math.min(cur,Math.max(0,view.length-1));sel();const k=all.filter(i=>i.mark==='keep'||i.mark==='top').length,d=all.filter(i=>i.mark==='drop').length;$('stat').textContent='оставлено '+k+' · отклонено '+d+' · осталось '+(all.length-k-d)}
function sel(){document.querySelectorAll('figure.cur').forEach(e=>e.classList.remove('cur'));const e=$('m').children[cur];if(e){e.classList.add('cur');e.scrollIntoView({block:'nearest'})}}
async function mark(v){const i=view[cur];if(!i)return;i.mark=v;const e=$('m').children[cur];e.className=v+' cur';await fetch('/api/mark',{method:'POST',body:JSON.stringify({file:i.f,mark:v})});if(v)cur=Math.min(cur+1,view.length-1),sel()}
$('m').onclick=e=>{const g=e.target.closest('figure');if(g){cur=+g.dataset.n;sel()}};$('lay').onchange=()=>{cur=0;draw()};$('flt').onchange=()=>{cur=0;draw()};
onkeydown=e=>{const cols=Math.max(1,Math.floor($('m').clientWidth/238));const k=e.key.toLowerCase();
if(k==='arrowright')cur=Math.min(cur+1,view.length-1);else if(k==='arrowleft')cur=Math.max(cur-1,0);else if(k==='arrowdown')cur=Math.min(cur+cols,view.length-1);else if(k==='arrowup')cur=Math.max(cur-cols,0);
else if(k==='k'||k==='л')return mark('keep');else if(k==='d'||k==='в')return mark('drop');else if(k==='t'||k==='е')return mark('top');else if(k===' ')return e.preventDefault(),mark('');else return;e.preventDefault();sel()};
load();</script>`;
createServer((req, res) => {
  const u = new URL(req.url, "http://x");
  if (u.pathname === "/") return res.writeHead(200, { "content-type": "text/html; charset=utf-8" }).end(PAGE);
  if (u.pathname === "/api/list") return res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(list()));
  if (u.pathname === "/img") {
    const p = resolve(out, u.searchParams.get("f") ?? "");
    if (!p.startsWith(out) || !existsSync(p)) return res.writeHead(404).end();
    res.writeHead(200, { "content-type": "image/png", "cache-control": "max-age=3600" });
    return createReadStream(p).pipe(res);
  }
  if (u.pathname === "/api/mark" && req.method === "POST") {
    let b = "";
    req.on("data", (c) => (b += c));
    req.on("end", () => { const { file, mark } = JSON.parse(b); if (mark) marks[file] = mark; else delete marks[file]; writeFileSync(marksFile, JSON.stringify(marks)); res.writeHead(200).end("{}"); });
    return;
  }
  res.writeHead(404).end();
}).listen(Number(process.argv[2] ?? 8197), "127.0.0.1", () => console.log("pack review: http://127.0.0.1:" + (process.argv[2] ?? 8197)));
