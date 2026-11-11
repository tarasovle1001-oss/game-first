// Phones: numbers exchanged with guests, texts during the day, calls, and the accidental call.
// Messages are data in state (keys, not text). Mods add their own with sendMessage() and listen to phone:* events.
import type { Ctx, ModApi, Params } from "@tc/core";
import { content } from "../content";
import { bs, clamp, HUSBAND, WIFE } from "../state";
import type { Patron } from "../state";
import { actById, isIntimate } from "./encounters";
import { changeHeroine } from "./heroine";
import { husbandSees } from "./places";

export const PHONE_PEEK = "base/phone-peek";
export const CALL_WIFE = "base/call-wife";
const P = content.phone;
const THREAD_LIMIT = 30;

export interface Message {
  day: number;
  minute: number;
  from: string; // "wife", "husband" or a patron id
  to: string;
  key: string; // translation key
  params?: Params;
  heat: number; // 0 = innocent ... 3 = leaves no doubt
  seen: boolean; // the husband has read it
}

export interface PhoneState {
  threads: Record<string, Message[]>; // her threads, by the other side: "husband" or a patron id
  expected: string[]; // guests who wrote that they are coming tonight
  peekedDay: number;
  calledTick: number; // last shift tick he called her at, -1 = not tonight
}

export const newPhone = (): PhoneState => ({ threads: {}, expected: [], peekedDay: 0, calledTick: -1 });

/** Adds a message to her phone. `other` is who she is talking to. */
export function sendMessage(ctx: Ctx, other: string, msg: Omit<Message, "day" | "minute" | "seen"> & { seen?: boolean }) {
  const b = bs(ctx.state);
  const thread = (b.phone.threads[other] ??= []);
  const full: Message = { day: ctx.state.time.day, minute: ctx.state.time.minute, seen: other === HUSBAND || b.mode === "open", ...msg };
  thread.push(full);
  if (thread.length > THREAD_LIMIT) thread.shift();
  ctx.emit("phone:message", { other, key: msg.key, heat: msg.heat });
}

/** What a guest writes depends on how far things have gone between them. */
function dailyText(ctx: Ctx, p: Patron) {
  const tier = p.memory.tier;
  const heat = tier >= 5 ? 3 : tier >= 3 ? 2 : 1;
  const pick = (keys: string[]) => ctx.rng.pick(keys);
  const his = heat === 3 ? pick(["sms.him.hot.1", "sms.him.hot.2", "sms.him.hot.3"]) : heat === 2 ? pick(["sms.him.warm.1", "sms.him.warm.2"]) : pick(["sms.him.mild.1", "sms.him.mild.2"]);
  sendMessage(ctx, p.id, { from: p.id, to: WIFE, key: his, heat });
  // she answers if she likes him; warmly if she likes him a lot
  if (p.memory.affinity >= P.replyAffinity) {
    const warm = p.memory.affinity >= P.replyAffinity * 2;
    const hers = warm ? (heat === 3 ? "sms.her.hot" : "sms.her.warm") : "sms.her.polite";
    sendMessage(ctx, p.id, { from: WIFE, to: p.id, key: hers, heat: warm ? heat : 1 });
    p.memory.interest = clamp(p.memory.interest + (warm ? 3 : 1));
  }
  if (ctx.rng.chance(P.comingTonightChance)) {
    sendMessage(ctx, p.id, { from: p.id, to: WIFE, key: "sms.him.tonight", heat: 1 });
    bs(ctx.state).phone.expected.push(p.id);
  }
}

