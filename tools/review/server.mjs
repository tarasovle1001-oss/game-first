// Picture review (23.11): a page on http://127.0.0.1:8198 with two modes over one pack folder.
//   Gallery - pick a scene / room / outfit / face / status, grid, zoom, hot keys.
//   One by one - a single frame with what the scene is meant to show; drop (with a note), keep, keep with a note,
//   unsure (with a note). The order is stratified by scene, so small scenes are not starved by big ones.
// Verdicts go to <data>/reviews.jsonl (every click, append only) and <data>/reviews.json (last verdict per file, with
// the key and the context), so the core chat can read them. Nothing in the pack is moved or deleted.
//   node server.mjs --pack C:\Users\stk01\Documents\pack4 [--data <pack>-review] [--context context.json] [--port 8198]
// No dependencies: plain node.
import { createServer } from "node:http";
import { readFileSync, writeFileSync, appendFileSync, readdirSync, existsSync, mkdirSync, createReadStream, statSync } from "node:fs";
import { join, resolve, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";

const arg = (name, dflt) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : dflt;
};
const here = dirname(fileURLToPath(import.meta.url));
const pack = resolve(arg("pack", "C:/Users/stk01/Documents/pack4"));
const data = resolve(arg("data", `${pack}-review`));
const ctxFile = resolve(arg("context", existsSync(join(data, "context.json")) ? join(data, "context.json") : join(here, "context.json")));
const port = Number(arg("port", 8198));
mkdirSync(data, { recursive: true });
const logFile = join(data, "reviews.jsonl");
const stateFile = join(data, "reviews.json");

const context = existsSync(ctxFile) ? JSON.parse(readFileSync(ctxFile, "utf8")) : {};
const keyOf = (f) => f.replace(/~\d+\.png$|\.png$/, "").split("__").join("/");
// the last verdict per file, rebuilt from the log (the log is the truth: a crash never loses more than one click)
const state = {};
if (existsSync(logFile))
  for (const line of readFileSync(logFile, "utf8").split("\n")) {
    if (!line.trim()) continue;
    try {
      const r = JSON.parse(line);
      if (r.verdict === "clear") delete state[r.file];
      else state[r.file] = r;
    } catch {}
  }
const saveState = () => {
  const out = {};
  for (const [f, r] of Object.entries(state)) out[f] = { ...r, context: context[r.key] ? { title: context[r.key].title, who: context[r.key].who, where: context[r.key].where, look: context[r.key].look } : undefined };
  writeFileSync(stateFile, JSON.stringify(out, null, 1));
};

const list = () => {
  const items = [];
  for (const f of readdirSync(pack)) {
    if (!f.endsWith(".png")) continue;
    const key = keyOf(f);
    const [type, roles, room, tags = ""] = key.split("/");
    items.push({ f, key, type, roles, room, tags, v: state[f]?.verdict ?? "", note: state[f]?.note ?? "" });
  }
  return items;
};

const send = (res, code, body, type = "application/json; charset=utf-8") => {
  res.writeHead(code, { "content-type": type, "cache-control": "no-store" });
  res.end(body);
};
createServer((req, res) => {
  const url = new URL(req.url, "http://x");
  if (url.pathname === "/") return send(res, 200, PAGE, "text/html; charset=utf-8");
  if (url.pathname === "/api/items") return send(res, 200, JSON.stringify(list()));
  if (url.pathname === "/api/context") return send(res, 200, JSON.stringify(context));
  if (url.pathname === "/img") {
    const f = basename(url.searchParams.get("f") ?? "");
    const p = join(pack, f);
    if (!f.endsWith(".png") || !existsSync(p)) return send(res, 404, "no");
    res.writeHead(200, { "content-type": "image/png", "content-length": statSync(p).size, "cache-control": "max-age=3600" });
    return createReadStream(p).pipe(res);
  }
  if (url.pathname === "/api/review" && req.method === "POST") {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      try {
        const { file, verdict, note = "", mode = "" } = JSON.parse(body);
        if (!file || !["keep", "keep_note", "drop", "unsure", "clear"].includes(verdict)) return send(res, 400, '{"error":"bad"}');
        const r = { ts: new Date().toISOString(), file, key: keyOf(file), verdict, note: String(note).slice(0, 2000), mode };
        appendFileSync(logFile, JSON.stringify(r) + "\n");
        if (verdict === "clear") delete state[file];
        else state[file] = r;
        saveState();
        send(res, 200, '{"ok":true}');
      } catch (e) {
        send(res, 400, JSON.stringify({ error: String(e) }));
      }
    });
    return;
  }
  send(res, 404, "no");
}).listen(port, "127.0.0.1", () => console.log(`review: http://127.0.0.1:${port}  pack ${pack}  data ${data}  context ${Object.keys(context).length} keys`));

