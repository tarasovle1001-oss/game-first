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
