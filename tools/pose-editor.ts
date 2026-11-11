// Builds one HTML page where the point poses of every scene can be dragged into shape and exported.
// pnpm exec tsx tools/pose-editor.ts [out=pose-editor.html]
// The page keeps work in the browser and exports poses.json; tools/pose-render.ts turns that into skeleton images.
import { writeFileSync } from "node:fs";
import { content } from "../packages/base/src/content";
import { toOpenPose } from "../packages/schematics/src";

const out = process.argv[2] ?? "pose-editor.html";
const W = 1216;
const H = 832;
const scenes = content.scenes.map((s) => ({ id: s.id, figures: toOpenPose(s.figures, W, H).map((f) => ({ role: f.role, k: f.keypoints })) }));
const names = Object.fromEntries(content.scenes.map((s) => [s.id, content.locales.ru?.[`scene.${s.id}`] ?? s.id]));

const html = `<!doctype html>
<html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Позы сцен</title>
<style>
:root{--bg:#14161a;--panel:#1d2026;--line:#2c313a;--text:#e6e8ec;--dim:#9aa1ad;--acc:#f59e0b}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:14px/1.4 system-ui,sans-serif;display:grid;grid-template-columns:250px 1fr;height:100vh}
#list{overflow:auto;border-right:1px solid var(--line);background:var(--panel)}
#list input{width:calc(100% - 16px);margin:8px;padding:6px 8px;background:var(--bg);border:1px solid var(--line);color:var(--text);border-radius:6px}
.item{padding:6px 10px;cursor:pointer;border-bottom:1px solid var(--line);display:flex;justify-content:space-between;gap:6px}
.item small{color:var(--dim)}.item.on{background:#2a2f38}.item.done b{color:var(--acc)}
#main{display:flex;flex-direction:column;min-width:0;height:100vh}#list{height:100vh}
#bar{display:flex;flex-wrap:wrap;gap:6px;align-items:center;padding:8px 10px;border-bottom:1px solid var(--line);background:var(--panel)}
button,select{background:#2a2f38;color:var(--text);border:1px solid var(--line);border-radius:6px;padding:5px 9px;cursor:pointer;font:inherit}
button:hover{border-color:var(--acc)}button.on{background:var(--acc);color:#111;border-color:var(--acc)}
.sep{width:1px;height:22px;background:var(--line);margin:0 4px}
#stage{flex:1;min-height:0;overflow:hidden;display:flex;align-items:center;justify-content:center;padding:10px}
svg{background:#000;border:1px solid var(--line);touch-action:none}
#help{padding:6px 10px;color:var(--dim);border-top:1px solid var(--line);font-size:12px}
.role{display:inline-flex;align-items:center;gap:4px;margin-right:8px}.role i{width:10px;height:10px;border-radius:50%;display:inline-block}
</style></head><body>
<div id="list"><input id="q" placeholder="поиск сцены"><div id="items"></div></div>
<div id="main">
 <div id="bar">
  <b id="title"></b><span class="sep"></span>
  <span id="variants"></span><button id="addVar" title="Ещё один вариант позы для этой сцены (до 4)">+ вариант</button><button id="delVar">- вариант</button>
  <span class="sep"></span>
  <select id="size"><option value="1216x832">1216x832</option><option value="832x1216">832x1216</option><option value="1024x1024">1024x1024</option></select>
  <button id="flip" title="Отразить выбранную фигуру">отразить</button>
  <button id="bigger" title="Увеличить выбранную фигуру">+ рост</button><button id="smaller">- рост</button>
  <button id="reset" title="Вернуть вариант к исходной позе">сброс</button>
  <span class="sep"></span>
  <button id="look" title="Как это увидит ControlNet">вид: правка</button>
  <button id="png">PNG</button><button id="exp">Экспорт poses.json</button><button id="imp">Импорт</button><input id="file" type="file" accept=".json" hidden>
 </div>
 <div id="stage"><svg id="svg"></svg></div>
 <div id="help"><span id="roles"></span> Тяни точку - двигается сустав. Shift + тяни - вся фигура. Клик по фигуре выбирает её для "отразить" и "рост". Правки хранятся в этом браузере, для переноса - экспорт.</div>
</div>
<script>
const BASE=${JSON.stringify(scenes)};
const NAMES=${JSON.stringify(names)};
const BW=${W},BH=${H};
const LIMBS=[[1,2,"#ff0000"],[1,5,"#ff5500"],[2,3,"#ffaa00"],[3,4,"#ffff00"],[5,6,"#aaff00"],[6,7,"#55ff00"],[1,8,"#00ff00"],[8,9,"#00ff55"],[9,10,"#00ffaa"],[1,11,"#00ffff"],[11,12,"#00aaff"],[12,13,"#0055ff"],[1,0,"#0000ff"]];
const ROLE={wife:"#f472b6",patron:"#60a5fa",husband:"#4ade80"};
const ROLE_RU={wife:"жена",patron:"гость",husband:"муж"};
const KEY="test-city-poses-v1";
let store={};try{store=JSON.parse(localStorage.getItem(KEY)||"{}")}catch(e){}
const save=()=>{try{localStorage.setItem(KEY,JSON.stringify(store))}catch(e){}};
let cur=BASE[0].id,vi=0,sel=0,raw=false;
const clone=(x)=>JSON.parse(JSON.stringify(x));
const baseOf=(id)=>({w:BW,h:BH,figures:clone(BASE.find(s=>s.id===id).figures)});
const variants=(id)=>store[id]||(store[id]=[baseOf(id)]);
const pose=()=>variants(cur)[vi];
const $=(id)=>document.getElementById(id);
function list(){const q=$("q").value.toLowerCase();$("items").innerHTML="";for(const s of BASE){const name=NAMES[s.id]||s.id;if(q&&!(s.id+name).toLowerCase().includes(q))continue;const d=document.createElement("div");const n=store[s.id]?store[s.id].length:0;d.className="item"+(s.id===cur?" on":"")+(n?" done":"");d.innerHTML="<span><b>"+name+"</b><br><small>"+s.id+"</small></span><small>"+(n?n+" вар.":"")+"</small>";d.onclick=()=>{cur=s.id;vi=0;sel=0;draw();list()};$("items").appendChild(d)}}
function draw(){const p=pose(),svg=$("svg");svg.setAttribute("viewBox","0 0 "+p.w+" "+p.h);const st=$("stage").getBoundingClientRect(),fit=Math.min((st.width-22)/p.w,(st.height-22)/p.h);svg.style.width=Math.round(p.w*fit)+"px";svg.style.height=Math.round(p.h*fit)+"px";$("size").value=p.w+"x"+p.h;
 $("title").textContent=NAMES[cur]||cur;$("variants").innerHTML="";variants(cur).forEach((_,i)=>{const b=document.createElement("button");b.textContent=i+1;b.className=i===vi?"on":"";b.onclick=()=>{vi=i;sel=0;draw()};$("variants").appendChild(b)});
 $("roles").innerHTML=p.figures.map((f,i)=>'<span class="role"><i style="background:'+(ROLE[f.role]||"#ccc")+'"></i>'+(ROLE_RU[f.role]||f.role)+(i===sel?" (выбрана)":"")+"</span>").join("");
 const sw=Math.max(4,Math.round(Math.max(p.w,p.h)/150));let h="";
 p.figures.forEach((f,fi)=>{const k=f.k;
  if(!raw){const pts=k.filter(Boolean);const x0=Math.min(...pts.map(q=>q[0]))-30,y0=Math.min(...pts.map(q=>q[1]))-40,x1=Math.max(...pts.map(q=>q[0]))+30,y1=Math.max(...pts.map(q=>q[1]))+30;h+='<rect x="'+x0+'" y="'+y0+'" width="'+(x1-x0)+'" height="'+(y1-y0)+'" rx="18" fill="'+(ROLE[f.role]||"#ccc")+'" opacity="'+(fi===sel?0.16:0.07)+'" data-f="'+fi+'"/><text x="'+(x0+8)+'" y="'+(y0+18)+'" fill="'+(ROLE[f.role]||"#ccc")+'" font-size="15">'+(ROLE_RU[f.role]||f.role)+"</text>";
   if(k[0]&&k[1]){const r=Math.hypot(k[0][0]-k[1][0],k[0][1]-k[1][1])*0.75;h+='<circle cx="'+k[0][0]+'" cy="'+k[0][1]+'" r="'+r+'" fill="none" stroke="'+(ROLE[f.role]||"#ccc")+'" stroke-width="2" opacity="0.6"/>'}}
  for(const [a,b,c] of LIMBS)if(k[a]&&k[b])h+='<line x1="'+k[a][0]+'" y1="'+k[a][1]+'" x2="'+k[b][0]+'" y2="'+k[b][1]+'" stroke="'+c+'" stroke-width="'+sw+'" stroke-linecap="round" opacity="0.75"/>';
  k.forEach((q,i)=>{if(q)h+='<circle cx="'+q[0]+'" cy="'+q[1]+'" r="'+(raw?sw*0.7:sw*1.5)+'" fill="'+LIMBS[Math.min(i,LIMBS.length-1)][2]+'" '+(raw?"":'stroke="#fff" stroke-width="1.5" style="cursor:grab" ')+'data-f="'+fi+'" data-k="'+i+'"/>'})});
 svg.innerHTML=h;$("look").textContent=raw?"вид: как в ControlNet":"вид: правка"}
let drag=null;
const pt=(e)=>{const svg=$("svg"),r=svg.getBoundingClientRect(),p=pose();return[(e.clientX-r.left)/r.width*p.w,(e.clientY-r.top)/r.height*p.h]};
$("svg").addEventListener("pointerdown",(e)=>{const t=e.target;if(t.dataset.f===undefined)return;sel=+t.dataset.f;if(t.dataset.k!==undefined||e.shiftKey){drag={f:sel,k:t.dataset.k===undefined?-1:+t.dataset.k,all:e.shiftKey,last:pt(e)};$("svg").setPointerCapture(e.pointerId)}draw()});
$("svg").addEventListener("pointermove",(e)=>{if(!drag)return;const q=pt(e),dx=q[0]-drag.last[0],dy=q[1]-drag.last[1];drag.last=q;const k=pose().figures[drag.f].k;if(drag.all||drag.k<0)k.forEach(p=>{if(p){p[0]+=dx;p[1]+=dy}});else{k[drag.k][0]+=dx;k[drag.k][1]+=dy}draw()});
const drop=()=>{if(drag){pose().figures.forEach(f=>f.k.forEach(p=>{if(p){p[0]=Math.round(p[0]);p[1]=Math.round(p[1])}}));drag=null;save();list()}};
$("svg").addEventListener("pointerup",drop);$("svg").addEventListener("pointercancel",drop);
const centre=(k)=>{const pts=k.filter(Boolean);return[pts.reduce((s,p)=>s+p[0],0)/pts.length,Math.max(...pts.map(p=>p[1]))]};
const scale=(m)=>{const k=pose().figures[sel].k,[cx,cy]=centre(k);k.forEach(p=>{if(p){p[0]=Math.round(cx+(p[0]-cx)*m);p[1]=Math.round(cy+(p[1]-cy)*m)}});save();draw()};
$("bigger").onclick=()=>scale(1.06);$("smaller").onclick=()=>scale(1/1.06);
$("flip").onclick=()=>{const k=pose().figures[sel].k,[cx]=centre(k);k.forEach(p=>{if(p)p[0]=Math.round(2*cx-p[0])});save();draw()};
$("reset").onclick=()=>{variants(cur)[vi]=baseOf(cur);save();draw()};
$("addVar").onclick=()=>{const v=variants(cur);if(v.length>=4)return;v.push(clone(pose()));vi=v.length-1;save();draw();list()};
$("delVar").onclick=()=>{const v=variants(cur);if(v.length<=1){delete store[cur];vi=0}else{v.splice(vi,1);vi=Math.max(0,vi-1)}save();draw();list()};
$("size").onchange=()=>{const [w,h]=$("size").value.split("x").map(Number),p=pose(),s=Math.min(w/p.w,h/p.h),ox=(w-p.w*s)/2,oy=(h-p.h*s)/2;p.figures.forEach(f=>f.k.forEach(q=>{if(q){q[0]=Math.round(q[0]*s+ox);q[1]=Math.round(q[1]*s+oy)}}));p.w=w;p.h=h;save();draw()};
$("look").onclick=()=>{raw=!raw;draw()};
$("q").oninput=list;
const down=(name,url)=>{const a=document.createElement("a");a.href=url;a.download=name;a.click()};
$("png").onclick=()=>{const was=raw;raw=true;draw();const p=pose(),node=$("svg").cloneNode(true);node.removeAttribute("style");node.setAttribute("width",p.w);node.setAttribute("height",p.h);const xml=new XMLSerializer().serializeToString(node);raw=was;draw();const img=new Image();img.onload=()=>{const c=document.createElement("canvas");c.width=p.w;c.height=p.h;const g=c.getContext("2d");g.fillStyle="#000";g.fillRect(0,0,p.w,p.h);g.drawImage(img,0,0,p.w,p.h);down(cur+(vi?"~"+(vi+1):"")+".pose.png",c.toDataURL("image/png"))};img.src="data:image/svg+xml;charset=utf-8,"+encodeURIComponent(xml.includes("xmlns=")?xml:xml.replace("<svg",'<svg xmlns="http://www.w3.org/2000/svg"'))};
$("exp").onclick=()=>{const all={};for(const s of BASE)all[s.id]=store[s.id]||[baseOf(s.id)];down("poses.json",URL.createObjectURL(new Blob([JSON.stringify({version:1,scenes:all},null,1)],{type:"application/json"})))};
$("imp").onclick=()=>$("file").click();
$("file").onchange=()=>{const f=$("file").files[0];if(!f)return;f.text().then(t=>{try{const d=JSON.parse(t);store=d.scenes||d;save();vi=0;draw();list()}catch(e){$("help").textContent="Не получилось прочитать файл: "+e.message}})};
list();draw();addEventListener("resize",draw);
</script></body></html>`;
writeFileSync(out, html);
console.log(`${scenes.length} scenes -> ${out}`);
