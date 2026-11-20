// The morning page of a night run: every key, its variants side by side (same seeds), Claude's pick and why,
// and the proposed layout for the decisions table. Served by the night lab at /report (http://127.0.0.1:8196/report).
//   node tools/prompt-lab/night-report.mjs [--data tools/prompt-lab/night]
// Picks: <data>/picks.json  { "<key>": { "best": "<variant label>", "why": "...", "layout": "..." } }  (optional)
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const argv = process.argv.slice(2);
const DATA = argv.includes("--data") ? argv[argv.indexOf("--data") + 1] : join("tools", "prompt-lab", "night");
const picks = existsSync(join(DATA, "picks.json")) ? JSON.parse(readFileSync(join(DATA, "picks.json"), "utf8")) : {};
const extra = existsSync(join(DATA, "items.json")) ? JSON.parse(readFileSync(join(DATA, "items.json"), "utf8")).items : [];
const about = Object.fromEntries(extra.map((x) => [x.id, x.about ?? ""]));
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const groupOf = (id) => (id.startsWith("portrait_") ? "Портреты" : id.startsWith("insert_") ? "Вставки акта (нейтрально)" : id.startsWith("detail_") ? "Слабые вставки" : "Слабые сцены");
const order = ["Слабые сцены", "Слабые вставки", "Портреты", "Вставки акта (нейтрально)"];
const keys = readdirSync(DATA, { withFileTypes: true }).filter((d) => d.isDirectory() && existsSync(join(DATA, d.name, "state.json"))).map((d) => d.name);
const byGroup = Object.fromEntries(order.map((g) => [g, []]));
for (const k of keys.sort()) byGroup[groupOf(k)].push(k);

let drawn = 0, total = 0;
const section = (g) => byGroup[g].map((k) => {
  const st = JSON.parse(readFileSync(join(DATA, k, "state.json"), "utf8"));
  const p = picks[k] ?? {};
  const rows = st.takes.map((t) => {
    total += t.files.length;
    drawn += t.files.filter(Boolean).length;
    const best = p.best && t.label === p.best;
    const imgs = t.files.map((f) => (f ? `<a href="/img?id=${k}&f=${f}" target="_blank"><img loading="lazy" src="/img?id=${k}&f=${f}"></a>` : `<span class="miss">нет</span>`)).join("");
    return `<div class="row${best ? " best" : ""}" data-label="${esc(t.label ?? "")}"><div class="lab">${esc(t.label ?? "")}${best ? " ★" : ""}<br><button class="mine" onclick="pick('${k}', this)">мой выбор</button><details><summary>промпт</summary><code>${esc(t.positive)}</code><code class="neg">${esc(t.negativeFull)}</code></details></div><div class="imgs">${imgs}</div></div>`;
  }).join("");
  const verdict = p.best || p.why || p.layout ? `<div class="pick"><b>Лучший:</b> ${esc(p.best ?? "-")}${p.why ? ` - ${esc(p.why)}` : ""}${p.layout ? `<br><b>Раскладка (в таблицу):</b> ${esc(p.layout)}` : ""}</div>` : "";
  return `<section id="${k}" data-key="${k}"><h3>${esc(k)} <small>${esc(about[k] ?? "")}</small></h3>${verdict}<div class="you">Ты: <span class="yourpick">согласен с ★</span> <textarea placeholder="комментарий (сохраняется сам)" onchange="note('${k}', this.value)"></textarea></div>${rows}</section>`;
}).join("");

const body = order.map((g) => (byGroup[g].length ? `<h2 id="g-${order.indexOf(g)}">${g} (${byGroup[g].length})</h2>${section(g)}` : "")).join("");
const nav = order.map((g, i) => `<a href="#g-${i}">${g}</a>`).join(" · ");
const table = Object.entries(picks).filter(([, p]) => p.layout).map(([k, p]) => `<tr><td>${esc(k)}</td><td>${esc(p.best ?? "")}</td><td>${esc(p.layout)}</td></tr>`).join("");
writeFileSync(join(DATA, "report.html"), `<!doctype html><meta charset="utf-8"><title>Ночной прогон</title>
<style>body{font:14px system-ui;margin:16px;background:#1b1b1d;color:#ddd}a{color:#9cf}h2{border-bottom:1px solid #444;margin-top:32px}
section{margin:18px 0;padding:8px;background:#242428;border-radius:6px}h3{margin:4px 0}small{color:#999;font-weight:normal}
.row{display:flex;gap:8px;align-items:flex-start;margin:6px 0;padding:4px;border-radius:4px}.row.best{background:#2f3d2a}
.lab{width:190px;flex:none}.imgs{display:flex;gap:4px}.imgs img{height:220px;border-radius:3px}.miss{color:#c66;width:150px}
details code{display:block;font-size:11px;white-space:pre-wrap;color:#aaa;margin-top:4px}code.neg{color:#c99}.pick{background:#30302a;padding:6px;border-radius:4px;margin:4px 0}
.you{margin:4px 0}.you textarea{width:60%;height:34px;vertical-align:middle;background:#1b1b1d;color:#ddd;border:1px solid #555}
.row.yours{outline:2px solid #6af}button.mine{margin-top:6px;background:#333;color:#ddd;border:1px solid #666;border-radius:4px;cursor:pointer}.row.yours button.mine{background:#36c;color:#fff}
#saved{position:fixed;right:12px;bottom:12px;background:#36c;color:#fff;padding:4px 10px;border-radius:4px;display:none}
table{border-collapse:collapse}td{border:1px solid #444;padding:3px 6px}</style>
<h1>Ночной прогон ${new Date().toLocaleDateString("ru-RU")}</h1>
<p>${drawn} из ${total} кадров. Варианты одного ключа на одних сидах. ★ - выбор Claude. Не согласен - жми \"мой выбор\" у своего варианта (повторный клик снимает) и пиши комментарий; всё сохраняется само в night/review.json. В игру ничего не сохранено. ${nav} · <a href="#table">таблица раскладки</a></p>
${body}<div id="saved">сохранено</div>
<script>
const show = (all) => document.querySelectorAll("section[data-key]").forEach((sec) => {
  const r = all[sec.dataset.key] ?? {};
  sec.querySelectorAll(".row").forEach((row) => row.classList.toggle("yours", row.dataset.label === r.best));
  sec.querySelector(".yourpick").textContent = r.best ? "выбрал " + r.best : "согласен с ★";
  const ta = sec.querySelector("textarea"); if (document.activeElement !== ta) ta.value = r.comment ?? "";
});
const flash = () => { const s = document.getElementById("saved"); s.style.display = "block"; setTimeout(() => (s.style.display = "none"), 900); };
const send = async (b) => { const r = await fetch("/api/review", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b) }); show(await r.json()); flash(); };
function pick(key, btn) { const row = btn.closest(".row"); send({ key, best: row.classList.contains("yours") ? null : row.dataset.label }); }
function note(key, text) { send({ key, comment: text }); }
fetch("/api/review").then((r) => r.json()).then(show).catch(() => {});
</script>
<h2 id="table">Предложение в колонку таблицы решений</h2><table><tr><th>ключ</th><th>лучший</th><th>раскладка</th></tr>${table}</table>`);
console.log(`report: ${join(DATA, "report.html")} (${drawn}/${total} pictures)`);
