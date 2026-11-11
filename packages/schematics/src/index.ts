// Schematic scene pictures: mannequins made of lines, one colour per role.
// Pure string output (SVG), no DOM. The game is fully playable on these until image packs exist,
// and they show at a glance what scene the core thinks is going on.

export type Pose = "stand" | "sit" | "kneel" | "lie_back" | "lie_front" | "bend" | "all_fours" | "straddle";

export interface Figure {
  role: string;
  pose: Pose;
  x: number; // offset from the centre
  y?: number; // lift above the floor
  flip?: boolean; // true = faces left
}

export interface SchematicOptions {
  title?: string; // scene name
  subtitle?: string; // room
  legend?: Record<string, string>; // role -> label
  colors?: Record<string, string>;
}

type P = [number, number];
interface Joints {
  head: P;
  neck: P;
  hip: P;
  knee: P;
  foot: P;
  elbow: P;
  hand: P;
  prop?: "seat" | "bed"; // furniture hint under the figure
}

// Local coordinates: x to the right (the figure faces right), y up from the floor. Height is about 95.
const POSES: Record<Pose, Joints> = {
  stand: { head: [0, 90], neck: [0, 78], hip: [0, 44], knee: [1, 22], foot: [0, 0], elbow: [5, 60], hand: [9, 44] },
  sit: { head: [0, 74], neck: [0, 62], hip: [-2, 28], knee: [20, 28], foot: [22, 0], elbow: [8, 46], hand: [18, 38], prop: "seat" },
  kneel: { head: [6, 68], neck: [4, 56], hip: [0, 24], knee: [14, 0], foot: [-14, 0], elbow: [14, 42], hand: [24, 38] },
  lie_back: { head: [-44, 12], neck: [-33, 11], hip: [6, 8], knee: [26, 26], foot: [40, 4], elbow: [-14, 5], hand: [2, 4], prop: "bed" },
  lie_front: { head: [-44, 12], neck: [-33, 9], hip: [6, 7], knee: [26, 5], foot: [44, 6], elbow: [-30, 0], hand: [-44, 0], prop: "bed" },
  bend: { head: [38, 50], neck: [28, 50], hip: [0, 44], knee: [1, 22], foot: [0, 0], elbow: [32, 34], hand: [36, 20] },
  all_fours: { head: [32, 34], neck: [20, 30], hip: [-14, 28], knee: [-12, 0], foot: [-34, 0], elbow: [20, 14], hand: [20, 0] },
  straddle: { head: [0, 70], neck: [0, 58], hip: [0, 24], knee: [18, 12], foot: [6, 0], elbow: [10, 42], hand: [16, 28] },
};

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

function drawFigure(f: Figure, color: string): string {
  const j = POSES[f.pose];
  const dir = f.flip ? -1 : 1;
  const at = ([x, y]: P, dx = 0): string => `${(W / 2 + f.x + dir * (x + dx)).toFixed(1)},${(FLOOR - (f.y ?? 0) - y).toFixed(1)}`;
  const line = (pts: string[], opacity = 1) =>
    `<polyline points="${pts.join(" ")}" fill="none" stroke="${color}" stroke-width="6" stroke-linecap="round" stroke-linejoin="round" opacity="${opacity}"/>`;
  const [hx, hy] = at(j.head).split(",");
  const out: string[] = [];
  if (j.prop === "seat") {
    const [sx, sy] = at(j.hip).split(",").map(Number) as [number, number];
    out.push(`<rect x="${sx - 14}" y="${sy + 4}" width="28" height="${Math.max(4, FLOOR - sy - 4)}" rx="3" fill="currentColor" opacity="0.14"/>`);
  }
  if (j.prop === "bed") {
    const cx = W / 2 + f.x;
    out.push(`<rect x="${cx - 56}" y="${FLOOR - (f.y ?? 0) - 2}" width="112" height="8" rx="3" fill="currentColor" opacity="0.14"/>`);
  }
  // far limbs first, a bit faded, so the near ones read on top
  out.push(line([at(j.hip), at(j.knee, 5), at(j.foot, 6)], 0.5));
  out.push(line([at(j.neck), at(j.elbow, -5), at(j.hand, -4)], 0.5));
  out.push(line([at(j.neck), at(j.hip)]));
  out.push(line([at(j.hip), at(j.knee), at(j.foot)]));
  out.push(line([at(j.neck), at(j.elbow), at(j.hand)]));
  out.push(`<circle cx="${hx}" cy="${hy}" r="9" fill="${color}"/>`);
  return out.join("");
}

