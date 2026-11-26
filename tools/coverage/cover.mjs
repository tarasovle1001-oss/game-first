// Picture coverage, the counting (27.11). Shared by the page (tools/coverage/index.html) and tools/coverage/missing.ts.
// A scene's picture key = scene / who / room / tags. For each scene the config picks its axes (tags + the room, grouped into backgrounds)
// and how each must be covered:
//   full  - every value with every value of the other "full" axes (all combinations);
//   cover - every value at least once (paired round-robin with the others);
//   ignore - left to the game's nearest-picture pick (packfind.ts).
// Guarantee keys of a scene = product of the "full" axes x the longest "cover" axis. A guarantee key counts as drawn when the pack has
// a key of that scene whose values match on every full / cover axis (other tags may differ: the game picks the nearest).

export const LADDER = { gape: ["0", "1", "2", "3"], tsize: ["1", "2", "3", "4"], wet: ["0", "1", "2", "3"] };
export const AXIS_RU = { room: "фон", outfit: "наряд", face: "лицо", bare: "что снято", gape: "растяжение", tsize: "размер игрушки", wet: "мокрость", wear: "бельё на вставке", under: "бельё", skirt: "юбка", marks: "сперма/следы", crowd: "зеваки", men: "мужчин", phase: "фаза", fin: "куда кончил", xray: "рентген", lock: "замок ногами", toy: "игрушка", cage: "клетка", size: "размер его", size2: "размер 2-го", size3: "размер 3-го", hsize: "размер мужа", who: "кто", sore: "натёрто" };
// the game's own weights for a wrong value (look.yaml: match) - a heavier axis is more visible, so it comes first by default
export const WEIGHT = { bare: 12, xray: 10, men: 9, phase: 9, outfit: 8, wear: 6, room: 5, toy: 5, cage: 5, fin: 5, tsize: 4, face: 3, size: 3, hsize: 3, marks: 3, crowd: 3, size2: 2, size3: 2, under: 2, skirt: 2, gape: 1, sore: 1, wet: 1 };

export const ROOM_GROUPS = {
  "cafe.hall": "зал", "cafe.bar": "зал", "cafe.lounge": "зал",
  "cafe.staff": "подсобка", "cafe.kitchen": "подсобка", "cafe.toilet": "подсобка", "cafe.sauna": "сауна",
  "hotel.landing": "номера", "hotel.room1": "номера", "hotel.room2": "номера",
  "home.bedroom": "дом", "home.bathroom": "ванная",
  "town.square": "город", "town.market": "город", "town.shops": "город", "town.gym": "город", "town.sexshop": "город", "town.far": "город",
  any: "любой",
};

export function parseKey(key) {
  const [scene, who = "", room = "", tagText = ""] = key.split("/");
  const tags = {};
  for (const p of tagText.split(",").filter(Boolean)) { const i = p.indexOf("="); if (i > 0) tags[p.slice(0, i)] = p.slice(i + 1); }
  return { scene, who, room, tags };
}

/** Defaults of the config from the data: outfits worn per background (>= 2% of its views), axis modes. */
export function defaultConfig(data) {
  const groups = {}; for (const r of data.rooms) groups[r] = ROOM_GROUPS[r] ?? r;
  const views = {};
  for (const s of data.scenes) for (const [k, n] of s.keys) { const p = parseKey(k); const o = p.tags.outfit; if (!o || o === "naked") continue; const g = groups[p.room] ?? p.room; (views[g] ??= {})[o] = (views[g][o] ?? 0) + n; }
  const outfitsByGroup = {};
  for (const [g, m] of Object.entries(views)) { const tot = Object.values(m).reduce((a, b) => a + b, 0); outfitsByGroup[g] = Object.entries(m).filter(([, n]) => n >= 0.02 * tot).sort((a, b) => b[1] - a[1]).map(([o]) => o); }
  outfitsByGroup["город"] ??= ["street"]; if (!outfitsByGroup["город"].includes("street")) outfitsByGroup["город"].unshift("street");
  outfitsByGroup["ванная"] = ["towel"]; outfitsByGroup["сауна"] ??= ["towel"];
  return {
    version: 1,
    frames: { hot: 8, normal: 3, tail: 2 }, hotShare: 0.5,
    roomGroups: groups, outfitsByGroup,
    axisDefaults: { room: { mode: "cover" }, outfit: { mode: "full" }, outfitDetail: { mode: "cover" }, face: { mode: "cover" }, bare: { mode: "cover" }, gape: { mode: "full" }, tsize: { mode: "full" }, wear: { mode: "full" }, wet: { mode: "cover" } },
    facesDefault: { full: ["aroused", "ecstatic", "happy"], portrait: ["plain", "happy", "shy", "aroused", "ashamed"], detail: [] },
    scenes: {},
  };
}

