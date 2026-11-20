// Synthetic frames for concept LoRAs: many pictures of one hard thing (a pose, an act, a close-up), varied on purpose,
// then a strict selection, then a dataset. Concepts and their targets live in synth.yaml (in git); the frames, marks and
// datasets in <data>/synth/ (not in git). Nothing here is written into the game.
//
// A round = one generation over the targets of a concept. Each frame draws one value from every axis of its target
// (view, state, who is seen...), one woman's look and one room. What varies is what the LoRA must NOT tie the concept to;
// what is constant in the target's prompt is what it must learn.
//   round "wide":  every axis value equally often - to find which prompts hit at all
//   round "hits":  axis values weighted by how often they were kept in the earlier rounds
// Marks: Alexey's keep / drop; Claude's first pass ("pre": drop) only hides the obvious rejects.
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync, renameSync, copyFileSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";
import { parse } from "yaml";

type Target = { id: string; title: string; count: number; size?: string; prompt: string; acts?: string[]; axes?: Record<string, string[]>; negative?: string; loras?: string };
type Concept = { id: string; title: string; trigger: string; negative?: string; targets: Target[] };
type Book = { looks: { id: string; look: string; hand: string }[]; rooms: string[]; words: Record<string, string>; neg?: Record<string, string>; concepts: Concept[] };
type Frame = { i: number; target: string; picks: Record<string, number>; look: string; room: string; positive: string; negative: string; caption: string; seed: number; size: string; loras?: string; init?: { k: number; i: number; denoise: number }; file?: string; mark?: "keep" | "drop"; pre?: "drop"; error?: string };
type Round = { screened?: boolean; concept: string; round: number; mode: "wide" | "hits"; at: string; status: "running" | "stopped" | "done"; frames: Frame[] };
type Deps = {
  here: string; dataDir: string; inflight: number; style: { prefix: string; negative: string }; wife: { appearance: string; body: string };
  settings: () => { loras: string; detailSize: string }; render: (pos: string, neg: string, seed: number, size: string, prefix: string, loras?: string, init?: { file: string; denoise: number }) => Promise<Buffer>;
  json: (res: ServerResponse, code: number, v: unknown) => void; body: (req: IncomingMessage) => Promise<Record<string, unknown>>;
};

