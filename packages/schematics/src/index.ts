// Schematic scene pictures: mannequins made of lines, one colour per role.
// Pure string output (SVG), no DOM. The game is fully playable on these until image packs exist,
// and they show at a glance what scene the core thinks is going on.

export type Pose = "stand" | "sit" | "kneel" | "kneel_sit" | "lie_back" | "lie_open" | "lie_front" | "lie_side" | "bend" | "all_fours" | "straddle" | "squat";

type P = [number, number];
/** Where a hand or a foot goes: two angles (upper and lower segment, degrees, 0 = ahead, 90 = up), or a target to reach for. */
export type Limb = [number, number] | { to: string | P; dx?: number; dy?: number; bend?: 1 | -1 };
export interface Prop {
  len?: number; // cm
  angle?: number; // degrees, 0 = ahead, 90 = up
  to?: string; // "role.joint": it points there (and stops there)
  dx?: number;
  dy?: number;
  hand?: "R" | "L"; // toys: which hand holds it
  from?: string; // toys: or the joint it is strapped to ("groin")
  curve?: number; // degrees it bends along its length, + = upward for a figure facing right
  then?: string; // "role.joint": past where it goes in, it carries on toward this (her throat, deeper inside)
}

export interface Figure {
  role: string;
  pose: Pose;
  x: number; // offset from the centre
  y?: number; // lift above the floor
  flip?: boolean; // true = faces left
  scale?: number; // body size against the default for the role
  torso?: number; // overrides the stance: direction from pelvis to neck, degrees
  head?: number; // direction from neck to head
  armR?: Limb;
  armL?: Limb;
  legR?: Limb;
  legL?: Limb;
  penis?: Prop | boolean;
  toy?: Prop;
}

export interface SchematicOptions {
  title?: string; // scene name
  subtitle?: string; // room
  legend?: Record<string, string>; // role -> label
  colors?: Record<string, string>;
}

// ---------------------------------------------------------------------------------------------
// The rig. A side view: x ahead (the figure faces right unless flipped), y up from the floor.
// Lengths in units; a standing woman is about 95 high, and 1 cm is about 0.56 units.
const LEN = { torso: 30, neck: 11, upper: 16, fore: 14, thigh: 24, shin: 24, head: 6.5 };
const CM = 0.56;
/** Body size by role: the guest is a tall man, the husband an ordinary one. */
export const ROLE_SCALE: Record<string, number> = { wife: 0.95, husband: 1, patron: 1.25 }; // in the picture packs the guest towers over her
/** What he has, in cm, when a scene shows it. The guest of the picture packs is drawn very large. */
export const ROLE_PENIS: Record<string, number> = { husband: 11, patron: 33 }; // about the length of his forearm, as the packs draw it

interface Stance {
  pelvis: number; // height of the pelvis above the floor, units
  torso: number;
  head: number;
  arm: [number, number];
  leg: [number, number];
  legFar?: [number, number]; // when the far leg does something else
  prop?: "seat" | "bed";
}
const STANCES: Record<Pose, Stance> = {
  stand: { pelvis: 48, torso: 90, head: 88, arm: [-80, -75], leg: [-88, -92] },
  sit: { pelvis: 26, torso: 92, head: 88, arm: [-55, -15], leg: [0, -90], prop: "seat" },
  kneel: { pelvis: 24, torso: 88, head: 85, arm: [-50, 10], leg: [-90, 180] },
  kneel_sit: { pelvis: 9, torso: 86, head: 85, arm: [-60, -10], leg: [-18, 174] },
  lie_back: { pelvis: 5, torso: 180, head: 172, arm: [0, -4], leg: [40, -62], prop: "bed" },
  lie_open: { pelvis: 6, torso: 178, head: 165, arm: [150, 190], leg: [62, 8], legFar: [78, 30], prop: "bed" },
  lie_front: { pelvis: 5, torso: 178, head: 160, arm: [170, 200], leg: [0, 4], prop: "bed" },
  lie_side: { pelvis: 7, torso: 176, head: 165, arm: [-30, 200], leg: [16, -32], legFar: [6, -14], prop: "bed" },
  bend: { pelvis: 48, torso: 8, head: 20, arm: [-70, -85], leg: [-90, -90] },
  all_fours: { pelvis: 24, torso: 6, head: 30, arm: [-88, -92], leg: [-90, 178] },
  straddle: { pelvis: 14, torso: 90, head: 88, arm: [-50, -30], leg: [-22, -168] },
  squat: { pelvis: 16, torso: 80, head: 85, arm: [-30, 0], leg: [30, -100] },
};