const uniq = (a) => [...new Set(a)];

/** The axes of a scene with their mode and values (config over defaults). */
export function sceneAxes(scene, data, cfg) {
  const sc = cfg.scenes[scene.id] ?? {};
  const keys = scene.keys.map(([k]) => parseKey(k));
  const seen = {}; for (const p of keys) for (const [a, v] of Object.entries(p.tags)) (seen[a] ??= new Set()).add(v);
  const groupOf = (r) => cfg.roomGroups[r] ?? ROOM_GROUPS[r] ?? r;
  let groups = uniq(keys.map((p) => groupOf(p.room)));
  const herIn = scene.roles.includes("wife");
  if (!groups.length) groups = [scene.kind === "detail" || scene.kind === "portrait" ? "любой" : scene.roles.some((r) => r.startsWith("patron")) ? "подсобка" : "дом"];
  const names = uniq([...(scene.kind === "full" ? ["room"] : []), ...Object.keys(seen), ...(herIn && !keys.length && scene.kind === "full" ? ["outfit", "face"] : [])]);
  const out = [];
  for (const a of names) {
    const over = sc.axes?.[a] ?? {};
    const mode = over.mode ?? (scene.kind !== "full" && a === "outfit" ? cfg.axisDefaults.outfitDetail?.mode ?? "cover" : cfg.axisDefaults[a]?.mode) ?? "ignore";
    let values;
    if (over.values) values = over.values;
    else if (a === "room") values = groups;
    else if (a === "outfit") { values = uniq(groups.flatMap((g) => cfg.outfitsByGroup[g] ?? cfg.outfitsByGroup["зал"] ?? [])); if (seen.outfit?.has("naked") || (!values.length && herIn)) values.push("naked"); if (scene.kind === "portrait") values = uniq([...values, ...(seen.outfit ?? [])]); }
    else if (a === "face") values = seen.face?.size ? [...seen.face] : cfg.facesDefault[scene.kind] ?? [];
    else if (LADDER[a] && (a !== "wet" || scene.id === "detail_gape_v")) values = LADDER[a].filter((v) => a !== "tsize" || Number(v) <= 3 || scene.id !== "detail_toy_a");
    else values = [...(seen[a] ?? [])];
    out.push({ name: a, mode, values: values.length ? values : [""], weight: WEIGHT[a] ?? 1 });
  }
  out.sort((x, y) => y.weight - x.weight);
  return out;
}

/** Guarantee combinations of a scene: [{axis: value}]. */
export function guarantee(axes) {
  const full = axes.filter((a) => a.mode === "full"), cover = axes.filter((a) => a.mode === "cover");
  let combos = [{}];
  for (const a of full) combos = combos.flatMap((c) => a.values.map((v) => ({ ...c, [a.name]: v })));
  const n = Math.max(1, ...cover.map((a) => a.values.length));
  const out = [];
  for (const c of combos) for (let i = 0; i < n; i++) { const x = { ...c }; for (const a of cover) x[a.name] = a.values[i % a.values.length]; out.push(x); }
  return out;
}

const val = (p, a, groupOf) => (a === "room" ? (p.room === "any" ? "*" : groupOf(p.room)) : (p.tags[a] ?? ""));
const fits = (want, p, groupOf) => Object.entries(want).every(([a, v]) => { const x = val(p, a, groupOf); return x === v || x === "*"; });

