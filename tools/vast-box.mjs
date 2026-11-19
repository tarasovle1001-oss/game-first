// One rented GPU box for test runs, on the same Vast template and bootstrap as the Wayward Quick Run (Alexey's flow:
// template "Wayward batch", WAI from Civitai by the account's CIVITAI_TOKEN, Lightning + Sora LoRAs by the template's
// cloud-start.sh, one ComfyUI copy per GPU behind a proxy on 18999). The bootstrap and status scripts are read at run time
// from the Wayward folder (wayward-imagegen/src/cloudPanel.ts), not copied here. Runs on Alexey's PC: Vast key in
// ~/.vast/api_key, SSH key in ~/.ssh. Never touches an instance it did not rent (state in .vast-box.json).
//
//   node tools/vast-box.mjs offers                    cheapest verified 1x RTX 5090 offers, no CN/HK
//   node tools/vast-box.mjs up [--gpus 1] [--max 0.8] rent, wait, bootstrap, wait for ComfyUI (prints one line per step)
//   node tools/vast-box.mjs status                    instance, GPUs, models, ComfyUI copies, logs tail
//   node tools/vast-box.mjs tunnel [--port 18188]     ssh -L 127.0.0.1:<port> -> proxy 18999 (stays in foreground)
//   node tools/vast-box.mjs stop | resume             let the GPU go and keep the disk / take it back (then up + tunnel)
//   node tools/vast-box.mjs fetch --civitai <ver> --name <f>  another checkpoint onto the box
//   node tools/vast-box.mjs down                      destroy the rented instance
// Progress of `up`: .vast-box.json (step, message, at) and console lines.
import { spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const argv = process.argv.slice(2);
const cmd = argv[0];
const opt = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const WAYWARD = opt("wayward", join(homedir(), "Documents", "disc", "Wayward"));
const TEMPLATE = opt("template", "bbee86f3efef7244912841df08d8f218");
const STATE = ".vast-box.json";
const st = existsSync(STATE) ? JSON.parse(readFileSync(STATE, "utf8")) : {};
const save = (step, message) => { Object.assign(st, { step, message, at: new Date().toISOString() }); writeFileSync(STATE, JSON.stringify(st, null, 1)); console.log(`[${new Date().toLocaleTimeString()}] ${step}: ${message}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const key = () => readFileSync(join(homedir(), ".vast", "api_key"), "utf8").trim();
async function vast(route, init = {}) {
  const r = await fetch(`https://console.vast.ai/api${route}`, { ...init, headers: { Authorization: `Bearer ${key()}`, "Content-Type": "application/json" } });
  const t = await r.text();
  if (!r.ok) throw Error(`Vast ${r.status}: ${t.replace(/[A-Za-z0-9]{32,}/g, "…").slice(0, 300)}`);
  return JSON.parse(t.replace(/"label_counts":\s*\{[^}]*\},?/, ""));
}
async function offers(gpus = 1, disk = 100) {
  const q = { verified: { eq: true }, rentable: { eq: true }, num_gpus: { eq: gpus }, gpu_name: { in: ["RTX 5090"] }, disk_space: { gte: disk }, inet_down: { gte: 200 }, reliability2: { gte: 0.97 }, order: [["dph_total", "asc"]], type: "on-demand", limit: 16 };
  const r = await vast(`/v0/bundles/?q=${encodeURIComponent(JSON.stringify(q))}`);
  // machines the Quick Run has already marked broken
  let bad = [];
  try { bad = JSON.parse(readFileSync(join(WAYWARD, ".tools", "server-batches", "quick-config.json"), "utf8")).badMachines ?? []; } catch {}
  return (r.offers ?? []).filter((o) => !bad.includes(o.machine_id) && !/(^|,\s*)(CN|HK)$|China|Hong Kong/i.test(String(o.geolocation ?? "")));
}

// the bootstrap and status scripts of the Wayward cloud panel
function script(name) {
  const src = readFileSync(join(WAYWARD, "wayward-imagegen", "src", "cloudPanel.ts"), "utf8");
  const m = new RegExp(`const ${name} = String\\.raw\`([\\s\\S]*?)\`\\n`).exec(src);
  if (!m) throw Error(`no ${name} in cloudPanel.ts`);
  return m[1];
}
const sshKey = () => {
  const dir = join(homedir(), ".ssh");
  const k = readdirSync(dir).find((n) => !n.endsWith(".pub") && existsSync(join(dir, n)) && /^-----BEGIN OPENSSH PRIVATE KEY-----/.test(readFileSync(join(dir, n), "utf8").slice(0, 40)));
  if (!k) throw Error("no OpenSSH private key in ~/.ssh");
  return join(dir, k);
};
const sshArgs = () => ["-i", sshKey(), "-o", "IdentitiesOnly=yes", "-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=accept-new", "-o", "ConnectTimeout=8", "-o", "ServerAliveInterval=15", "-p", String(st.port), `root@${st.host}`];
function remote(py, timeout = 60000) {
  const r = spawnSync("ssh", [...sshArgs(), "/venv/main/bin/python", "-"], { input: py, encoding: "utf8", timeout });
  if (r.status !== 0) throw Error((r.stderr || r.error?.message || "ssh failed").trim().slice(-300));
  return JSON.parse(r.stdout.trim().split("\n").pop());
}

const WAI = "/workspace/ComfyUI/models/checkpoints/waiIllustriousSDXL_v170.safetensors";
const WAI_START = `import os,pathlib,subprocess,json
env=os.environ.copy();env.update(dict(x.decode().split('=',1) for x in pathlib.Path('/proc/1/environ').read_bytes().split(b'\\0') if b'=' in x))
if not pathlib.Path('/workspace/ComfyUI/models').exists():subprocess.run(['bash','/etc/vast_boot.d/36-sync-workspace.sh'],env=env,check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,timeout=650)
p=pathlib.Path('${WAI}');p.parent.mkdir(parents=True,exist_ok=True)
if not (p.exists() and p.stat().st_size>6e9):
 tok=env.get('CIVITAI_TOKEN','')
 if not tok:raise SystemExit('no CIVITAI_TOKEN on the instance')
 sh="curl -fL --retry 4 -s -o '%s.part' 'https://civitai.com/api/download/models/2883731?token=%s' && mv '%s.part' '%s' && echo DONE || echo FAILED"%(p,tok,p,p)
 subprocess.Popen(['bash','-c',sh],stdin=subprocess.DEVNULL,stdout=open('/workspace/tc-wai.log','ab'),stderr=subprocess.STDOUT,start_new_session=True)
print(json.dumps(dict(ok=True)))`;
const WAI_STATUS = `import json,pathlib
p=pathlib.Path('${WAI}');q=pathlib.Path(str(p)+'.part');l=pathlib.Path('/workspace/tc-wai.log')
t=l.read_text()[-300:] if l.exists() else ''
done=p.exists() and p.stat().st_size>6e9
print(json.dumps(dict(done=done,failed='FAILED' in t and not done,bytes=(p if p.exists() else q).stat().st_size if (p.exists() or q.exists()) else 0,log=t)))`;

async function up() {
  if (!st.instance) {
    const list = await offers(Number(opt("gpus", "1")));
    const max = Number(opt("max", "0"));
    const o = list.find((x) => !max || x.dph_total <= max);
    if (!o) throw Error("no offer");
    save("rent", `offer ${o.id}: ${o.num_gpus}x ${o.gpu_name} $${o.dph_total.toFixed(2)}/h ${o.geolocation}`);
    const r = await vast(`/v0/asks/${o.id}/`, { method: "PUT", body: JSON.stringify({ client_id: "me", template_hash_id: TEMPLATE, disk: 100, label: "test-city-probe" }) });
    if (!r.new_contract) throw Error(`no instance: ${JSON.stringify(r).slice(0, 200)}`);
    Object.assign(st, { instance: r.new_contract, rentedAt: Date.now(), price: o.dph_total });
    save("rent", `instance ${st.instance}`);
  }
  for (;;) {
    const x = ((await vast("/v1/instances/")).instances ?? []).find((i) => i.id === st.instance);
    if (!x) throw Error(`instance ${st.instance} is gone`);
    const port = x.ports?.["22/tcp"]?.[0]?.HostPort;
    if (x.actual_status === "running" && port && x.public_ipaddr) { Object.assign(st, { host: x.public_ipaddr, port: Number(port) }); break; }
    save("start", `${x.actual_status ?? "?"} ${String(x.status_msg ?? "").slice(0, 100)} (${((Date.now() - st.rentedAt) / 60000).toFixed(0)} min)`);
    if (Date.now() - st.rentedAt > 40 * 60000) throw Error("not running after 40 min: run `down` and try again");
    await sleep(20000);
  }
  for (let i = 0; ; i++) {
    try { remote('import json\nprint(json.dumps(dict(ok=True)))', 20000); break; }
    catch (e) {
      save("ssh", `waiting: ${e.message.slice(0, 80)}`);
      if (i === 6 && existsSync(`${sshKey()}.pub`)) await vast(`/v0/instances/${st.instance}/ssh/`, { method: "POST", body: JSON.stringify({ ssh_key: readFileSync(`${sshKey()}.pub`, "utf8").trim() }) }).catch(() => {});
      if (i > 60) throw e;
      await sleep(15000);
    }
  }
  // the template's cloud-start.sh looks WAI up on Civitai by name and that fails: fetch it by version id first, as the Quick Run does
  save("models", "syncing the image workspace, then WAI from Civitai (version 2883731)");
  remote(WAI_START, 700000);
  for (;;) {
    const w = remote(WAI_STATUS);
    if (w.failed) throw Error(`WAI download failed: ${w.log}`);
    save("models", `WAI ${(w.bytes / 1e9).toFixed(2)} / 6.94 GB`);
    if (w.done) break;
    await sleep(15000);
  }
  save("prepare", `root@${st.host}:${st.port}, starting bootstrap (LoRAs, ComfyUI)`);
  remote(script("remotePrepare"), 900000);
  const prepAt = Date.now();
  for (;;) {
    const s = remote(script("remoteStatus"));
    const m = s.models.map((x) => `${x.name.split(/[_.]/)[0]} ${Math.round((100 * x.bytes) / x.expectedBytes)}%`).join(", ");
    const ready = s.proxy && s.workers.length && s.workers.every((w) => w.ready);
    save(ready ? "ready" : "prepare", `models: ${m}; ComfyUI ${s.workers.filter((w) => w.ready).length}/${s.workers.length}${s.proxy ? ", proxy up" : ""}`);
    if (ready) break;
    const log = s.logs.map((l) => l.text).join("\n");
    if (!s.preparing && Date.now() - prepAt > 90000 && /Traceback|CHECK FAILED|ERROR:/.test(log.slice(-1500))) throw Error(`bootstrap failed: ${log.slice(-400)}`);
    await sleep(20000);
  }
  save("ready", `$${st.price.toFixed(2)}/h. Next: node tools/vast-box.mjs tunnel, then comfy-run with --comfy http://127.0.0.1:18188`);
}

if (cmd === "offers") for (const o of (await offers(Number(opt("gpus", "1")))).slice(0, 8)) console.log(`${o.id}  ${o.num_gpus}x ${o.gpu_name}  $${o.dph_total.toFixed(2)}/h  ${o.geolocation}  down ${Math.round(o.inet_down)} Mbps  ${Math.round(o.cpu_ram / 1024)} GB RAM`);
else if (cmd === "up") await up().catch((e) => { save("error", e.message); process.exit(1); });
else if (cmd === "status") { if (st.host) console.log(JSON.stringify(remote(script("remoteStatus")), null, 1)); else console.log(st); }
else if (cmd === "tunnel") { const p = opt("port", "18188"); console.log(`tunnel 127.0.0.1:${p} -> box proxy 18999 (Ctrl+C to close)`); spawn("ssh", ["-N", "-o", "ExitOnForwardFailure=yes", "-L", `127.0.0.1:${p}:127.0.0.1:18999`, ...sshArgs()], { stdio: "inherit" }); }
else if (cmd === "fetch") {
  // another checkpoint from Civitai onto the box, by version id: fetch --civitai 1887507 --name illumiyume_v35_vpred.safetensors
  const ver = opt("civitai"), name = opt("name");
  if (!ver || !name || !/^[\w.-]+\.safetensors$/.test(name)) { console.log("fetch --civitai <version id> --name <file>.safetensors"); process.exit(1); }
  const dst = `/workspace/ComfyUI/models/checkpoints/${name}`;
  remote(`import os,pathlib,subprocess,json
env=dict(x.decode().split('=',1) for x in pathlib.Path('/proc/1/environ').read_bytes().split(b'\\0') if b'=' in x)
p=pathlib.Path('${dst}')
if not (p.exists() and p.stat().st_size>1e9):
 sh="curl -fL --retry 4 -s -o '%s.part' 'https://civitai.com/api/download/models/${ver}?token=%s' && mv '%s.part' '%s' && echo DONE || echo FAILED"%(p,env.get('CIVITAI_TOKEN',''),p,p)
 subprocess.Popen(['bash','-c',sh],stdin=subprocess.DEVNULL,stdout=open('/workspace/tc-fetch.log','ab'),stderr=subprocess.STDOUT,start_new_session=True)
print(json.dumps(dict(ok=True)))`);
  for (;;) {
    const r = remote(`import json,pathlib
p=pathlib.Path('${dst}');q=pathlib.Path(str(p)+'.part');l=pathlib.Path('/workspace/tc-fetch.log')
t=l.read_text()[-200:] if l.exists() else ''
print(json.dumps(dict(done=p.exists(),bytes=(p if p.exists() else q).stat().st_size if (p.exists() or q.exists()) else 0,failed='FAILED' in t and not p.exists())))`);
    if (r.failed) { save("fetch", `failed: ${name}`); process.exit(1); }
    save("fetch", `${name} ${(r.bytes / 1e9).toFixed(2)} GB${r.done ? " - done" : ""}`);
    if (r.done) break;
    await sleep(10000);
  }
}
else if (cmd === "stop" || cmd === "resume") {
  // stopped: the GPU is let go, the disk with models stays (storage is billed, cents a day); resume needs the same GPU free again
  if (!st.instance) console.log("nothing rented");
  else { await vast(`/v0/instances/${st.instance}/`, { method: "PUT", body: JSON.stringify({ state: cmd === "stop" ? "stopped" : "running" }) }); save(cmd === "stop" ? "stopped" : "resuming", `instance ${st.instance}${cmd === "resume" ? ": then run up (it skips renting) and tunnel" : ""}`); }
}
else if (cmd === "down") { if (!st.instance) console.log("nothing rented"); else { await vast(`/v0/instances/${st.instance}/`, { method: "DELETE" }); save("destroyed", `instance ${st.instance}, ${((Date.now() - st.rentedAt) / 3600000 * st.price).toFixed(2)}$ approx`); writeFileSync(STATE, JSON.stringify({ last: st.instance }, null, 1)); } }
else console.log("offers | up | status | tunnel | down (see the head of this file)");
