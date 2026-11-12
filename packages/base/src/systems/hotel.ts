// The rooms upstairs. A guest who takes one pays for the night, comes down to the cafe in the evening,
// has a door that locks, and is still in the building when the cafe is closed and the husband is asleep.
import type { Ctx, GameState, ModApi } from "@tc/core";
import { content } from "../content";
import { bs, HUSBAND, WIFE } from "../state";
import { passNight } from "./rhythm";
import { resolveBody } from "./body";
import { addHerTips, addMoney } from "./economy";
import { CONSENT_FORMULA, isIntimate, verdictOf } from "./encounters";
import type { ConsentInput } from "./encounters";
import { changeHeroine } from "./heroine";
import { generatePatron, pickReturning } from "./patrons";

const H = content.balance.hotel;
export const HOTEL_ROOMS = content.rooms.filter((r) => r.zone === "hotel" && r.tags.includes("guest")).map((r) => r.id);
/** The room this guest is staying in, if any. */
export const roomOf = (state: GameState, patron: string): string | null => Object.entries(bs(state).lodgers).find(([, l]) => l.patron === patron)?.[0] ?? null;

/** She goes up to a lodger's room alone: with towels after closing, with breakfast in the morning. How long she stays is up to her. */
function roomVisit(ctx: Ctx, kind: "towels" | "breakfast") {
    const b = bs(ctx.state);
    if (b.complaint) return;
    const entry = Object.entries(b.lodgers).find(([, l]) => (b.patrons[l.patron]?.memory.interest ?? 0) >= H.towels.interest);
    if (!entry || !ctx.rng.chance(kind === "towels" ? H.towels.chance : H.morningChance)) return;
    const [room, l] = entry;
    const p = b.patrons[l.patron]!;
    const tier = Math.max(2, Math.min(p.memory.tier + 1, H.towels.maxTier));
    const options = content.acts.filter((a) => a.tier === tier && !a.only && a.id !== "drink");
    if (options.length === 0) return;
    const act = ctx.rng.pick(options);
    const input: ConsentInput = { act: act.id, partner: p.id, loc: room, offer: 0, pressure: 0 };
    const res = ctx.engine.evaluate<ConsentInput>(CONSENT_FORMULA, ctx.state, input);
    const verdict = verdictOf(res.total);
    const open = b.mode === "open";
    b.proposals.push({ day: ctx.state.time.day, tick: -1, patron: p.id, act: act.id, loc: room, verdict, seen: open, total: res.total, rows: res.rows });
    if (b.proposals.length > 12) b.proposals.shift();
    const name = `@name:${p.name}`;
    if (verdict === "refuse") {
      ctx.log(`log.${kind}.quick`, { room: `loc.${room}` });
      return;
    }
    p.memory.tier = Math.max(p.memory.tier, act.tier);
    p.memory.acts[act.id] = (p.memory.acts[act.id] ?? 0) + 1;
    p.memory.interest = Math.min(100, p.memory.interest + act.effects.interest);
    p.memory.affinity = Math.min(100, p.memory.affinity + act.effects.affinity);
    changeHeroine(ctx, "arousal", act.effects.arousal, act.id);
    let hours = 0;
    if (isIntimate(act)) {
      const out = resolveBody(ctx, act, { size: p.size, minutes: act.minutes });
      p.memory.sizeKnown = true;
      if (out.came) p.memory.orgasms += 1;
      // it was good, and she likes him: she does not come back down. One more time for as long as he has it in him
      const T = H.towels;
      if (verdict === "eager" && (out.came || p.memory.affinity >= T.hoursAffinity) && ctx.rng.chance(T.hoursChance)) {
        hours = 1;
        for (let round = 1; round < Math.max(2, p.stamina); round++) {
          const more = content.acts.filter((a) => !a.only && isIntimate(a) && a.tier <= p.memory.tier + 1 && a.tier >= Math.min(5, p.memory.tier));
          const next = more.length ? ctx.rng.pick(more) : null;
          if (!next || verdictOf(ctx.engine.evaluate<ConsentInput>(CONSENT_FORMULA, ctx.state, { ...input, act: next.id }).total + content.consent.scene.goingBonus) === "refuse") break;
          const again = resolveBody(ctx, next, { size: p.size, minutes: next.minutes });
          p.memory.tier = Math.max(p.memory.tier, next.tier);
          p.memory.acts[next.id] = (p.memory.acts[next.id] ?? 0) + 1;
          if (again.came) p.memory.orgasms += 1;
          p.memory.affinity = Math.min(100, p.memory.affinity + 3);
          hours += 1;
        }
        changeHeroine(ctx, "energy", -T.hoursEnergy * hours, "hours upstairs");
        b.heroine.frustration = Math.max(0, b.heroine.frustration - 20);
        if (b.night) {
          b.night.asked = true; // the bed next to him stays empty: nothing is going to happen in it tonight
          b.night.wants = false;
        }
        if (open) b.power = Math.min(100, b.power + T.hoursPower);
        else b.suspicion = Math.min(100, b.suspicion + T.hoursSuspicion * hours * content.secrecy.styleFactor[b.husband.style]);
      }
    }
    const tip = Math.round((act.tip * p.traits.generosity) / 50);
    if (tip > 0) addHerTips(ctx, tip);
    if (!open) b.secretActsToday += 1;
    if (hours > 0) {
      ctx.log(open ? `log.${kind}.hours.open` : `log.${kind}.hours`, { room: `loc.${room}`, name, hours });
      if (!open) ctx.log(`log.${kind}.hours.truth`, { name, hours }, ["unseen"]);
    } else {
      ctx.log(open ? `log.${kind}.open` : `log.${kind}.long`, { room: `loc.${room}`, name, act: `act.${act.id}` });
      if (!open) ctx.log(`log.${kind}.truth`, { name, act: `act.${act.id}` }, ["unseen"]);
    }
    ctx.emit("hotel:towels", { patron: p.id, act: act.id, hours, kind });
}