/** Draws a scene layout as a standalone SVG string. Uses currentColor for neutral parts, so it follows the page theme. */
export function renderSchematic(figures: Figure[], opts: SchematicOptions = {}): string {
  const colors = { ...DEFAULT_COLORS, ...opts.colors };
  const body = figures.map((f) => drawFigure(f, colors[f.role] ?? OTHER)).join("");
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

export const POSE_NAMES = Object.keys(POSES) as Pose[];

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
}

/** Pixel positions of the mannequin joints on a canvas of the given size (same framing as the schematic). */
function placed(f: Figure, width: number, height: number) {
  const j = POSES[f.pose];
  const dir = f.flip ? -1 : 1;
  // one scale for both axes (no stretching): the widest layouts (three figures) are about 170 units across
  const s = Math.min(width / 175, height / 125);
  const at = ([x, y]: P, dx = 0): P => [width / 2 + (f.x + dir * (x + dx)) * s, height * 0.86 - ((f.y ?? 0) + y) * s];
  return { j, at };
}

export function toOpenPose(figures: Figure[], width = 832, height = 1216): PoseFigure[] {
  return figures.map((f) => {
    const { j, at } = placed(f, width, height);
    const mid = (a: P, b: P, t = 0.5): P => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    const neck = at(j.neck);
    const head = at(j.head);
    // near side = "right" limbs, far side = "left": the mannequin is a profile figure
    const k: (P | null)[] = [
      head, // 0 nose
      neck, // 1 neck
      mid(neck, at(j.elbow), 0.12), // 2 r shoulder
      at(j.elbow), // 3 r elbow
      at(j.hand), // 4 r wrist
      mid(neck, at(j.elbow, -5), 0.12), // 5 l shoulder
      at(j.elbow, -5), // 6 l elbow
      at(j.hand, -4), // 7 l wrist
      at(j.hip), // 8 r hip
      at(j.knee), // 9 r knee
      at(j.foot), // 10 r ankle
      at(j.hip, 3), // 11 l hip
      at(j.knee, 5), // 12 l knee
      at(j.foot, 6), // 13 l ankle
      null, null, null, null, // eyes and ears: left to the model
    ];
    const pts = k.filter((p): p is P => p !== null);
    const pad = width * 0.07;
    const x0 = Math.max(0, Math.min(...pts.map((p) => p[0])) - pad);
    const y0 = Math.max(0, Math.min(...pts.map((p) => p[1])) - pad * 1.4);
    const x1 = Math.min(width, Math.max(...pts.map((p) => p[0])) + pad);
    const y1 = Math.min(height, Math.max(...pts.map((p) => p[1])) + pad);
    return { role: f.role, keypoints: k.map((p) => (p ? ([Math.round(p[0]), Math.round(p[1])] as P) : null)), box: [Math.round(x0), Math.round(y0), Math.round(x1 - x0), Math.round(y1 - y0)] };
  });
}

// limb pairs and the colours the OpenPose preprocessor draws them with
const LIMBS: [number, number, string][] = [
  [1, 2, "#ff0000"], [1, 5, "#ff5500"], [2, 3, "#ffaa00"], [3, 4, "#ffff00"], [5, 6, "#aaff00"], [6, 7, "#55ff00"],
  [1, 8, "#00ff00"], [8, 9, "#00ff55"], [9, 10, "#00ffaa"], [1, 11, "#00ffff"], [11, 12, "#00aaff"], [12, 13, "#0055ff"], [1, 0, "#0000ff"],
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