export interface Solved {
  role: string;
  /** Joints in scene coordinates (x from the centre, y up from the floor). */
  j: Record<string, P>;
  /** Things that are not bones: what he has, what she holds. */
  extras: { kind: "penis" | "toy"; pts: P[] }[];
  prop?: "seat" | "bed";
  flip: boolean;
  scale: number;
}
const rad = (d: number) => (d * Math.PI) / 180;
const add = (a: P, len: number, deg: number): P => [a[0] + len * Math.cos(rad(deg)), a[1] + len * Math.sin(rad(deg))];
/** Two-bone reach: where the middle joint sits when the end is at the target (or as near as the limb gets). */
function reach(root: P, target: P, l1: number, l2: number, bend: number): [P, P] {
  const dx = target[0] - root[0];
  const dy = target[1] - root[1];
  const d = Math.max(Math.abs(l1 - l2) + 0.01, Math.min(l1 + l2 - 0.01, Math.hypot(dx, dy)));
  const base = Math.atan2(dy, dx);
  const a = Math.acos((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d));
  const mid: P = [root[0] + l1 * Math.cos(base + bend * a), root[1] + l1 * Math.sin(base + bend * a)];
  const end: P = [root[0] + d * Math.cos(base), root[1] + d * Math.sin(base)];
  return [mid, end];
}