export function registerPhone(api: ModApi) {
  // A guest she has gone some way with asks for her number on his way out.
  api.events.on("patron:left", (ctx, e) => {
    const b = bs(ctx.state);
    const p = b.patrons[e.payload!.id as string];
    if (!p || p.memory.hasNumber || e.payload!.reason !== "done") return;
    if (p.memory.tier >= P.numberAtTier && p.memory.affinity >= P.numberAffinity) {
      p.memory.hasNumber = true;
      ctx.log("log.phone.number", { name: `@name:${p.name}` }, husbandSees(ctx.state, "cafe.hall") || b.mode === "open" ? undefined : ["unseen"]);
      ctx.emit("phone:number", { patron: p.id });
    }
  });

  // During the day the ones who have her number write to her.
  api.events.on("phase:enter", (ctx, e) => {
    const b = bs(ctx.state);
    if (e.payload!.phase === "prep") {
      b.phone.expected = [];
      b.phone.calledTick = -1;
      const writers = Object.values(b.patrons)
        .filter((p) => p.memory.hasNumber)
        .sort((a, c) => a.id.localeCompare(c.id));
      for (const p of writers) if (ctx.rng.chance(P.textChance + p.memory.interest / 300)) dailyText(ctx, p);
      // once it is open she tells her husband who is coming
      if (b.mode === "open" && b.phone.expected.length > 0)
        sendMessage(ctx, HUSBAND, { from: WIFE, to: HUSBAND, key: "sms.wife.guest_tonight", params: { name: `@name:${b.patrons[b.phone.expected[0]!]!.name}` }, heat: 2 });
    }
  });

  // Her phone lies on the table while she is busy: he can look.
  api.actions.register({
    id: PHONE_PEEK,
    labelKey: "action.phone.peek",
    enumerate(state) {
      const b = bs(state);
      const unread = Object.entries(b.phone.threads).some(([other, t]) => other !== HUSBAND && t.some((m) => !m.seen));
      return state.time.phase === "prep" && b.mode === "hidden" && b.phone.peekedDay !== state.time.day && unread ? [{ type: PHONE_PEEK }] : [];
    },
    apply(ctx) {
      const b = bs(ctx.state);
      b.phone.peekedDay = ctx.state.time.day;
      let worst = 0;
      let count = 0;
      for (const [other, thread] of Object.entries(b.phone.threads)) {
        if (other === HUSBAND) continue;
        for (const m of thread)
          if (!m.seen) {
            m.seen = true;
            count += 1;
            worst = Math.max(worst, m.heat);
          }
      }
      const factor = content.secrecy.styleFactor[b.husband.style];
      if (worst >= 3) {
        // no reading that any other way: he knows now, she does not know that he does
        b.secretKnows = true;
        b.suspicion = 100;
        ctx.log("log.phone.peek.proof", { count });
      } else {
        b.suspicion = clamp(b.suspicion + (worst === 2 ? P.peekWarm : P.peekMild) * factor);
        ctx.log(worst === 2 ? "log.phone.peek.warm" : "log.phone.peek.mild", { count });
      }
      // she may catch him at it
      if (ctx.rng.chance(P.peekNoticedChance)) {
        b.heroine.marriage.resent = clamp(b.heroine.marriage.resent + 5);
        changeHeroine(ctx, "mood", -4, "phone");
        ctx.log("log.phone.peek.noticed");
      }
      ctx.emit("phone:peeked", { worst, count });
    },
  });

  // He calls her from another room during the shift.
  api.actions.register({
    id: CALL_WIFE,
    labelKey: "action.phone.call",
    enumerate(state) {
      const b = bs(state);
      const sh = b.shift;
      if (state.time.phase !== "shift" || !sh || b.caught) return [];
      if (state.where[HUSBAND] === state.where[WIFE] || sh.tick - b.phone.calledTick < 3) return [];
      return [{ type: CALL_WIFE }];
    },
    apply(ctx) {
      const b = bs(ctx.state);
      const enc = b.encounter;
      b.phone.calledTick = b.shift!.tick;
      const busy = enc && isIntimate(actById(enc.act));
      const factor = content.secrecy.styleFactor[b.husband.style];
      if (!busy) {
        ctx.log("log.phone.call.normal");
      } else if (b.mode === "open") {
        ctx.log("log.phone.call.open", { name: `@name:${b.patrons[enc.patron]!.name}` });
        b.power = clamp(b.power + 2);
      } else if (b.heroine.traits.honesty >= 60) {
        // she cannot lie on the spot: she lets it ring
        b.suspicion = clamp(b.suspicion + P.callIgnored * factor);
        ctx.log("log.phone.call.ignored");
      } else {
        b.suspicion = clamp(b.suspicion + P.callBreathless * factor);
        b.heroine.traits.honesty = clamp(b.heroine.traits.honesty - 1);
        ctx.log("log.phone.call.breathless");
      }
      ctx.emit("phone:call", { from: HUSBAND, busy: Boolean(busy) });
    },
  });

  // The accidental call: in the middle of it her phone dials him.
  api.events.on("encounter:started", (ctx, e) => {
    const b = bs(ctx.state);
    const { intimate, witnessed, patron } = e.payload as { intimate: boolean; witnessed: boolean; patron: string };
    if (!intimate || witnessed || b.mode !== "hidden") return;
    if (!ctx.rng.chance(P.buttDialChance)) return;
    const style = b.husband.style;
    b.suspicion = clamp(b.suspicion + P.buttDial * content.secrecy.styleFactor[style]);
    ctx.log(`log.phone.buttdial.${style}`);
    if (b.shift) b.shift.interrupt = true;
    ctx.emit("phone:buttdial", { patron });
  });

  // A man who wrote that he is coming does come, early in the evening.
  api.events.on("shift:tick", (ctx, e) => {
    const b = bs(ctx.state);
    const sh = b.shift;
    if (!sh || (e.payload!.tick as number) !== P.expectedArrivesAtTick) return;
    for (const id of b.phone.expected) {
      const p = b.patrons[id];
      if (!p || sh.visits.some((v) => v.patron === id) || sh.visits.length >= content.balance.shift.seats) continue;
      ctx.emit("base:invite-arrives", { id });
    }
  });

  api.invariants.add("phone-consistent", (s) => {
    const b = bs(s);
    for (const [other, thread] of Object.entries(b.phone.threads)) {
      if (thread.length > THREAD_LIMIT) return `thread with ${other} is too long`;
      for (const m of thread) if (m.heat < 0 || m.heat > 3) return `message heat out of range in thread with ${other}`;
    }
    return null;
  });
}
