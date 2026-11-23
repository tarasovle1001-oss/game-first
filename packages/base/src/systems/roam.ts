// Guests do not sit still all evening: the toilet, a word at the bar, a call on the stairs, a look into the small hall.
// It changes nothing by itself, but the hall is no longer a room where everybody is always in view.
import type { ModApi } from "@tc/core";
import { content } from "../content";
import { bs, HUSBAND, WIFE } from "../state";
import { changeHeroine } from "./heroine";
import { HALL, husbandSees } from "./places";
import { attendTo } from "./shift";
import { detail } from "./glance";
import { sizeClass } from "./body";
const SAUNA = "cafe.sauna";

const Ro = content.floor.roam;
const ORDER_EVERY = content.balance.shift.orderEveryMinutes;

export function registerRoam(api: ModApi) {
  api.events.on("shift:minute", (ctx) => {
    const b = bs(ctx.state);
    const sh = b.shift;
    if (!sh) return;
    if (sh.meet && sh.tick >= sh.meet.until) sh.meet = undefined; // where she is from here is the visit's business (attend)
    const longest = Math.max(...Ro.places.map((p) => p.minutes[1]));
    for (const v of sh.visits) {
      if (v.away) {
        // back at his table; anything that needs him in the hall waits for that
        const withHer = b.encounter?.patron === v.patron || b.encounter?.men?.some((m) => m.patron === v.patron);
        if (withHer) v.away = undefined; // he is where the scene is: it decides where he goes after
        else if (sh.tick >= v.away.until || v.stay <= 1) {
          if (ctx.state.where[v.patron] === v.away.to) ctx.state.where[v.patron] = v.at ?? HALL;
          v.away = undefined;
        }
        continue;
      }
      const p = b.patrons[v.patron];
      const busy = !p || p.lender || b.encounter?.patron === v.patron || b.encounter?.men?.some((m) => m.patron === v.patron) || b.deal?.patron === v.patron || sh.moment?.patron === v.patron || sh.group?.lead === v.patron;
      // only a man who has his drink and is not about to want the next one, and who is going to stay a while yet
      if (busy || v.served === 0 || v.sinceOrder > ORDER_EVERY - longest - 3 || v.stay <= longest + 2 || ctx.state.where[v.patron] !== HALL) continue;
      if (!ctx.rng.chance(Ro.chancePerMinute)) continue;
      const open = Ro.places.filter((x) => (x.to !== "cafe.lounge" || !sh.group) && (v.went?.[x.id] === undefined || sh.tick - v.went[x.id]! >= x.gap));
      if (open.length === 0) continue;
      const place = ctx.rng.weighted(open.map((x) => ({ item: x, weight: x.weight })));
      (v.went = v.went ?? {})[place.id] = sh.tick;
      v.away = { to: place.to, until: sh.tick + ctx.rng.int(place.minutes[0], place.minutes[1]) };
      const seen = ctx.state.where[HUSBAND] === HALL || husbandSees(ctx.state, HALL);
      ctx.state.where[v.patron] = place.to;
      ctx.log(`log.roam.${place.id}`, { name: `@name:${p.name}` }, seen ? ["minor"] : ["unseen", "minor"]);
      // a man who has his eye on her leaving the room is worth a look: the wait stops there, so that he is seen on the map while he is out
      if ((seen || b.viewAll) && p.memory.interest >= Ro.meet.interest) sh.interrupt = true;
      // she goes after him: out of everybody's sight for a few minutes. What happens there is the same evening as at a table,
      // only the two of them (he speaks up at once: that is why he went)
      const M = Ro.meet;
      const h = b.heroine;
      if ((place.id !== "toilet" && place.id !== "call") || b.encounter || sh.attend || (sh.awayUntil ?? 0) > sh.tick || ctx.state.where[WIFE] !== HALL) continue;
      if (p.memory.interest < M.interest || p.memory.affinity < M.affinity || h.traits.openness < M.openness || h.arousal < M.arousal || !ctx.rng.chance(M.chance)) continue;
      v.away.until += M.extra;
      sh.meet = { patron: p.id, to: place.to, until: v.away.until, act: "flirt" };
      attendTo(ctx, place.to, v.away.until - sh.tick, "meet", p.id);
      ctx.log("log.roam.follows", { name: `@name:${p.name}` }, seen ? undefined : ["unseen"]);
      ctx.emit("her:followed", { patron: p.id, to: place.to });
    }
    // with a sauna built, now and then a guest takes his drink in there for a while; she brings him the next one
    if (b.upgrades.includes("sauna") && sh.group?.sauna !== true && sh.tick % 10 === 0) {
      const Sa = Ro.sauna;
      for (const v of sh.visits) {
        const p = b.patrons[v.patron];
        if (!p || v.at || v.away || v.group || v.out !== undefined || v.served === 0 || v.stay < Sa.minutes[1] + 10 || ctx.state.where[v.patron] !== HALL) continue;
        if (b.encounter?.patron === v.patron || sh.attend?.patron === v.patron || !ctx.rng.chance(Sa.chance)) continue;
        v.at = SAUNA;
        v.atUntil = sh.tick + ctx.rng.int(Sa.minutes[0], Sa.minutes[1]);
        v.sinceOrder = Math.max(v.sinceOrder, ORDER_EVERY - Sa.orderAfter); // in the steam he is soon thirsty
        ctx.state.where[v.patron] = SAUNA;
        ctx.log("log.sauna.goes", { name: `@name:${p.name}` }, ["minor"]);
        break;
      }
    }
  });
  // She takes a drink into the sauna: men in towels, or in nothing. What she sees there is not nothing to her.
  api.events.on("attend:started", (ctx, e) => {
    const b = bs(ctx.state);
    if (e.payload!.loc !== SAUNA) return;
    const h = b.heroine;
    const sh = b.shift!;
    const men = sh.visits.filter((v) => ctx.state.where[v.patron] === SAUNA);
    if (men.length === 0) return;
    const bare = men.find((v) => (v.heat ?? 0) >= Ro.sauna.bareHeat || (v.drunk ?? 0) >= Ro.sauna.bareDrunk);
    const seen = husbandSees(ctx.state, SAUNA) || b.mode === "open";
    if (!bare) return;
    const p = b.patrons[bare.patron]!;
    p.memory.sizeKnown = true;
    const likes = h.traits.openness >= Ro.sauna.likeOpenness || h.latents.size_queen !== undefined || (h.tastes.types[p.type] ?? 0) > 0;
    if (likes) changeHeroine(ctx, "arousal", Ro.sauna.arousal + Math.max(0, p.size - b.husband.size), "sauna");
    else changeHeroine(ctx, "mood", -1, "sauna");
    ctx.log(likes ? "log.sauna.sees.likes" : "log.sauna.sees", { name: `@name:${p.name}` }, seen ? undefined : ["unseen"]);
    detail(ctx, { id: "bulge", who: bare.patron, tags: { size: String(sizeClass(p.size)), bare: "1" }, secret: !seen });
  });
  // a guest who had stepped out and is now with her somewhere is no longer "away": he is where the scene is
  api.events.on("encounter:started", (ctx, e) => {
    const v = bs(ctx.state).shift?.visits.find((x) => x.patron === e.payload!.patron);
    if (v?.away && bs(ctx.state).shift?.meet?.patron !== v.patron) v.away = undefined;
  });
  api.invariants.add("roam", (s) => {
    const sh = bs(s).shift;
    const lost = sh?.visits.find((v) => v.away && s.where[v.patron] !== v.away.to && s.where[v.patron] !== HALL);
    return lost ? `guest ${lost.patron} is away but neither there nor in the hall` : null;
  });
}