const PAGE = String.raw`<!doctype html><meta charset="utf-8"><title>Ревью картинок</title><style>
:root{color-scheme:dark}*{box-sizing:border-box}body{margin:0;background:#141417;color:#ddd;font:14px system-ui}
header{position:sticky;top:0;z-index:20;background:#141417f2;padding:8px 12px;display:flex;gap:8px;align-items:center;flex-wrap:wrap;border-bottom:1px solid #2a2a30}
select,button,input,textarea{background:#24242a;color:#ddd;border:1px solid #444;border-radius:6px;padding:5px 8px;font:inherit}
button{cursor:pointer}button.on{background:#3a3a46;border-color:#888}.muted{opacity:.6}.sp{flex:1}
#grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(var(--w,220px),1fr));gap:6px;padding:8px 12px}
figure{margin:0;position:relative;border:3px solid transparent;border-radius:6px;overflow:hidden;cursor:pointer;background:#000}
figure img{width:100%;display:block;aspect-ratio:var(--ar,2/3);object-fit:cover}figure.cur{outline:2px solid #fff;outline-offset:1px}
figure.keep,figure.keep_note{border-color:#3c9}figure.drop{border-color:#e44}figure.drop img{opacity:.35}figure.unsure{border-color:#fb3}
figcaption{position:absolute;left:0;right:0;bottom:0;background:#000b;padding:2px 6px;font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
figure .n{position:absolute;top:3px;right:4px;background:#000b;border-radius:4px;padding:0 4px;font-size:11px}
#box{position:fixed;left:0;right:0;bottom:0;top:var(--hh,48px);background:#000e;z-index:10;display:none}#box.on{display:flex}
#stage{flex:1;overflow:hidden;position:relative;cursor:zoom-in}#stage img{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);max-width:100%;max-height:100%;user-select:none}
#stage.z{cursor:grab}#stage.z img{max-width:none;max-height:none}
#side{width:430px;overflow:auto;padding:14px;background:#18181c;border-left:1px solid #2a2a30;display:flex;flex-direction:column;gap:8px}
#side h2{margin:0;font-size:18px}#side .k{font:11px ui-monospace,monospace;opacity:.7;word-break:break-all}
#side ul{margin:0;padding-left:18px}#side .line{font-style:italic;opacity:.85}#side details{font-size:12px;opacity:.85}
.prompt{font:12px ui-monospace,monospace;background:#101013;padding:6px;border-radius:6px;white-space:pre-wrap}
.acts{display:grid;grid-template-columns:1fr 1fr;gap:6px}.acts button{padding:10px 6px;font-weight:600}
.b1{border-color:#e44!important}.b2{border-color:#3c9!important}.b3{border-color:#3c9!important;border-style:dashed!important}.b4{border-color:#fb3!important}
textarea{width:100%;min-height:64px;resize:vertical}.verdict{padding:4px 8px;border-radius:6px;display:inline-block}
.v-keep,.v-keep_note{background:#1e3d31}.v-drop{background:#4a1d1d}.v-unsure{background:#4a3c14}
#help{font-size:12px;opacity:.6}
</style>
<header>
  <b>Ревью</b>
  <button id=mGal>Галерея</button><button id=mOne>По одной</button>
  <select id=fType></select><select id=fRoom></select><select id=fOutfit></select><select id=fFace></select>
  <select id=fState><option value="">все</option><option value=new>не разобрано</option><option value=keep>оставлено</option><option value=drop>выкинуто</option><option value=unsure>под вопросом</option><option value=noted>с комментом</option></select>
  <input id=fText placeholder="поиск по ключу" size=14>
  <label class=muted>размер <input id=fSize type=range min=120 max=480 value=220></label>
  <span class=sp></span><span id=stat class=muted></span>
</header>
<div id=grid></div>
<div id=box><div id=stage><img id=big></div><aside id=side></aside></div>
<script>
const $=id=>document.getElementById(id);
let items=[],ctx={},view=[],cur=0,mode=localStorage.rvMode||'one',one=null,history=[],zoom=false;
const V={keep:'оставлено',keep_note:'оставлено (коммент)',drop:'выкинуто',unsure:'под вопросом'};
const tag=(i,k)=>(i.tags.split(',').find(x=>x.startsWith(k+'='))||'').split('=')[1]||'';
const sceneWords=p=>(p||'').split(/,\s*sora \\\(soraoraora\\\)/)[0];
async function load(){items=await (await fetch('/api/items')).json();ctx=await (await fetch('/api/context')).json();fill();setMode(mode)}
function opts(sel,vals,label){const keep=sel.value;sel.innerHTML='<option value="">'+label+'</option>'+vals.map(([v,n])=>'<option value="'+v+'">'+v+' ('+n+')</option>').join('');sel.value=keep}
function count(f){const m={};for(const i of items){const v=f(i);if(v)m[v]=(m[v]||0)+1}return Object.entries(m).sort((a,b)=>a[0].localeCompare(b[0]))}
function fill(){
  const left={};for(const i of items)if(!i.v)left[i.type]=(left[i.type]||0)+1;
  const types=count(i=>i.type);$('fType').innerHTML='<option value="">все сцены ('+items.length+')</option>'+types.map(([t,n])=>'<option value="'+t+'">'+t+' ('+(left[t]||0)+'/'+n+')</option>').join('');
  opts($('fRoom'),count(i=>i.room),'все комнаты');opts($('fOutfit'),count(i=>tag(i,'outfit')),'любой наряд');opts($('fFace'),count(i=>tag(i,'face')),'любое лицо');
  const done=items.filter(i=>i.v).length;$('stat').textContent='разобрано '+done+' из '+items.length+' · выкинуто '+items.filter(i=>i.v==='drop').length+' · под вопросом '+items.filter(i=>i.v==='unsure').length;
}
function filtered(){const t=$('fType').value,r=$('fRoom').value,o=$('fOutfit').value,f=$('fFace').value,s=$('fState').value,q=$('fText').value.trim().toLowerCase();
  return items.filter(i=>(!t||i.type===t)&&(!r||i.room===r)&&(!o||tag(i,'outfit')===o)&&(!f||tag(i,'face')===f)&&(!q||i.key.toLowerCase().includes(q))&&
  (!s||(s==='new'?!i.v:s==='keep'?(i.v==='keep'||i.v==='keep_note'):s==='noted'?!!i.note:i.v===s)))}
function setMode(m){mode=m;localStorage.rvMode=m;$('mGal').classList.toggle('on',m==='gal');$('mOne').classList.toggle('on',m==='one');$('fSize').parentElement.style.display=m==='gal'?'':'none';
  if(m==='gal'){closeBox();drawGrid()}else{$('grid').innerHTML='';nextOne()}}
// ---------- gallery
function drawGrid(){view=filtered().slice(0,1500);cur=Math.min(cur,view.length-1);const per={};for(const i of items)per[i.key]=(per[i.key]||0)+1;
  document.documentElement.style.setProperty('--w',$('fSize').value+'px');
  $('grid').innerHTML=view.map((i,n)=>'<figure data-n="'+n+'" class="'+i.v+(n===cur?' cur':'')+'" title="'+(i.note||'').replace(/"/g,'&quot;')+'"><img loading=lazy src="/img?f='+encodeURIComponent(i.f)+'"><span class=n>'+(i.note?'✎ ':'')+per[i.key]+'</span><figcaption>'+i.f.replace(/__/g,' · ').replace('.png','')+'</figcaption></figure>').join('')}
$('grid').onclick=e=>{const f=e.target.closest('figure');if(!f)return;cur=+f.dataset.n;openBox(view[cur])};
// ---------- the big picture with its context (both modes)
function card(i){const c=ctx[i.key]||{};const same=items.filter(x=>x.key===i.key);const sw=sceneWords(c.prompt);
  return '<h2>'+(c.title||i.type)+'</h2>'+(c.act&&c.act!==c.title?'<div>действие: '+c.act+'</div>':'')+
  '<div>кто: '+(c.who||i.roles)+' · где: '+(c.where||i.room)+'</div>'+
  (c.look&&c.look.length?'<ul>'+c.look.map(x=>'<li>'+x+'</li>').join('')+'</ul>':'')+
  (c.lines&&c.lines.length?'<div class=line>'+c.lines.map(x=>'«'+x+'»').join('<br>')+'</div>':'')+
  (sw?'<div><b>что должно быть нарисовано:</b><div class=prompt>'+sw+'</div></div>':'')+
  (c.prompt?'<details><summary>весь промпт игры</summary><div class=prompt>'+c.prompt+'</div></details>':'')+
  '<div class=muted>показов в игре (боты, 30 дней): '+(c.views||0)+' · кадров этого ключа: '+same.length+' (разобрано '+same.filter(x=>x.v).length+')</div>'+
  (i.v?'<div>было: <span class="verdict v-'+i.v+'">'+V[i.v]+'</span>'+(i.note?' - '+i.note:'')+'</div>':'')+
  '<div class=k>'+i.f+'</div>'}
function actions(i){return '<textarea id=note placeholder="коммент (обязателен для «выкинуть» и «не уверен»)">'+(i.note||'')+'</textarea>'+
  '<div class=acts><button class=b1 data-v=drop>1 · выкинуть</button><button class=b2 data-v=keep>2 · оставить</button><button class=b3 data-v=keep_note>3 · оставить + коммент</button><button class=b4 data-v=unsure>4 · не уверен</button></div>'+
  '<div id=help>1-4 - решение (для 1, 3, 4 сначала коммент: клавиша откроет поле, Ctrl+Enter - сохранить) · Z / Backspace - назад · пробел - приблизить · '+(mode==='gal'?'← → - соседние · Esc - закрыть':'S - пропустить · Esc - выйти в галерею')+'</div>'}
function openBox(i){one=i;zoom=false;$('stage').classList.remove('z');$('big').src='/img?f='+encodeURIComponent(i.f);$('big').style.transform='';
  $('side').innerHTML=card(i)+actions(i);$('box').classList.add('on');
  $('side').querySelectorAll('.acts button').forEach(b=>b.onclick=()=>decide(b.dataset.v))}
function closeBox(){$('box').classList.remove('on');one=null}
async function decide(v){const i=one;if(!i)return;const note=$('note').value.trim();
  if((v==='drop'||v==='unsure'||v==='keep_note')&&!note){$('note').focus();$('note').dataset.want=v;$('note').placeholder='напиши коммент и Ctrl+Enter';return}
  await fetch('/api/review',{method:'POST',body:JSON.stringify({file:i.f,verdict:v,note,mode})});
  history.push({f:i.f,prev:i.v,prevNote:i.note});i.v=v;i.note=note;fill();
  if(mode==='gal'){drawGrid();if(cur<view.length-1){cur++;openBox(view[cur])}else closeBox()}else nextOne()}
async function undo(){const h=history.pop();if(!h)return;const i=items.find(x=>x.f===h.f);
  await fetch('/api/review',{method:'POST',body:JSON.stringify({file:h.f,verdict:h.prev||'clear',note:h.prevNote||'',mode:'undo'})});
  i.v=h.prev;i.note=h.prevNote;fill();if(mode==='gal'){drawGrid();cur=view.indexOf(i);if(cur<0)cur=0}openBox(i)}
// ---------- one by one: which frame comes next
// Stratified by scene: a scene of 4 frames and a scene of 400 must both come up early. Each scene gets turns in
// proportion to sqrt(its frames) (between "every scene equally" and "every frame equally"), a bit more for scenes
// players see often; a scene that has looked fine 10 times in a row gets turns three times less often, one that keeps
// failing - twice as often. Inside a scene: the key with the fewest frames looked at, then a random frame of it.
function nextOne(){const pool=filtered().filter(i=>!i.v);if(!pool.length){closeBox();$('grid').innerHTML='<p style="padding:20px">Всё разобрано в этом фильтре.</p>';return}
  const by={};for(const i of items){const s=(by[i.type]||={n:0,done:0,keep:0,views:0,left:[]});s.n++;if(i.v){s.done++;if(i.v==='keep'||i.v==='keep_note')s.keep++}}
  for(const k of new Set(items.map(i=>i.key))){const c=ctx[k];if(c&&by[k.split('/')[0]])by[k.split('/')[0]].views+=c.views||0}
  for(const i of pool)by[i.type].left.push(i);
  let best=null,bestP=Infinity;
  for(const [t,s] of Object.entries(by)){if(!s.left.length)continue;
    let w=Math.sqrt(s.n)*(1+Math.log10(1+s.views)/2);
    if(s.done>=10&&s.keep/s.done>=0.9)w/=3;else if(s.done>=6&&s.keep/s.done<0.6)w*=2;
    const p=(s.done+Math.random()*0.5)/w;if(p<bestP){bestP=p;best=s}}
  const perKey={};for(const i of items)if(i.type===best.left[0].type){const k=perKey[i.key]||={done:0,left:[]};if(i.v)k.done++;else k.left.push(i)}
  const keys=Object.values(perKey).filter(k=>k.left.length).sort((a,b)=>a.done-b.done||Math.random()-0.5);
  const pick=keys[0].left[Math.floor(Math.random()*keys[0].left.length)];openBox(pick)}
// ---------- zoom: space or click toggles, drag to look around
let drag=null,pos={x:0,y:0};
function setZoom(on,e){zoom=on;$('stage').classList.toggle('z',on);pos={x:0,y:0};$('big').style.transform=on?'translate(-50%,-50%) scale(1)':'';
  if(on){const img=$('big'),st=$('stage').getBoundingClientRect();const s=Math.min(2.2,Math.max(1.2,st.height*1.6/img.naturalHeight));img.style.width=img.naturalWidth*s+'px';img.style.height=img.naturalHeight*s+'px'}
  else{$('big').style.width='';$('big').style.height=''}}
$('stage').onmousedown=e=>{if(!zoom){setZoom(true);return}drag={x:e.clientX-pos.x,y:e.clientY-pos.y}};
window.onmouseup=()=>drag=null;window.onmousemove=e=>{if(!drag)return;pos={x:e.clientX-drag.x,y:e.clientY-drag.y};$('big').style.transform='translate(calc(-50% + '+pos.x+'px),calc(-50% + '+pos.y+'px))'};
$('stage').ondblclick=()=>setZoom(false);
// ---------- keys
document.onkeydown=e=>{const inNote=document.activeElement&&document.activeElement.id==='note';
  if(inNote){if(e.key==='Enter'&&(e.ctrlKey||e.metaKey)){e.preventDefault();decide($('note').dataset.want||'keep_note')}if(e.key==='Escape')$('note').blur();return}
  if(document.activeElement&&document.activeElement.tagName==='INPUT')return;
  if(one){const m={'1':'drop','2':'keep','3':'keep_note','4':'unsure'}[e.key];
    if(m){e.preventDefault();if(m==='keep')decide(m);else{$('note').dataset.want=m;$('note').focus()}return}
    if(e.key===' '){e.preventDefault();setZoom(!zoom);return}
    if(e.key==='z'||e.key==='Z'||e.key==='я'||e.key==='Backspace'){e.preventDefault();undo();return}
    if(mode==='one'&&(e.key==='s'||e.key==='ы')){nextOne();return}
    if(e.key==='Escape'){if(mode==='gal')closeBox();else setMode('gal');return}
    if(mode==='gal'&&e.key==='ArrowRight'&&cur<view.length-1){cur++;openBox(view[cur])}
    if(mode==='gal'&&e.key==='ArrowLeft'&&cur>0){cur--;openBox(view[cur])}
    return}
  if(mode==='gal'){if(e.key==='ArrowRight')cur=Math.min(view.length-1,cur+1);if(e.key==='ArrowLeft')cur=Math.max(0,cur-1);
    if(e.key==='Enter'&&view[cur])openBox(view[cur]);if(e.key.startsWith('Arrow'))drawGrid()}};
for(const id of ['fType','fRoom','fOutfit','fFace','fState'])$(id).onchange=()=>{cur=0;mode==='gal'?drawGrid():nextOne()};
$('fText').oninput=()=>{cur=0;if(mode==='gal')drawGrid()};$('fSize').oninput=()=>document.documentElement.style.setProperty('--w',$('fSize').value+'px');
$('mGal').onclick=()=>setMode('gal');$('mOne').onclick=()=>setMode('one');
const hh=()=>document.documentElement.style.setProperty('--hh',document.querySelector('header').offsetHeight+'px');window.onresize=hh;hh();
load();
</script>`;