/**
 * How much of a scene's guarantee a set of drawn keys covers, in guarantee keys. For each combination of the "full" axes the
 * need is: every value of every "cover" axis seen at least once among the drawn keys of that combination (they need not be paired).
 * Returns { keys: covered guarantee keys (fractional per combination), gaps: [{full combo, axis, value}] }.
 */
function coverBy(axes, drawn, groupOf) {
  const full = axes.filter((a) => a.mode === "full"), cover = axes.filter((a) => a.mode === "cover");
  let combos = [{}];
  for (const a of full) combos = combos.flatMap((c) => a.values.map((v) => ({ ...c, [a.name]: v })));
  const per = Math.max(1, ...cover.map((a) => a.values.length));
  let keys = 0; const gaps = [];
  for (const c of combos) {
    const here = drawn.filter((p) => fits(c, p, groupOf));
    if (!cover.length) { if (here.length) keys += 1; else gaps.push({ c, a: null, v: null }); continue; }
    if (!here.length) { keys += 0; for (const a of cover) for (const v of a.values) gaps.push({ c, a: a.name, v }); continue; }
    // keys this combination still needs = the most values missing on any one cover axis (they can share keys)
    let need = 0;
    for (const a of cover) { const miss = a.values.filter((v) => !here.some((p) => { const x = val(p, a.name, groupOf); return x === v || x === "*"; })); need = Math.max(need, miss.length); for (const v of miss) gaps.push({ c, a: a.name, v }); }
    keys += per - need;
  }
  return { keys, gaps, combos: combos.length, per };
}

/** The keys to draw for the gaps: per full combination, missing cover values paired round-robin into as few keys as possible. */
function keysForGaps(axes, gaps) {
  const cover = axes.filter((a) => a.mode === "cover");
  const by = new Map();
  for (const g of gaps) { const id = JSON.stringify(g.c); const e = by.get(id) ?? { c: g.c, miss: {} }; if (g.a) (e.miss[g.a] ??= []).push(g.v); by.set(id, e); }
  const out = [];
  for (const { c, miss } of by.values()) {
    const n = Math.max(1, ...Object.values(miss).map((v) => v.length));
    for (let i = 0; i < n; i++) { const k = { ...c }; for (const a of cover) { const m = miss[a.name]; k[a.name] = m?.length ? m[i % m.length] : a.values[i % a.values.length]; } out.push(k); }
  }
  return out;
}

/** Everything the page shows for one scene. */
export function sceneStats(scene, data, cfg) {
  const axes = sceneAxes(scene, data, cfg);
  const off = cfg.scenes[scene.id]?.off;
  const g = off ? [] : guarantee(axes);
  const groupOf = (r) => cfg.roomGroups[r] ?? ROOM_GROUPS[r] ?? r;
  const mine = (src) => Object.keys(src).filter((k) => k.split("/")[0] === scene.id).map(parseKey);
  const p26 = mine(data.pack26), old = mine(data.older);
  const a26 = off ? { keys: 0, gaps: [] } : coverBy(axes, p26, groupOf);
  const aAll = off ? { keys: 0, gaps: [] } : coverBy(axes, [...p26, ...old], groupOf);
  const in26 = Math.round(a26.keys), inOld = Math.max(0, Math.round(aAll.keys) - in26);
  const missing = off ? [] : keysForGaps(axes, aAll.gaps);
  // frames: hot keys (the most seen bot keys up to hotShare of the scene's views) get frames.hot, every guarantee key frames.normal,
  // bot keys outside the guarantee frames.tail
  const fr = { ...cfg.frames, ...(cfg.scenes[scene.id]?.frames ?? {}) };
  const tot = scene.keys.reduce((a, [, n]) => a + n, 0); let acc = 0, hot = 0;
  for (const [, n] of [...scene.keys].sort((a, b) => b[1] - a[1])) { if (!tot || acc >= cfg.hotShare * tot) break; acc += n; hot++; }
  const botOutside = Math.max(0, scene.keys.length - g.length);
  const frames = off ? 0 : g.length * fr.normal + hot * Math.max(0, fr.hot - fr.normal) + botOutside * fr.tail;
  return { axes, guarantee: g.length, in26, inOld, missing, hot, frames, views: tot, botKeys: scene.keys.length, drawn26: p26.length, off: !!off };
}
