// Firsts. The things neither of them forgets, kept as a short dated list.
// What the husband was not there for is kept too, but tagged: only the transparent view shows it.
import type { Ctx, ModApi } from "@tc/core";
import { bs } from "../state";
import { actById } from "./encounters";

const LIMIT = 40;
export function remember(ctx: Ctx, id: string, key: string, params: Record<string, string | number> | undefined, seen: boolean) {
  const b = bs(ctx.state);
  if (b.memories.some((m) => m.id === id)) return;
  b.memories.push({ id, day: ctx.state.time.day, key, ...(params ? { params } : {}), seen });
  if (b.memories.length > LIMIT) b.memories.shift();
}

export function registerMemories(api: ModApi) {
  api.events.on("encounter:started", (ctx, e) => {
    const b = bs(ctx.state);
    const { patron, act, witnessed, verdict } = e.payload as { patron: string; act: string; witnessed: boolean; verdict: string };
    const p = b.patrons[patron];
    if (!p || verdict === "refuse" || actById(act).tier < 3) return;
    remember(ctx, `first.${act}`, "memory.first", { act: `act.${act}`, name: `@name:${p.name}` }, witnessed || b.mode === "open");
  });
  api.events.on("encounter:came", (ctx, e) => {
    const b = bs(ctx.state);
    const p = b.patrons[e.payload!.patron as string];
    if (p) remember(ctx, "first.came", "memory.came", { name: `@name:${p.name}` }, e.payload!.witnessed === true || b.mode === "open");
  });
  api.events.on("caught:resolved", (ctx, e) => remember(ctx, "caught", `memory.caught.${e.payload!.choice}`, undefined, true));
  api.events.on("night:slipped_out", (ctx, e) => remember(ctx, "slipped", "memory.slipped", { name: `@name:${bs(ctx.state).patrons[e.payload!.patron as string]?.name ?? ""}` }, e.payload!.noticed === true));
  api.events.on("her:gigolo", (ctx) => remember(ctx, "gigolo", "memory.gigolo", undefined, bs(ctx.state).mode === "open"));
  api.events.on("her:afternoon", (ctx, e) => remember(ctx, "afternoon", "memory.afternoon", { name: `@name:${bs(ctx.state).patrons[e.payload!.patron as string]?.name ?? ""}` }, bs(ctx.state).mode === "open"));
  api.events.on("her:bought", (ctx, e) => {
    if (e.payload!.kind === "toy") remember(ctx, "toy", "memory.toy", undefined, bs(ctx.state).mode === "open");
  });
  api.events.on("bed:ended", (ctx, e) => {
    const { act, came, outcome } = e.payload as { act: string; came: boolean; outcome: string };
    if (came) remember(ctx, "with_husband", "memory.husband.came", undefined, true);
    if (act === "pegging") remember(ctx, "pegging", "memory.pegging", undefined, true);
    if (outcome === "faked") remember(ctx, "faked", "memory.faked", undefined, false);
  });
  api.events.on("couple:heard", (ctx, e) => remember(ctx, `talk.${ctx.state.time.day}`, `memory.talk.${e.payload!.how}`, undefined, true));
}
