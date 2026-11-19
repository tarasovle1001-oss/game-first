// Guests do not sit still all evening: the toilet, a word at the bar, a call on the stairs, a look into the small hall.
// It changes nothing by itself, but the hall is no longer a room where everybody is always in view.
import type { ModApi } from "@tc/core";
import { content } from "../content";
import { bs, HUSBAND } from "../state";
import { HALL, husbandSees } from "./places";

const Ro = content.floor.roam;
const ORDER_EVERY = content.balance.shift.orderEveryMinutes;

export function registerRoam(api: ModApi) {
  api.events.on("shift:minute", (ctx) => {
    const b = bs(ctx.state);
    const sh = b.shift;
    if (!sh) return;
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
    }
  });
  api.invariants.add("roam", (s) => {
    const sh = bs(s).shift;
    const lost = sh?.visits.find((v) => v.away && s.where[v.patron] !== v.away.to && s.where[v.patron] !== HALL);
    return lost ? `guest ${lost.patron} is away but neither there nor in the hall` : null;
  });
}
