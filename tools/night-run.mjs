// A night run on one rented RTX 5090, alone from start to end: rent, LoRAs, tunnel, a second prompt lab (8196, own data,
// writes nothing into the game), the plan, then the box is destroyed when the queue is empty or the money runs out.
// Runs on Alexey's PC in its own window; the PC must not sleep (this keeps it awake while it runs; a closed lid may not).
//
//   node tools/night-run.mjs [--budget 5] [--plan tools/prompt-lab/night-plan.json] [--port 8196] [--inflight 4]
// Synthetic rounds for concept LoRAs instead of a plan (drawn into the usual lab data, so they are reviewed at /synth):
//   node tools/night-run.mjs --synth fd_behind,his_close [--mode wide|hits] [--scale 1] [--tag k1] --port 8195 --data tools/prompt-lab/data
//   (close the Start-PromptLab window first: two labs must not share one data folder)
//
// Progress: the window (one line a minute), tools/prompt-lab/night/status.json, and the lab itself: http://127.0.0.1:8196
// Run it again after a crash: it does not rent a second box (.vast-box.json) and does not post the plan twice.
import { spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync, mkdirSync, appendFileSync, statSync } from "node:fs";
import { join } from "node:path";

const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const BUDGET = Number(opt("budget", "5"));
// --hold: the box stays up after the queue is empty (Claude feeds it cycle after cycle). It goes down at the budget,
// after --hours, or when <data>/heartbeat has not been touched for --idle minutes (nobody is feeding it any more).
const HOLD = argv.includes("--hold");
const HOURS = Number(opt("hours", "9"));
const IDLE = Number(opt("idle", "45"));
const PLAN = opt("plan", join("tools", "prompt-lab", "night-plan.json"));
const PORT = Number(opt("port", "8196"));
const DATA = opt("data", join("tools", "prompt-lab", "night"));
const SYNTH = opt("synth", "").split(",").filter(Boolean);
const TAG = opt("tag", new Date().toISOString().slice(0, 10));
const LORAS = "C:\\ComfyUI\\models\\loras";
const LAB = `http://127.0.0.1:${PORT}`;
mkdirSync(DATA, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const box = () => (existsSync(".vast-box.json") ? JSON.parse(readFileSync(".vast-box.json", "utf8")) : {});
const spent = () => { const b = box(); return b.instance && b.rentedAt ? ((Date.now() - b.rentedAt) / 3600000) * (b.price ?? 0) : 0; };
const status = { started: new Date().toISOString(), budget: BUDGET, step: "start" };
const log = (step, msg) => {
  Object.assign(status, { step, message: msg, at: new Date().toISOString(), spent: Number(spent().toFixed(2)) });
  writeFileSync(join(DATA, "status.json"), JSON.stringify(status, null, 1));
  const line = `[${new Date().toLocaleTimeString()}] ${step}: ${msg}  ($${spent().toFixed(2)} / $${BUDGET})`;
  console.log(line);
  appendFileSync(join(DATA, "night-run.log"), line + "\n");
};
const node = (args, opts = {}) => spawnSync(process.execPath, args, { stdio: "inherit", ...opts });

// keep Windows awake while this runs (released when the process ends)
const awake = spawn("powershell", ["-NoProfile", "-Command", "$s='[DllImport(\"kernel32.dll\")] public static extern uint SetThreadExecutionState(uint f);'; $t=Add-Type -MemberDefinition $s -Name P -Namespace W -PassThru; $t::SetThreadExecutionState(0x80000001) | Out-Null; while ($true) { Start-Sleep 60 }"], { stdio: "ignore" });

if (SYNTH.length) {
  // the usual lab must be closed: it would keep its own copy of the same rounds
  try { await fetch(`${LAB}/api/jobs`, { signal: AbortSignal.timeout(2000) }); console.log(`A lab already answers on ${LAB}. Close its window (Start-PromptLab) and run this again. Nothing was rented.`); process.exit(1); } catch {}
}
let tunnel = null, lab = null, finished = false;
async function down(why) {
  if (finished) return;
  finished = true;
  log("down", why);
  for (let i = 0; i < 5 && box().instance; i++) { node(["tools/vast-box.mjs", "down"]); if (box().instance) await sleep(20000); }
  if (box().instance) log("down", "COULD NOT DESTROY the box: run node tools/vast-box.mjs down by hand");
  try { tunnel?.kill(); } catch {}
  try { awake.kill(); } catch {}
  log("done", `${why}. The box is gone. Pictures: ${LAB}${SYNTH.length ? "/synth" : ""} (this window keeps the lab open; close it when you are done)`);
}
process.on("SIGINT", async () => { await down("stopped by Ctrl+C"); process.exit(0); });

// 1. the box (two tries; the second avoids the machine of the first)
if (!(box().step === "ready" && box().instance)) {
  for (let attempt = 1; ; attempt++) {
    if (!box().instance) log("rent", `renting (try ${attempt})`);
    const bad = box().machine;
    const r = node(["tools/vast-box.mjs", "up", "--max", "0.9", ...(attempt > 1 && bad ? ["--avoid", String(bad)] : [])]);
    if (r.status === 0) break;
    log("rent", `up failed: ${box().message ?? "?"}`);
    node(["tools/vast-box.mjs", "down"]);
    if (attempt >= 2 || spent() > BUDGET * 0.5) { await down("could not get a working box"); process.exit(1); }
  }
}
log("ready", `box ${box().instance} $${(box().price ?? 0).toFixed(2)}/h`);

// 2. the concept LoRAs the plan asks for
const plan = SYNTH.length ? { synth: readFileSync(join("tools", "prompt-lab", "synth.yaml"), "utf8") } : JSON.parse(readFileSync(PLAN, "utf8"));
const wanted = [...new Set(JSON.stringify(plan).match(/[\w.-]+\.safetensors/g) ?? [])].filter((f) => !/^(sdxl_lightning|sora_v2|waiIllustrious)/.test(f) && existsSync(join(LORAS, f)));
if (wanted.length && !existsSync(join(DATA, "loras-pushed"))) {
  log("loras", wanted.join(", "));
  if (node(["tools/vast-box.mjs", "push", ...wanted.map((f) => join(LORAS, f))]).status === 0) writeFileSync(join(DATA, "loras-pushed"), wanted.join("\n"));
  else log("loras", "push failed: the variants with these LoRAs will error, the rest goes on");
}

// 3. tunnel, kept up
const openTunnel = () => {
  tunnel = spawn(process.execPath, ["tools/vast-box.mjs", "tunnel", "--port", "18188"], { stdio: "ignore" });
  tunnel.on("exit", () => { if (!finished) setTimeout(openTunnel, 5000); });
};
openTunnel();

// 4. the night lab
lab = spawn(process.execPath, ["node_modules/tsx/dist/cli.mjs", "tools/prompt-lab/server.ts", "--port", String(PORT), "--data", DATA, "--comfy", "http://127.0.0.1:18188", "--inflight", opt("inflight", "4"), "--nosave"], { stdio: ["ignore", "pipe", "pipe"] });
lab.stdout.on("data", (d) => appendFileSync(join(DATA, "server.log"), d));
lab.stderr.on("data", (d) => appendFileSync(join(DATA, "server.log"), d));
const jobs = async () => { try { return await (await fetch(`${LAB}/api/jobs`, { signal: AbortSignal.timeout(5000) })).json(); } catch { return null; } };
for (let i = 0; ; i++) {
  const j = await jobs();
  if (j?.comfyOk) break;
  if (i % 4 === 0) log("wait", j ? "lab up, waiting for ComfyUI through the tunnel" : "starting the lab");
  if (i > 60) { await down("ComfyUI did not answer through the tunnel for 15 min"); process.exit(1); }
  await sleep(15000);
}

// 5. the plan, once
if (SYNTH.length) {
  const mark = join(DATA, `synth-posted-${TAG}`);
  if (!existsSync(mark)) {
    const posted = [];
    for (const concept of SYNTH.filter((x) => x !== "hold")) {
      const r = await (await fetch(`${LAB}/api/synth/round`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ concept, mode: opt("mode", "wide"), scale: Number(opt("scale", "1")) }) })).json();
      posted.push({ concept, ...r });
      log("plan", `${concept}: round ${r.round}, ${r.frames} frames${r.error ? ` (${r.error})` : ""}`);
    }
    writeFileSync(mark, JSON.stringify(posted));
  } else log("plan", `already posted (${mark}); rounds left running go on by themselves`);
} else if (!existsSync(join(DATA, "plan-posted"))) {
  const r = await (await fetch(`${LAB}/api/compare`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(plan) })).json();
  writeFileSync(join(DATA, "plan-posted"), JSON.stringify(r));
  log("plan", `${r.takes} takes, ${r.pictures} pictures`);
}

