// What the town says about her. Things done on the floor in front of other guests get talked about;
// talk brings a certain kind of man through the door, and sooner or later it reaches her husband.
import type { ModApi } from "@tc/core";
import { content } from "../content";
import { bs, clamp } from "../state";
import { HALL } from "./places";

const G = content.secrecy.gossip;

export function registerGossip(api: ModApi) {
  api.events.on("encounter:started", (ctx, e) => {
    const b = bs(ctx.state);
    const { loc, tier, patron } = e.payload as { loc: string; tier: number; patron: string };
    const others = (b.shift?.visits.filter((v) => v.patron !== patron).length ?? 0);
    if (loc !== HALL || tier < G.fromTier || others === 0) return;
    b.gossip = clamp(b.gossip + (tier - G.fromTier + 1) * G.perTier * Math.min(3, others));
  });
  // A man who has had her talks, too: less than a room full of witnesses, but he does.
  api.events.on("encounter:ended", (ctx, e) => {
    const b = bs(ctx.state);
    const p = b.patrons[e.payload!.patron as string];
    if (p && p.memory.tier >= 5 && p.traits.honesty < 45) b.gossip = clamp(b.gossip + G.braggart);
  });
  // The guests who walk in have heard things.
  api.events.on("patron:arrived", (ctx, e) => {
    const b = bs(ctx.state);
    const p = b.patrons[e.payload!.id as string];
    if (p && !e.payload!.returning && b.gossip >= G.noticeFrom) p.memory.interest = clamp(p.memory.interest + b.gossip * G.interest);
  });
  api.events.on("day:end", (ctx) => {
    const b = bs(ctx.state);
    // while he does not know, there is a chance somebody lets him know
    if (b.mode === "hidden" && b.gossip >= G.noticeFrom && ctx.rng.chance(b.gossip * G.reachesHusband)) {
      b.suspicion = clamp(b.suspicion + G.suspicion * content.secrecy.styleFactor[b.husband.style]);
      ctx.log(`log.gossip.reaches.${ctx.rng.int(1, 3)}`);
    }
    b.gossip = Math.max(0, b.gossip - G.fadePerDay);
  });
  api.invariants.add("gossip", (s) => (bs(s).gossip >= 0 && bs(s).gossip <= 100 ? null : `gossip out of range: ${bs(s).gossip}`));
}