/** Works out every joint of every figure. Targets may name joints of other figures ("patron.hipR"), so it runs a few passes. */
export function solve(figures: Figure[]): Solved[] {
  let prev: Solved[] = [];
  for (let pass = 0; pass < 3; pass++) {
    const known = prev;
    prev = figures.map((f, index) => {
      const st = STANCES[f.pose];
      const k = (ROLE_SCALE[f.role] ?? 1) * (f.scale ?? 1);
      const dir = f.flip ? -1 : 1;
      const L = (n: number) => n * k;
      // everything is worked out facing right around the figure's own origin, then mirrored
      const local = (w: P): P => [dir * (w[0] - f.x), w[1] - (f.y ?? 0)];
      const j: Record<string, P> = {};
      const lookup = (ref: string): P | null => {
        const [who, joint] = ref.split(".") as [string, string];
        if (who === "self") return j[joint] ?? null; // her own body: only what is already worked out (trunk, legs, what he has)
        const other = known.find((s, i) => s.role === who && i !== index) ?? known.find((s) => s.role === who);
        const at = other?.j[joint];
        return at ? local(at) : null;
      };
      const target = (t: Exclude<Limb, [number, number]>): P | null => {
        const base = typeof t.to === "string" ? lookup(t.to) : local(t.to);
        return base ? [base[0] + dir * (t.dx ?? 0), base[1] + (t.dy ?? 0)] : null;
      };
      j.pelvis = [0, L(st.pelvis)];
      const torso = f.torso ?? st.torso;
      j.neck = add(j.pelvis, L(LEN.torso), torso);
      j.chest = add(j.pelvis, L(LEN.torso) * 0.7, torso);
      j.head = add(j.neck, L(LEN.neck), f.head ?? st.head + (torso - st.torso));
      const ahead = torso - 90; // the way the front of the body points
      j.mouth = add(j.head, L(5), ahead);
      j.groin = add(j.pelvis, L(4), ahead - 25);
      j.butt = add(j.pelvis, L(5), ahead + 180);
      const limb = (name: "arm" | "leg", side: "R" | "L", spec: Limb | undefined) => {
        const far = side === "L";
        const root: P = name === "arm" ? add(j.neck!, L(3), torso + 180) : j.pelvis!;
        const shift = far ? (name === "arm" ? -3 : 3) : 0; // the far limb sits a little off the near one
        const rootS: P = [root[0] + L(shift) * 0.5, root[1] + (far ? L(1) : 0)];
        const [l1, l2] = name === "arm" ? [L(LEN.upper), L(LEN.fore)] : [L(LEN.thigh), L(LEN.shin)];
        const bendDefault = name === "arm" ? -1 : 1;
        let mid: P;
        let end: P;
        const tgt = spec && !Array.isArray(spec) ? target(spec) : null;
        if (tgt) [mid, end] = reach(rootS, tgt, l1, l2, (spec as { bend?: number }).bend ?? bendDefault);
        else {
          const base = name === "arm" ? st.arm : far && st.legFar ? st.legFar : st.leg;
          const lean = name === "arm" ? torso - st.torso : 0; // arms hang with the body, legs stay put
          const [a1, a2] = Array.isArray(spec) ? spec : ([base[0] + lean, base[1] + lean] as [number, number]);
          mid = add(rootS, l1, a1);
          end = add(mid, l2, a2);
          if (!Array.isArray(spec)) {
            mid = [mid[0] + L(shift), mid[1]];
            end = [end[0] + L(shift), end[1]];
          }
        }
        const [r, m, e] = name === "arm" ? ["shoulder", "elbow", "hand"] : ["hip", "knee", "foot"];
        j[r + side] = rootS;
        j[m + side] = mid;
        j[e + side] = end;
      };
      const extras: { kind: "penis" | "toy"; pts: P[] }[] = [];
      /** A few points along it: straight to where it goes in (bent if asked), then on toward the next place while there is length left. */
      const propLine = (from: P, pr: Prop, fallbackLen: number, fallbackAngle: number): P[] => {
        const len = L((pr.len ?? fallbackLen) * CM);
        const t = pr.to ? lookup(pr.to) : null;
        let end: P;
        let used: number;
        if (t) {
          const aim: P = [t[0] + dir * (pr.dx ?? 0), t[1] + (pr.dy ?? 0)];
          const d = Math.hypot(aim[0] - from[0], aim[1] - from[1]);
          const ang = Math.atan2(aim[1] - from[1], aim[0] - from[0]);
          used = Math.min(len, d); // it ends where it goes in, unless it carries on
          end = [from[0] + used * Math.cos(ang), from[1] + used * Math.sin(ang)];
        } else {
          used = len;
          end = add(from, len, pr.angle ?? fallbackAngle);
        }
        const sag = Math.tan(rad((pr.curve ?? 0) / 4)) * (used / 2);
        const nx = -(end[1] - from[1]) / Math.max(0.01, used);
        const ny = (end[0] - from[0]) / Math.max(0.01, used);
        const pts: P[] = [0, 1 / 3, 2 / 3, 1].map((u) => {
          const bow = Math.sin(Math.PI * u) * sag;
          return [from[0] + (end[0] - from[0]) * u + nx * bow, from[1] + (end[1] - from[1]) * u + ny * bow] as P;
        });
        const next = pr.then && t ? lookup(pr.then) : null;
        if (next && len - used > 1) {
          const d = Math.hypot(next[0] - end[0], next[1] - end[1]);
          const l = Math.min(len - used, d);
          pts.push([end[0] + ((next[0] - end[0]) * l) / Math.max(0.01, d), end[1] + ((next[1] - end[1]) * l) / Math.max(0.01, d)]);
        }
        return pts;
      };
      limb("leg", "L", f.legL);
      limb("leg", "R", f.legR);
      if (f.penis) {
        const pr = f.penis === true ? {} : f.penis;
        const pts = propLine(j.groin, { curve: 14, ...pr }, ROLE_PENIS[f.role] ?? 13, ahead + 25);
        j.penisTip = pts.at(-1)!;
        j.penisMid = pts[2]!;
        extras.push({ kind: "penis", pts });
      }
      limb("arm", "L", f.armL);
      limb("arm", "R", f.armR);
      if (f.toy) {
        const hand = f.toy.from ? j[f.toy.from]! : j[`hand${f.toy.hand ?? "R"}`]!;
        const pts = propLine(hand, f.toy, 18, ahead);
        j.toyTip = pts.at(-1)!;
        extras.push({ kind: "toy", pts });
      }
      const world = (q: P): P => [f.x + dir * q[0], (f.y ?? 0) + q[1]];
      return { role: f.role, j: Object.fromEntries(Object.entries(j).map(([n, q]) => [n, world(q)])), extras: extras.map((e) => ({ kind: e.kind, pts: e.pts.map(world) })), prop: st.prop, flip: !!f.flip, scale: k };
    });
  }
  return prev;
}