// 6. watch: one line a minute; down when the queue is empty or the money is at the ceiling
const t0 = Date.now();
let lastDone = 0, deadSince = 0;
for (;;) {
  await sleep(60000);
  const j = await jobs();
  if (!j) { log("watch", "lab not answering"); continue; }
  const left = j.queued + j.drawingAll;
  const rate = (j.done - lastDone);
  lastDone = j.done;
  const eta = rate > 0 ? `~${Math.ceil(left / rate)} min left` : "";
  log("watch", `${j.done}/${j.total} pictures, ${left} to go, ${rate}/min ${eta}${j.errors.length ? `, last error: ${j.errors.at(-1).error?.slice(0, 80)}` : ""}${j.comfyOk ? "" : ", ComfyUI not answering"}`);
  if (HOLD) {
    const hb = join(DATA, "heartbeat");
    const quiet = existsSync(hb) ? (Date.now() - statSync(hb).mtimeMs) / 60000 : (Date.now() - t0) / 60000;
    if (quiet > IDLE && left === 0) { await down(`no new work for ${Math.round(quiet)} min`); break; }
    if (Date.now() - t0 > HOURS * 3600000) { await down(`${HOURS} h limit`); break; }
  } else if (left === 0 && Date.now() - t0 > 120000) { await down(`queue done: ${j.done}/${j.total}`); break; }
  // stop a few cents short of the ceiling: destroying takes a minute
  if (spent() + ((box().price ?? 1) / 60) * 3 >= BUDGET) { await down(`budget reached ($${spent().toFixed(2)})`); break; }
  if (!j.comfyOk) { deadSince ||= Date.now(); if (Date.now() - deadSince > 20 * 60000) { await down("ComfyUI unreachable for 20 min"); break; } } else deadSince = 0;
}
