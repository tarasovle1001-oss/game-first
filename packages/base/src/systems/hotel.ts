// The rooms upstairs. A guest who takes one pays for the night, comes down to the cafe in the evening,
// has a door that locks, and is still in the building when the cafe is closed and the husband is asleep.
import type { GameState, ModApi } from "@tc/core";
import { content } from "../content";
import { bs } from "../state";
import { addMoney } from "./economy";
import { generatePatron, pickReturning } from "./patrons";

const H = content.balance.hotel;
export const HOTEL_ROOMS = content.rooms.filter((r) => r.zone === "hotel" && r.tags.includes("guest")).map((r) => r.id);
/** The room this guest is staying in, if any. */
export const roomOf = (state: GameState, patron: string): string | null => Object.entries(bs(state).lodgers).find(([, l]) => l.patron === patron)?.[0] ?? null;

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
  api.invariants.add("hotel", (s) => {
    const b = bs(s);
    for (const [room, l] of Object.entries(b.lodgers)) {
      if (!HOTEL_ROOMS.includes(room)) return `lodger in an unknown room: ${room}`;
      if (l.nights <= 0) return `lodger with no nights left in ${room}`;
    }
    return null;
  });
}
