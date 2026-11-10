import type { Rng } from "./types";

/** mulberry32 step: returns [value in [0,1), next state]. Pure. */
export function rngStep(s: number): [number, number] {
  const next = (s + 0x6d2b79f5) | 0;
  let t = next;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return [((t ^ (t >>> 14)) >>> 0) / 4294967296, next];
}

/** Rng bound to a holder with a numeric `rng` field (the state draft). */
export function makeRng(holder: { rng: number }): Rng {
  const float = () => {
    const [v, next] = rngStep(holder.rng);
    holder.rng = next;
    return v;
  };
  const int = (min: number, max: number) => min + Math.floor(float() * (max - min + 1));
  return {
    float,
    int,
    chance: (p) => float() < p,
    pick(items) {
      if (items.length === 0) throw new Error("rng.pick: empty list");
      return items[int(0, items.length - 1)]!;
    },
    weighted(items) {
      const total = items.reduce((a, x) => a + Math.max(0, x.weight), 0);
      if (total <= 0) throw new Error("rng.weighted: no positive weights");
      let roll = float() * total;
      for (const x of items) {
        roll -= Math.max(0, x.weight);
        if (roll < 0) return x.item;
      }
      return items[items.length - 1]!.item;
    },
  };
}