export const DEFAULT_COLORS: Record<string, string> = {
  wife: "#d6457a",
  husband: "#3b7dd8",
  patron: "#e0932b",
};
const OTHER = "#8a8f98";
const W = 240;
const H = 170;
const FLOOR = 138;
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function drawFigure(f: Solved, color: string): string {
  const at = ([x, y]: P): string => `${(W / 2 + x).toFixed(1)},${(FLOOR - y).toFixed(1)}`;
  const w = 5.5 * f.scale;
  const line = (pts: P[], opacity = 1, width = w, stroke = color) =>
    `<polyline points="${pts.map(at).join(" ")}" fill="none" stroke="${stroke}" stroke-width="${width.toFixed(1)}" stroke-linecap="round" stroke-linejoin="round" opacity="${opacity}"/>`;
  const j = f.j as Record<string, P>;
  const out: string[] = [];
  if (f.prop === "seat") {
    const sx = W / 2 + j.pelvis![0];
    const sy = FLOOR - j.pelvis![1];
    out.push(`<rect x="${sx - 14}" y="${sy + 4}" width="28" height="${Math.max(4, FLOOR - sy - 4)}" rx="3" fill="currentColor" opacity="0.14"/>`);
  }
  if (f.prop === "bed") {
    const xs = Object.values(j).map((q) => q[0]);
    const x0 = W / 2 + Math.min(...xs) - 6;
    out.push(`<rect x="${x0.toFixed(1)}" y="${FLOOR - 1}" width="${(Math.max(...xs) - Math.min(...xs) + 12).toFixed(1)}" height="7" rx="3" fill="currentColor" opacity="0.14"/>`);
  }
  // far limbs first, a bit faded, so the near ones read on top
  out.push(line([j.hipL!, j.kneeL!, j.footL!], 0.5));
  out.push(line([j.shoulderL!, j.elbowL!, j.handL!], 0.5));
  out.push(line([j.neck!, j.pelvis!]));
  for (const e of f.extras) if (e.kind === "penis") out.push(line(e.pts, 0.95, w * 0.75, color) + line(e.pts, 0.55, w * 0.3, "#fff"));
  out.push(line([j.hipR!, j.kneeR!, j.footR!]));
  out.push(line([j.shoulderR!, j.elbowR!, j.handR!]));
  for (const e of f.extras) if (e.kind === "toy") out.push(line(e.pts, 1, w * 0.7, "#8b5cf6"));
  const [hx, hy] = at(j.head!).split(",");
  out.push(`<circle cx="${hx}" cy="${hy}" r="${(LEN.head * f.scale * 1.25).toFixed(1)}" fill="${color}"/>`);
  return out.join("");
}

/** Draws a scene layout as a standalone SVG string. Uses currentColor for neutral parts, so it follows the page theme. */
export function renderSchematic(figures: Figure[], opts: SchematicOptions = {}): string {
  const colors = { ...DEFAULT_COLORS, ...opts.colors };
  const body = solve(figures).map((f) => drawFigure(f, colors[f.role] ?? OTHER)).join("");
  const roles = [...new Set(figures.map((f) => f.role))];
  const legend = roles
    .map((r, i) => {
      const x = W - 8;
      const y = 14 + i * 13;
      return `<circle cx="${x - 3}" cy="${y - 3.5}" r="4" fill="${colors[r] ?? OTHER}"/><text x="${x - 11}" y="${y}" text-anchor="end" font-size="9.5" fill="currentColor" opacity="0.75">${esc(opts.legend?.[r] ?? r)}</text>`;
    })
    .join("");
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" role="img" font-family="system-ui, sans-serif">` +
    `<rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="8" fill="currentColor" opacity="0.05"/>` +
    `<line x1="14" y1="${FLOOR + 3}" x2="${W - 14}" y2="${FLOOR + 3}" stroke="currentColor" stroke-width="1.5" opacity="0.25"/>` +
    body +
    (opts.title ? `<text x="10" y="17" font-size="11.5" font-weight="600" fill="currentColor">${esc(opts.title)}</text>` : "") +
    (opts.subtitle ? `<text x="10" y="${H - 9}" font-size="9.5" fill="currentColor" opacity="0.7">${esc(opts.subtitle)}</text>` : "") +
    legend +
    `</svg>`
  );
}

export const POSE_NAMES = Object.keys(STANCES) as Pose[];

// ---------------------------------------------------------------------------------------------
// Export for image generation. The same layout that draws the mannequins can drive ControlNet:
// an OpenPose skeleton per figure (who is where, in which pose) and a box per figure
// (which part of the picture belongs to whom, for regional prompts). Roles never get swapped,
// because the generator is told the geometry instead of guessing it from text.