export const SEND_UP = "base/send-up";
export function registerHotel(api: ModApi) {
  api.events.on("shift:start", (ctx) => {
    const b = bs(ctx.state);
    const taken = Object.values(b.lodgers).map((l) => l.patron);
    for (const room of HOTEL_ROOMS) {
      if (b.lodgers[room]) continue;
      if (!ctx.rng.chance(H.takeChance * (0.5 + b.reputation / 100))) continue;
      const p = (ctx.rng.chance(H.returningChance) ? pickReturning(ctx, taken) : null) ?? generatePatron(ctx);
      if (taken.includes(p.id)) continue;
      const nights = ctx.rng.int(H.nights[0], H.nights[1]);
      b.lodgers[room] = { patron: p.id, nights };
      taken.push(p.id);
      ctx.log("log.hotel.checks_in", { name: `@name:${p.name}`, room: `loc.${room}`, nights });
    }
  });
  // They come down for the evening.
  api.events.on("shift:tick", (ctx, e) => {
    if ((e.payload!.tick as number) !== H.comesDownAtTick) return;
    for (const l of Object.values(bs(ctx.state).lodgers)) ctx.emit("base:invite-arrives", { id: l.patron });
  });
  // At night, with a lodger behind one of the doors: "go up to him". What for, he says or leaves to her.
  const LADDER = ["chat", "drink", "flirt", "kiss", "grope", "handjob", "blowjob", "sex"];
  const BRIEF: Record<string, { cap: number; sent: number }> = { all: { cap: 9, sent: 18 }, limit: { cap: 4, sent: 12 }, company: { cap: 1, sent: 8 }, her_call: { cap: 9, sent: 0 } };
  api.actions.register({
    id: SEND_UP,
    labelKey: "action.send_up",
    describe: (a) => ({ key: `action.send_up.${a.payload!.brief}`, params: { name: `@name:${a.payload!.name}`, room: `loc.${a.payload!.room}` } }),
    enumerate(state) {
      const b = bs(state);
      if (state.time.phase !== "night" || !b.night || b.night.sex || b.night.herAsleep || b.complaint || b.sentUp === state.time.day) return [];
      if (state.where[HUSBAND] !== state.where[WIFE]) return [];
      const out: { type: string; payload: Record<string, string | number> }[] = [];
      for (const [room, l] of Object.entries(b.lodgers)) {
        const p = b.patrons[l.patron];
        if (p) for (const brief of Object.keys(BRIEF)) out.push({ type: SEND_UP, payload: { room, patron: p.id, name: p.name, brief } });
      }
      return out;
    },
    apply(ctx, action) {
      const b = bs(ctx.state);
      const h = b.heroine;
      const { room, patron, brief } = action.payload as { room: string; patron: string; brief: string };
      const p = b.patrons[patron]!;
      const B = BRIEF[brief]!;
      const name = `@name:${p.name}`;
      b.sentUp = ctx.state.time.day;
      // how far it goes behind that door: the furthest step she would say yes to, within what he said
      let done: string | null = null;
      let rows: { id: string; labelKey: string; value: number }[] = [];
      let total = 0;
      for (const id of LADDER) {
        const act = content.acts.find((a) => a.id === id);
        if (!act || act.tier > B.cap) continue;
        const res = ctx.engine.evaluate<ConsentInput>(CONSENT_FORMULA, ctx.state, { act: id, partner: patron, loc: room, offer: 0, pressure: 0 });
        const t = res.total + B.sent;
        if (verdictOf(t) === "refuse") break;
        done = id;
        total = t;
        rows = [...res.rows, ...(B.sent ? [{ id: "consent.sent", labelKey: "factor.consent.sent", value: B.sent }] : [])];
      }
      if (!done) {
        h.marriage.resent = Math.min(100, h.marriage.resent + 2);
        changeHeroine(ctx, "mood", -4, "sent to a stranger");
        ctx.log("log.send_up.no", { name });
        return;
      }
      const act = content.acts.find((a) => a.id === done)!;
      const stays = act.tier >= 7 && ctx.rng.chance(0.35); // sometimes she does not come back before morning
      b.proposals.push({ day: ctx.state.time.day, tick: -1, patron, act: done, loc: room, verdict: verdictOf(total), seen: false, total, rows });
      ctx.log(`log.send_up.go.${brief}`, { name });
      passNight(ctx, 20 + act.tier * 8);
      changeHeroine(ctx, "arousal", act.tier * 4, done);
      changeHeroine(ctx, "energy", -act.tier * 1.5, done);
      h.traits.openness = Math.min(100, h.traits.openness + act.tier * 0.3);
      p.memory.interest = Math.min(100, p.memory.interest + 5 + act.tier);
      p.memory.affinity = Math.min(100, p.memory.affinity + 3 + act.tier);
      b.power = Math.min(100, b.power + (act.tier >= 5 ? 2 : 0));
      // what he hears afterwards: as much of it as her honesty and her shame allow
      const shame = 100 - h.traits.openness;
      const trust = h.marriage.trust ?? 50;
      const tells = act.tier <= 2 || (brief !== "her_call" && trust >= 45 && shame < 65) ? "full" : trust >= 30 ? "less" : "nothing";
      if (stays) {
        if (b.night) b.night.herAsleep = b.night.minute ?? 0;
        ctx.state.where[WIFE] = room;
        b.stayedUp = { day: ctx.state.time.day, patron, act: done, tells };
        ctx.log("log.send_up.stays", { name }, ["unseen"]);
        ctx.log("log.send_up.alone");
      } else {
        ctx.log(`log.send_up.back.${tells}`, { name, act: `act.${tells === "less" ? (act.tier >= 5 ? "kiss" : "chat") : done}` });
        if (tells !== "full") ctx.log("log.send_up.truth", { name, act: `act.${done}` }, ["unseen"]);
      }
      ctx.emit("hotel:sent-up", { patron, act: done, brief, stays });
    },
  });
  // The morning after a night she did not come back from: the truth, or a pharmacy.
  api.events.on("phase:enter", (ctx, e) => {
    const b = bs(ctx.state);
    const s = b.stayedUp;
    if (e.payload!.phase !== "prep" || !s) return;
    b.stayedUp = undefined;
    const p = b.patrons[s.patron];
    const name = `@name:${p?.name ?? ""}`;
    ctx.log(s.tells === "full" ? "log.send_up.morning.full" : "log.send_up.morning.excuse", { name, act: `act.${s.act}` });
    if (s.tells !== "full") {
      ctx.log("log.send_up.truth", { name, act: `act.${s.act}` }, ["unseen"]);
      if (b.mode === "hidden") b.suspicion = Math.min(100, b.suspicion + 4);
    }
  });
  api.events.on("shift:end", (ctx) => {
    const b = bs(ctx.state);
    const n = Object.keys(b.lodgers).length;
    if (n === 0) return;
    b.today.income += n * H.roomPrice;
    addMoney(ctx, n * H.roomPrice, "rooms");
    ctx.log("log.hotel.paid", { money: n * H.roomPrice });
  });
  api.events.on(
    "day:end",
    (ctx) => {
      const b = bs(ctx.state);
      for (const [room, l] of Object.entries(b.lodgers)) {
        l.nights -= 1;
        const p = b.patrons[l.patron];
        if (l.nights <= 0 || !p) {
          delete b.lodgers[room];
          if (p) ctx.log("log.hotel.checks_out", { name: `@name:${p.name}` });
        }
      }
    },
    -20, // after the day's forgetting of one-time visitors
  );
  api.events.on("phase:enter", (ctx, e) => {
    if (e.payload!.phase === "night") roomVisit(ctx, "towels");
    // in the morning she may look in on whoever is still upstairs
    else if (e.payload!.phase === "prep" && ctx.state.time.day > 1) roomVisit(ctx, "breakfast");
  }, -40);
  // closing time: the floor empties, and those with a key go up
  api.events.on("shift:end", (ctx) => {
    const b = bs(ctx.state);
    const here = b.shift?.visits.map((v) => v.patron) ?? [];
    if (here.length === 0) return;
    const up = Object.values(b.lodgers).filter((l) => here.includes(l.patron)).length;
    ctx.log(up > 0 ? "log.close.rooms" : "log.close.leave", { n: here.length - up, up });
  }, 10);

  api.invariants.add("hotel", (s) => {
    const b = bs(s);
    for (const [room, l] of Object.entries(b.lodgers)) {
      if (!HOTEL_ROOMS.includes(room)) return `lodger in an unknown room: ${room}`;
      if (l.nights <= 0) return `lodger with no nights left in ${room}`;
    }
    return null;
  });
}
