// Guests do not sit still all evening: the toilet, a word at the bar, a call on the stairs, a look into the small hall.
// It changes nothing by itself, but the hall is no longer a room where everybody is always in view.
import type { ModApi } from "@tc/core";
import { content } from "../content";
import { bs, HUSBAND, WIFE } from "../state";
import { actById, CONSENT_FORMULA, isIntimate, verdictOf } from "./encounters";
import type { ConsentInput } from "./encounters";
import { changeHeroine } from "./heroine";
import { HALL, husbandSees } from "./places";

const Ro = content.floor.roam;
const ORDER_EVERY = content.balance.shift.orderEveryMinutes;

export function registerRoam(api: ModApi) {
  api.events.on("shift:minute", (ctx) => {
    const b = bs(ctx.state);
    const sh = b.shift;
    if (!sh) return;
    if (sh.meet && sh.tick >= sh.meet.until) {
      if (ctx.state.where[WIFE] === sh.meet.to) ctx.state.where[WIFE] = HALL;
      sh.meet = undefined;
    }
    const longest = Math.max(...Ro.places.map((p) => p.minutes[1]));
    for (const v of sh.visits) {
      if (v.away) {
        // back at his table; anything that needs him in the hall waits for that
        if (sh.tick >= v.away.until || v.stay <= 1 || b.encounter?.patron === v.patron) {
          if (ctx.state.where[v.patron] === v.away.to) ctx.state.where[v.patron] = HALL;
          v.away = undefined;
        }
        continue;
      }
      const p = b.patrons[v.patron];
      const busy = !p || p.lender || b.encounter?.patron === v.patron || b.encounter?.men?.some((m) => m.patron === v.patron) || b.deal?.patron === v.patron || sh.moment?.patron === v.patron || sh.group?.lead === v.patron;
      // only a man who has his drink and is not about to want the next one, and who is going to stay a while yet
      if (busy || v.served === 0 || v.sinceOrder > ORDER_EVERY - longest - 3 || v.stay <= longest + 2 || ctx.state.where[v.patron] !== HALL) continue;
      if (!ctx.rng.chance(Ro.chancePerMinute)) continue;
      const place = ctx.rng.weighted(Ro.places.filter((x) => x.to !== "cafe.lounge" || !sh.group).map((x) => ({ item: x, weight: x.weight })));
      v.away = { to: place.to, until: sh.tick + ctx.rng.int(place.minutes[0], place.minutes[1]) };
      const seen = ctx.state.where[HUSBAND] === HALL || husbandSees(ctx.state, HALL);
      ctx.state.where[v.patron] = place.to;
      ctx.log(`log.roam.${place.id}`, { name: `@name:${p.name}` }, seen ? ["minor"] : ["unseen", "minor"]);
      // she goes after him: out of everybody's sight for a few minutes, as far as she says yes to
      const M = Ro.meet;
      const h = b.heroine;
      if (sh.meet || (place.id !== "toilet" && place.id !== "call") || b.encounter || sh.group?.round || (sh.awayUntil ?? 0) > sh.tick || ctx.state.where[WIFE] !== HALL) continue;
      if (p.memory.interest < M.interest || p.memory.affinity < M.affinity || h.traits.openness < M.openness || h.arousal < M.arousal || !ctx.rng.chance(M.chance)) continue;
      let done: string | null = null;
      let verdict = "refuse";
      for (const id of M.ladder) {
        const res = ctx.engine.evaluate<ConsentInput>(CONSENT_FORMULA, ctx.state, { act: id, partner: p.id, loc: place.to, offer: 0, pressure: 0 });
        if (verdictOf(res.total) === "refuse") break;
        done = id;
        verdict = verdictOf(res.total);
      }
      if (!done) continue;
      const act = actById(done);
      v.away.until += M.extra;
      sh.meet = { patron: p.id, to: place.to, until: v.away.until, act: done };
      sh.awayUntil = Math.max(sh.awayUntil ?? 0, v.away.until);
      sh.wifeFreeAt = Math.max(sh.wifeFreeAt ?? 0, v.away.until);
      ctx.state.where[WIFE] = place.to;
      const there = husbandSees(ctx.state, place.to) || b.mode === "open";
      p.memory.tier = Math.max(p.memory.tier, act.tier);
      p.memory.acts[done] = (p.memory.acts[done] ?? 0) + 1;
      p.memory.interest = Math.min(100, p.memory.interest + 3 + act.tier);
      changeHeroine(ctx, "arousal", act.effects.arousal, done);
      if (b.mode === "hidden" && isIntimate(act)) b.secretActsToday += 1;
      ctx.log("log.roam.follows", { name: `@name:${p.name}` }, seen ? undefined : ["unseen"]);
      ctx.log("log.roam.met", { name: `@name:${p.name}`, act: `act.${done}` }, there ? undefined : ["unseen"]);
      ctx.emit("encounter:started", { patron: p.id, act: done, loc: place.to, verdict, witnessed: there, came: false, tier: act.tier, intimate: isIntimate(act), switched: false });
      ctx.emit("encounter:ended", { patron: p.id, act: done, loc: place.to, minutes: v.away.until - sh.tick, came: 0 });
    }
  });
  api.invariants.add("roam", (s) => {
    const sh = bs(s).shift;
    const lost = sh?.visits.find((v) => v.away && s.where[v.patron] !== v.away.to && s.where[v.patron] !== HALL);
    return lost ? `guest ${lost.patron} is away but neither there nor in the hall` : null;
  });
}