export function mountSynth(d: Deps) {
  const dir = join(d.dataDir, "synth");
  const SAFE = /^[a-z0-9_]+$/;
  // acts: the wordings of the act are one more axis, named "act"
  const book = (): Book => { const b = parse(readFileSync(join(d.here, "synth.yaml"), "utf8")) as Book; for (const c of b.concepts) for (const x of c.targets) if (x.acts) x.axes = { act: x.acts, ...(x.axes ?? {}) }; return b; };
  const saveJson = (f: string, v: unknown) => { mkdirSync(dirname(f), { recursive: true }); writeFileSync(f + ".part", JSON.stringify(v)); renameSync(f + ".part", f); };
  const roundFile = (c: string, n: number) => join(dir, c, `k${n}.json`);
  const imgFile = (c: string, n: number, i: number) => join(dir, c, `k${n}`, `${i}.png`);
  // rounds are kept in memory while the lab runs (thousands of frames; marks are written through)
  const cache = new Map<string, Round>();
  const load = (c: string, n: number): Round | undefined => {
    const k = `${c}/${n}`;
    if (!cache.has(k) && existsSync(roundFile(c, n))) cache.set(k, JSON.parse(readFileSync(roundFile(c, n), "utf8")));
    return cache.get(k);
  };
  const save = (r: Round) => { cache.set(`${r.concept}/${r.round}`, r); saveJson(roundFile(r.concept, r.round), r); };
  const roundsOf = (c: string) => (existsSync(join(dir, c)) ? readdirSync(join(dir, c)).map((f) => /^k(\d+)\.json$/.exec(f)?.[1]).filter(Boolean).map(Number).sort((a, b) => a - b) : []);

  // ---- prompts
  const strip = (w: string) => w.trim().replace(/^\((.*):[\d.]+\)$/, "$1").trim().toLowerCase();
  const list = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean);
  const uniq = (ws: string[]) => { const seen = new Set<string>(); return ws.filter((w) => { const k = strip(w); if (seen.has(k)) return false; seen.add(k); return true; }); };
  const rnd = (seed: number) => () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32; };
  // how often each axis value was kept so far: target -> axis -> [seen, kept] per value
  // soft: Claude's night screening counts too - in a round he screened, a frame he did not drop is a hit (until Alexey marks it)
  function stats(c: string, soft = false) {
    const out: Record<string, { seen: number; keep: number; axes: Record<string, [number, number][]>; looks: Record<string, [number, number]> }> = {};
    for (const n of roundsOf(c)) { const r = load(c, n)!; for (const f of r.frames) {
      const judged = f.mark || f.pre || (soft && r.screened && f.file);
      if (!judged) continue;
      const kept = f.mark === "keep" || (soft && r.screened && !f.mark && !f.pre) ? 1 : 0;
      const t = (out[f.target] ??= { seen: 0, keep: 0, axes: {}, looks: {} });
      t.seen++; t.keep += kept;
      for (const [a, v] of Object.entries(f.picks)) { const row = ((t.axes[a] ??= [])[v] ??= [0, 0]); row[0]++; row[1] += kept; }
      const l = (t.looks[f.look] ??= [0, 0]); l[0]++; l[1] += kept;
    } }
    return out;
  }
  function plan(c: Concept, n: number, mode: "wide" | "hits", scale: number, only?: string[], soft = false): Frame[] {
    const b = book();
    const st = mode === "hits" ? stats(c.id, soft) : {};
    const words: Record<string, string> = { ...b.words };
    const frames: Frame[] = [];
    const next = rnd(n * 7919 + c.id.length * 104729 + 17);
    for (const t of c.targets) {
      if (only?.length && !only.includes(t.id)) continue;
      const count = Math.max(1, Math.round(t.count * scale));
      const axes = Object.entries(t.axes ?? {});
      for (let k = 0; k < count; k++) {
        const picks: Record<string, number> = {};
        for (const [a, vals] of axes) {
          if (mode === "hits" && st[t.id]?.axes[a]) {
            // weight = smoothed keep rate, so a value that never hit still shows up now and then
            const w = vals.map((_, v) => { const [seen, keep] = st[t.id]!.axes[a]![v] ?? [0, 0]; return (keep + 0.5) / (seen + 2); });
            let x = next() * w.reduce((p, q) => p + q, 0), v = 0;
            while (v < w.length - 1 && (x -= w[v]!) > 0) v++;
            picks[a] = v;
          } else picks[a] = (k + Math.floor(next() * vals.length)) % vals.length;
        }
        const look = b.looks[frames.length % b.looks.length]!;
        const room = b.rooms[Math.floor(next() * b.rooms.length)]!;
        const used = new Set<string>();
        const fill = (s: string): string => s.replace(/\{(\w+)\}/g, (_, key: string) => {
          used.add(key);
          if (key === "look") return look.look === "@wife" ? `${d.wife.appearance}, ${d.wife.body}` : look.look;
          if (key === "hand") return look.hand;
          if (key === "room") return room;
          if (t.axes?.[key]) return fill(t.axes[key]![picks[key]!]!);
          return words[key] !== undefined ? fill(words[key]!) : `{${key}}`;
        });
        const body = uniq(list(fill(t.prompt)));
        const usedNeg = Object.entries(b.neg ?? {}).filter(([key]) => used.has(key)).map(([, v]) => v);
        const has = new Set(body.map(strip));
        const negative = uniq(list([d.style.negative, c.negative ?? "", t.negative ?? "", ...usedNeg].join(", "))).filter((w) => !has.has(strip(w))).join(", ");
        frames.push({
          i: frames.length, target: t.id, picks, look: look.id, room, seed: Math.floor(next() * 2 ** 31), size: t.size ?? d.settings().detailSize, loras: t.loras,
          positive: [d.style.prefix, ...body, "uncensored"].join(", "), negative,
          // the caption a LoRA would be trained on if nothing better is made: trigger first, weights off (a tagger pass over the picture replaces it)
          caption: [c.trigger, ...body.map((w) => w.trim().replace(/^\((.*):[\d.]+\)$/, "$1"))].join(", "),
        });
      }
    }
    return frames;
  }

  // ---- queue
  let running = 0, busy = 0;
  const session: Round[] = []; // rounds drawn in this run of the lab (for the progress line)
  const pending: { r: Round; f: Frame }[] = [];
  async function pump() {
    if (running >= d.inflight) return;
    running++;
    try {
      for (let job = pending.shift(); job; job = pending.shift()) {
        const { r, f } = job;
        if (r.status !== "running" || f.file) continue;
        let tries = 0;
        busy++;
        for (;;) {
          try {
            const png = await d.render(f.positive, f.negative, f.seed, f.size, `synth_${r.concept}_k${r.round}_${f.i}`, f.loras, f.init ? { file: imgFile(r.concept, f.init.k, f.init.i), denoise: f.init.denoise } : undefined);
            mkdirSync(dirname(imgFile(r.concept, r.round, f.i)), { recursive: true });
            writeFileSync(imgFile(r.concept, r.round, f.i), png);
            f.file = `${f.i}.png`; delete f.error;
            break;
          } catch (e) {
            f.error = (e as Error).message.slice(0, 200);
            if (++tries >= 6 || r.status !== "running") break;
            await new Promise((ok) => setTimeout(ok, 5000 * tries));
          }
        }
        busy--;
        if (r.frames.every((x) => x.file || x.error)) r.status = "done";
        // not on every picture: a round file holds thousands of frames
        if (f.i % 20 === 0 || r.status === "done") save(r);
      }
    } finally { running--; }
  }
  const start = (r: Round) => { r.status = "running"; if (!session.includes(r)) session.push(r); for (const f of r.frames) if (!f.file) { delete f.error; pending.push({ r, f }); } save(r); for (let i = running; i < d.inflight; i++) void pump(); };
  // a round that was running when the lab was closed goes on (stop it with the button if it should not)
  if (existsSync(dir)) for (const c of readdirSync(dir)) if (SAFE.test(c)) for (const n of roundsOf(c)) { const r = load(c, n)!; if (r.status === "running") { console.log(`synth: resuming ${c} round ${n}`); start(r); } }

  const summary = (c: string) => roundsOf(c).map((n) => { const r = load(c, n)!; return { round: n, mode: r.mode, status: r.status, at: r.at, total: r.frames.length, drawn: r.frames.filter((f) => f.file).length, keep: r.frames.filter((f) => f.mark === "keep").length, drop: r.frames.filter((f) => f.mark === "drop").length, pre: r.frames.filter((f) => f.pre && !f.mark).length, errors: r.frames.filter((f) => f.error && !f.file).length }; });

  const handler = async (req: IncomingMessage, res: ServerResponse, url: URL) => {
    const p = url.pathname;
    const post = req.method === "POST";
    const q = (k: string) => url.searchParams.get(k) ?? "";
    if (p === "/synth") { res.writeHead(200, { "content-type": "text/html; charset=utf-8" }); res.end(readFileSync(join(d.here, "synth.html"))); return; }
    if (p === "/synth/img") {
      const f = imgFile(q("c"), Number(q("k")), Number(q("i")));
      if (!SAFE.test(q("c")) || !existsSync(f)) return d.json(res, 404, { error: "no picture" });
      res.writeHead(200, { "content-type": "image/png", "cache-control": "max-age=86400" }); res.end(readFileSync(f)); return;
    }
    if (p === "/api/synth/concepts") {
      const b = book();
      return d.json(res, 200, { looks: b.looks.map((l) => l.id), queue: pending.length, concepts: b.concepts.map((c) => ({ id: c.id, title: c.title, trigger: c.trigger, targets: c.targets.map((t) => ({ id: t.id, title: t.title, count: t.count, axes: t.axes ?? {} })), rounds: summary(c.id), stats: stats(c.id, q("soft") === "1") })) });
    }
    const b = post ? await d.body(req) : {};
    const cid = String(post ? b.concept ?? "" : q("c"));
    const c = book().concepts.find((x) => x.id === cid);
    if (!c) return d.json(res, 404, { error: `no concept ${cid}` });
    // sample prompts without drawing anything: to read the plan before a round
    if (p === "/api/synth/preview") {
      const fr = plan(c, roundsOf(c.id).length + 1, "wide", Number(q("scale")) || 1);
      const per = Number(q("per")) || 3;
      return d.json(res, 200, { total: fr.length, byTarget: c.targets.map((t) => ({ id: t.id, title: t.title, count: fr.filter((f) => f.target === t.id).length, samples: fr.filter((f) => f.target === t.id).slice(0, per).map((f) => ({ positive: f.positive, negative: f.negative, size: f.size, look: f.look })) })) });
    }
    if (p === "/api/synth/round" && !post) {
      const r = load(c.id, Number(q("k")));
      if (!r) return d.json(res, 404, { error: "no round" });
      return d.json(res, 200, { ...r, frames: r.frames.map(({ negative: _n, caption: _c, ...f }) => f) });
    }
    if (p === "/api/synth/round" && post) {
      // a new round: this is the only place that starts drawing
      const n = (roundsOf(c.id).at(-1) ?? 0) + 1;
      const mode = b.mode === "hits" ? "hits" : "wide";
      const frames = plan(c, n, mode, Number(b.scale) || 1, b.targets as string[] | undefined, !!b.soft);
      // redraw: the new prompts painted over earlier frames (img2img) - keeps a composition that almost worked, fixes one thing
      const rd = b.redraw as { sources: [number, number][]; denoise?: number } | undefined;
      if (rd?.sources?.length) frames.forEach((f, k) => { const [sk, si] = rd.sources[k % rd.sources.length]!; f.init = { k: sk, i: si, denoise: rd.denoise ?? 0.6 }; });
      const r: Round = { concept: c.id, round: n, mode, at: new Date().toISOString(), status: "running", frames };
      start(r);
      return d.json(res, 200, { round: n, frames: frames.length });
    }
    const r = load(c.id, Number(b.round));
    if (!r) return d.json(res, 404, { error: "no round" });
    if (p === "/api/synth/stop") { r.status = "stopped"; save(r); return d.json(res, 200, { ok: true }); }
    if (p === "/api/synth/resume") { start(r); return d.json(res, 200, { ok: true, left: r.frames.filter((f) => !f.file).length }); }
    if (p === "/api/synth/mark") {
      // one frame (Alexey's keys) or many at once (Claude's first pass: pre)
      // survivors + range: Claude's screening of a stretch of frames - everything in [from, to] not listed is dropped (pre)
      if (b.survivors) {
        const keep = new Set(b.survivors as number[]);
        const [from, to] = (b.range as [number, number] | undefined) ?? [0, r.frames.length - 1];
        for (let i = from; i <= to; i++) { const f = r.frames[i]; if (f) { if (keep.has(i)) delete f.pre; else f.pre = "drop"; } }
        r.screened = true;
        save(r);
        return d.json(res, 200, { ok: true, kept: keep.size });
      }
      if (b.screened !== undefined) r.screened = !!b.screened;
      const ids = (b.frames as number[] | undefined) ?? (b.i !== undefined ? [Number(b.i)] : []);
      for (const i of ids) {
        const f = r.frames[i];
        if (!f) continue;
        if (b.pre !== undefined) { if (b.pre) f.pre = "drop"; else delete f.pre; }
        if (b.mark !== undefined) { if (b.mark === "keep" || b.mark === "drop") f.mark = b.mark; else delete f.mark; }
      }
      save(r);
      return d.json(res, 200, { ok: true });
    }
    if (p === "/api/synth/export") {
      // the dataset of a concept: every kept frame of every round, picture + caption
      const out = join(dir, "_dataset", c.id);
      rmSync(out, { recursive: true, force: true });
      mkdirSync(out, { recursive: true });
      let n = 0;
      const perTarget: Record<string, number> = {};
      for (const k of roundsOf(c.id)) for (const f of load(c.id, k)!.frames) {
        if (f.mark !== "keep" || !f.file) continue;
        const name = `${c.id}_${f.target}_k${k}_${String(f.i).padStart(4, "0")}`;
        copyFileSync(imgFile(c.id, k, f.i), join(out, `${name}.png`));
        writeFileSync(join(out, `${name}.txt`), f.caption + "\n");
        perTarget[f.target] = (perTarget[f.target] ?? 0) + 1;
        n++;
      }
      writeFileSync(join(out, "_README.txt"), `Concept ${c.id} (${c.title}), trigger "${c.trigger}".\n${n} pictures: ${JSON.stringify(perTarget)}\nCaptions are the prompt words (what was asked, not what came out): run a tagger over the pictures and check the captions before training.\n`);
      return d.json(res, 200, { pictures: n, perTarget, folder: out });
    }
    return d.json(res, 404, { error: "no such synth route" });
  };
  // for the lab's own progress line (/api/jobs) and the night runner
  const progress = () => ({ total: session.reduce((a, r) => a + r.frames.length, 0), done: session.reduce((a, r) => a + r.frames.filter((f) => f.file).length, 0), queued: pending.length, drawing: busy, errors: session.flatMap((r) => r.frames.filter((f) => f.error && !f.file)).slice(-3).map((f) => ({ error: f.error })) });
  return Object.assign(handler, { progress });
}