export interface PoseFigure {
  role: string;
  /** 18 COCO keypoints [x, y] in pixels, null where the mannequin has no such joint. */
  keypoints: (P | null)[];
  /** Bounding box in pixels, padded: [x, y, width, height]. */
  box: [number, number, number, number];
  /** Not bones: what he has and what she holds, as a few points along it, in pixels. */
  extras: { kind: "penis" | "toy"; pts: P[] }[];
}

export function toOpenPose(figures: Figure[], width = 832, height = 1216): PoseFigure[] {
  // one scale for both axes (no stretching): the widest layouts (three figures) are about 200 units across, the tallest figure about 110
  const s = Math.min(width / 215, height / 135);
  const px = ([x, y]: P): P => [Math.round(width / 2 + x * s), Math.round(height * 0.88 - y * s)];
  return solve(figures).map((f) => {
    const j = f.j as Record<string, P>;
    const dir = f.flip ? -1 : 1;
    const nose: P = [j.head![0] + dir * 4 * f.scale, j.head![1]];
    const eye: P = [j.head![0] + dir * 2.5 * f.scale, j.head![1] + 2.5 * f.scale];
    const ear: P = [j.head![0] - dir * 2 * f.scale, j.head![1] + 1 * f.scale];
    // near side = "right" limbs, far side = "left": the mannequin is a profile figure, so only the near eye and ear exist
    const k: (P | null)[] = [nose, j.neck!, j.shoulderR!, j.elbowR!, j.handR!, j.shoulderL!, j.elbowL!, j.handL!, j.hipR!, j.kneeR!, j.footR!, j.hipL!, j.kneeL!, j.footL!, eye, null, ear, null].map((q) => (q ? px(q) : null));
    const pts = k.filter((q): q is P => q !== null);
    const pad = width * 0.06;
    const x0 = Math.max(0, Math.min(...pts.map((q) => q[0])) - pad);
    const y0 = Math.max(0, Math.min(...pts.map((q) => q[1])) - pad * 1.3);
    const x1 = Math.min(width, Math.max(...pts.map((q) => q[0])) + pad);
    const y1 = Math.min(height, Math.max(...pts.map((q) => q[1])) + pad);
    return { role: f.role, keypoints: k, box: [Math.round(x0), Math.round(y0), Math.round(x1 - x0), Math.round(y1 - y0)], extras: f.extras.map((e) => ({ kind: e.kind, pts: e.pts.map(px) })) };
  });
}

// limb pairs and the colours the OpenPose preprocessor draws them with
const LIMBS: [number, number, string][] = [
  [1, 2, "#ff0000"], [1, 5, "#ff5500"], [2, 3, "#ffaa00"], [3, 4, "#ffff00"], [5, 6, "#aaff00"], [6, 7, "#55ff00"],
  [1, 8, "#00ff00"], [8, 9, "#00ff55"], [9, 10, "#00ffaa"], [1, 11, "#00ffff"], [11, 12, "#00aaff"], [12, 13, "#0055ff"], [1, 0, "#0000ff"],
  [0, 14, "#ff00ff"], [14, 16, "#aa00ff"],
];

/** The skeletons as an image a pose ControlNet takes as is: coloured limbs on black. */
export function renderOpenPose(figures: Figure[], width = 832, height = 1216): string {
  const stroke = Math.max(4, Math.round(width / 110));
  const parts = toOpenPose(figures, width, height).map(({ keypoints: k }) => {
    const limbs = LIMBS.map(([a, b, c]) => (k[a] && k[b] ? `<line x1="${k[a]![0]}" y1="${k[a]![1]}" x2="${k[b]![0]}" y2="${k[b]![1]}" stroke="${c}" stroke-width="${stroke}" stroke-linecap="round" opacity="0.75"/>` : "")).join("");
    const dots = k.map((p, i) => (p ? `<circle cx="${p[0]}" cy="${p[1]}" r="${stroke * 0.7}" fill="${LIMBS[Math.min(i, LIMBS.length - 1)]![2]}"/>` : "")).join("");
    return limbs + dots;
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}"><rect width="100%" height="100%" fill="#000"/>${parts.join("")}</svg>`;
}

/** One white-on-black mask per figure: the area of the picture that belongs to that role. */
export function renderMask(figure: PoseFigure, width = 832, height = 1216): string {
  const [x, y, w, h] = figure.box;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}"><rect width="100%" height="100%" fill="#000"/><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${Math.round(w * 0.12)}" fill="#fff"/></svg>`;
}
