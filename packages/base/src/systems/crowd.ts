// When something goes on where others can see, it does not stay between two people. Some men come over to
// watch; one who has watched long enough wants in; the room has something to say about it. And every time a
// guest finishes, where it goes and what she makes of it is a small scene of its own.
import type { Ctx, GameState, ModApi } from "@tc/core";
import { content } from "../content";
import { bs, clamp, HUSBAND, WIFE } from "../state";
import type { Encounter, Patron } from "../state";
import { annoy } from "./annoy";
import { addHerTips, addReputation } from "./economy";
import { actById, CONSENT_FORMULA, gate, isIntimate, verdictOf } from "./encounters";
import type { ConsentInput } from "./encounters";
import { changeHeroine } from "./heroine";
import { EMOTIONS, feel, trustOf } from "./mind";
import type { Emotion } from "./mind";
import { HALL, husbandSees } from "./places";
import { cumPlaces } from "./terms";

export const CROWD = "base/crowd";
const C = content.floor.crowd;
const Fi = content.floor.finish;
const PUBLIC = new Set([HALL, "cafe.lounge", "cafe.sauna"]);
/** Which part of her an act keeps busy. */
const SLOT: Record<string, string> = { blowjob: "mouth", deepthroat: "mouth", sixty_nine: "mouth", handjob: "hand", mutual_touching: "hand", titfuck: "breasts", breast_play: "breasts", anal: "anus", sex: "pussy", riding: "pussy", standing_sex: "pussy", thigh_job: "pussy", fingering: "pussy", cunnilingus: "pussy", grinding: "pussy" };
/** What a man who joins would take, in the order he would ask. */
const JOIN_ACTS: [string, string][] = [["mouth", "blowjob"], ["hand", "handjob"], ["pussy", "sex"], ["anus", "anal"]];

type Fx = Record<string, number>;
function fx(ctx: Ctx, bag: Fx, p: Patron | null, reason: string) {
  const h = bs(ctx.state).heroine;
  for (const [k, n] of Object.entries(bag)) {
    if (k === "affinity" && p) p.memory.affinity = clamp(p.memory.affinity + n, -100, 100);
    else if (k === "annoy") annoy(ctx, n, "guests");
    else if (k === "trust") h.marriage.trust = clamp(trustOf(ctx.state) + n);
    else if (k === "resent") h.marriage.resent = clamp(h.marriage.resent + n);
    else if ((EMOTIONS as readonly string[]).includes(k)) feel(ctx, k as Emotion, n);
    else if (k === "arousal" || k === "mood") changeHeroine(ctx, k, n, reason);
  }
}
const bold = (state: GameState) => {
  const h = bs(state).heroine;
  return h.latents.exhibitionist !== undefined || h.traits.openness >= C.boldOpenness;
};
export const crowdOf = (state: GameState) => bs(state).encounter?.crowd ?? [];
export const menOf = (state: GameState) => bs(state).encounter?.men ?? [];
/** The busy parts of her right now: the act itself and everyone who joined. */
const busy = (enc: Encounter) => new Set([SLOT[enc.act] ?? "", ...(enc.men ?? []).map((m) => m.slot)]);

/** One more man asks for a part of her. Returns whether she let him. */
function tryJoin(ctx: Ctx, enc: Encounter, id: string, bonus: number): boolean {
  const b = bs(ctx.state);
  const sh = b.shift!;
  const p = b.patrons[id];
  if (!p) return false;
  const taken = busy(enc);
  const watched = sh.tick - (enc.crowdSince?.[id] ?? sh.tick);
  const tags = husbandSees(ctx.state, enc.loc) || b.mode === "open" ? undefined : ["unseen"];
  const name = `@name:${p.name}`;
  for (const [slot, act] of JOIN_ACTS) {
    if (taken.has(slot)) continue;
    const input: ConsentInput = { act, partner: id, loc: enc.loc, offer: 0, pressure: (enc.men?.length ?? 0) * C.joinPressure };
    const res = ctx.engine.evaluate<ConsentInput>(CONSENT_FORMULA, ctx.state, input);
    const total = res.total + bonus + watched * C.joinWatchBonus;
    const verdict = verdictOf(total);
    b.proposals.push({ day: ctx.state.time.day, tick: sh.tick, patron: id, act, loc: enc.loc, verdict, seen: !tags, total, rows: res.rows });
    if (b.proposals.length > 12) b.proposals.shift();
    if (verdict === "refuse") continue;
    enc.men = [...(enc.men ?? []), { patron: id, slot, act }];
    enc.crowd = (enc.crowd ?? []).filter((x) => x !== id);
    enc.pleasure = clamp(enc.pleasure * C.joinerRate);
    p.memory.tier = Math.max(p.memory.tier, actById(act).tier);
    p.memory.acts[act] = (p.memory.acts[act] ?? 0) + 1;
    p.memory.sizeKnown = true;
    p.memory.interest = clamp(p.memory.interest + 6);
    const v = sh.visits.find((x) => x.patron === id);
    if (v) v.tier = Math.max(v.tier, actById(act).tier);
    const till = addHerTips(ctx, C.joinTip);
    sh.tips += till;
    b.today.tips += till;
    changeHeroine(ctx, "arousal", 6, act);
    if (verdict === "hesitant") feel(ctx, "shame", 6);
    if (b.mode === "hidden") b.secretActsToday += 1;
    const n = 1 + enc.men.length;
    ctx.log(`log.crowd.joins.${slot}.${verdict}`, { name, n }, tags);
    // the same event one guest raises, so her diary, her feelings and her husband's reaction all see it
    ctx.emit("encounter:started", { patron: id, act, loc: enc.loc, verdict, witnessed: !tags, came: false, tier: actById(act).tier, intimate: true, switched: true, joined: true });
    ctx.emit("crowd:joined", { patron: id, slot, men: n });
    return true;
  }
  const v = sh.visits.find((x) => x.patron === id);
  if (v) v.heat = clamp((v.heat ?? 0) + C.refusedHeat);
  enc.crowd = (enc.crowd ?? []).filter((x) => x !== id);
  annoy(ctx, 4, "guests");
  ctx.log("log.crowd.join.no", { name }, tags);
  ctx.emit("crowd:refused", { patron: id });
  return false;
}

export function registerCrowd(api: ModApi) {
  // === gathering, watching, asking for more =======================================================
  api.events.on("shift:minute", (ctx) => {
    const b = bs(ctx.state);
    const sh = b.shift;
    const enc = b.encounter;
    if (!sh || !enc || b.caught) return;
    const act = actById(enc.act);
    if (act.tier < C.fromTier) return;
    const h = b.heroine;
    const open = PUBLIC.has(enc.loc);
    const seen = husbandSees(ctx.state, enc.loc) || b.mode === "open";
    const tags = seen ? undefined : ["unseen"];
    const crowd = (enc.crowd = enc.crowd ?? []);
    enc.crowdSince = enc.crowdSince ?? {};
    // men who have left do not go on watching
    const here = (id: string) => sh.visits.some((v) => v.patron === id && v.stay > 0);
    for (const id of [...crowd]) if (!here(id)) crowd.splice(crowd.indexOf(id), 1);
    // 1. one more comes over
    if (crowd.length + (enc.men?.length ?? 0) < C.max) {
      const others = sh.visits
        .filter((v) => v.stay > 0 && v.patron !== enc.patron && !crowd.includes(v.patron) && !(enc.men ?? []).some((m) => m.patron === v.patron) && b.patrons[v.patron])
        .sort((x, y) => b.patrons[y.patron]!.memory.interest + (y.heat ?? 0) - (b.patrons[x.patron]!.memory.interest + (x.heat ?? 0)) || x.patron.localeCompare(y.patron));
      const next = others[0];
      if (next) {
        const p = b.patrons[next.patron]!;
        const pull = open ? C.gatherPerMinute * (0.4 + p.memory.interest / 100 + b.gossip / 200) : isIntimate(act) ? C.privateFollow * (0.5 + (next.heat ?? 0) / 100) : 0;
        if (pull > 0 && ctx.rng.chance(Math.min(0.6, pull))) {
          crowd.push(p.id);
          enc.crowdSince[p.id] = sh.tick;
          if (crowd.length === 1) enc.reacted = sh.tick;
          ctx.log(open ? `log.crowd.gathers.${crowd.length === 1 ? "first" : "more"}` : "log.crowd.door", { name: `@name:${p.name}`, n: crowd.length }, tags);
          if (sh.interrupt !== undefined && seen) sh.interrupt = true;
        }
      }
    }
    if (crowd.length === 0) return;
    // 2. being watched
    for (const id of crowd) {
      const v = sh.visits.find((x) => x.patron === id);
      if (v) v.heat = clamp((v.heat ?? 0) + C.heatPerMinute);
    }
    if (bold(ctx.state)) changeHeroine(ctx, "arousal", (C.watcherMinute.arousalBold ?? 0) * crowd.length, "watched");
    else feel(ctx, "shame", (C.watcherMinute.shame ?? 0) * crowd.length);
    // 3. the room has something to say
    if (open && sh.tick - (enc.reacted ?? enc.startTick) >= C.reactEvery) {
      enc.reacted = sh.tick;
      const kind = crowd.length < 2 ? "one" : isIntimate(act) ? "far" : "play";
      const line = ctx.rng.int(1, kind === "one" ? 2 : 3);
      // not the same line twice in a row
      const key = `log.crowd.react.${kind}.${line === enc.lastLine ? (line % (kind === "one" ? 2 : 3)) + 1 : line}`;
      enc.lastLine = Number(key.at(-1));
      ctx.log(key, { n: crowd.length, name: `@name:${b.patrons[crowd[0]!]?.name ?? 0}` }, tags);
      // somebody did not come here for this
      const prude = sh.visits.find((v) => v.stay > 0 && !crowd.includes(v.patron) && v.patron !== enc.patron && (b.patrons[v.patron]?.memory.interest ?? 0) < 20);
      if (open && isIntimate(act) && prude && ctx.rng.chance(C.leaveChance)) {
        prude.stay = 0;
        prude.blocked = true;
        addReputation(ctx, -C.leaveReputation);
        ctx.log("log.crowd.leaves", { name: `@name:${b.patrons[prude.patron]!.name}` }, tags);
      }
    }
    // 4. one of them wants more than watching
    if (isIntimate(act) && (enc.men?.length ?? 0) < C.joinMax) {
      const ready = crowd.find((id) => sh.tick - (enc.crowdSince![id] ?? sh.tick) >= C.joinAfter && (sh.visits.find((v) => v.patron === id)?.heat ?? 0) >= C.joinHeat);
      if (ready && ctx.rng.chance(C.joinPerMinute)) tryJoin(ctx, enc, ready, 0);
    }
    void h;
  });
  // what it leaves behind: every man who watched wants her more, and the town hears of it
  api.events.on("encounter:ended", (ctx, e) => {
    const b = bs(ctx.state);
    const sh = b.shift;
    if (!sh || e.payload!.group) return;
    const last = sh.lastCrowd;
    sh.lastCrowd = undefined;
    if (!last) return;
    for (const id of last.crowd) {
      const p = b.patrons[id];
      const v = sh.visits.find((x) => x.patron === id);
      if (p) p.memory.interest = clamp(p.memory.interest + C.afterInterest);
      if (v) v.cooldownUntil = 0; // he does not wait his turn for long
    }
    b.gossip = clamp(b.gossip + (last.crowd.length + last.men.length) * C.gossipPerWatcher);
    // everyone who was on her finishes too
    for (const m of last.men) {
      ctx.emit("cum:landed", { by: m.patron, act: m.act });
      const p = b.patrons[m.patron];
      const v = sh.visits.find((x) => x.patron === m.patron);
      if (v) v.rounds += 1;
      if (p) ctx.emit("encounter:ended", { patron: m.patron, act: m.act, loc: e.payload!.loc as string, minutes: 6, came: 0, group: true });
    }
    if (last.men.length > 0) ctx.log(`log.crowd.end.${last.men.length >= 2 ? "many" : "two"}`, { n: 1 + last.men.length }, husbandSees(ctx.state, e.payload!.loc as string) || b.mode === "open" ? undefined : ["unseen"]);
  }, 30);
  api.formulas.addFactor<ConsentInput>(CONSENT_FORMULA, {
    id: "consent.crowd",
    labelKey: "factor.consent.crowd",
    order: 23,
    eval: (state, { partner }) => {
      const enc = bs(state).encounter;
      const n = enc?.crowd?.length ?? 0;
      if (!enc || n === 0 || partner === HUSBAND) return null;
      return n * (bold(state) ? (C.perWatcher.bold ?? 0) : (C.perWatcher.shy ?? 0));
    },
  });

  // === what the husband can do about it ============================================================
  api.actions.register({
    id: CROWD,
    labelKey: "action.crowd",
    describe: (a) => ({ key: `action.crowd.${a.payload!.do}`, params: { name: `@name:${(a.payload!.name as number) ?? 0}` } }),
    enumerate(state) {
      const b = bs(state);
      const enc = b.encounter;
      if (state.time.phase !== "shift" || !enc || b.caught || (enc.crowd?.length ?? 0) === 0 || state.where[HUSBAND] !== enc.loc) return [];
      const out: { type: string; payload: Record<string, string | number> }[] = [{ type: CROWD, payload: { do: "disperse" } }];
      const first = enc.crowd![0]!;
      if (b.mode === "open" && isIntimate(actById(enc.act)) && (enc.men?.length ?? 0) < C.joinMax && !enc.invited?.includes(first)) out.push({ type: CROWD, payload: { do: "invite", patron: first, name: b.patrons[first]?.name ?? 0 } });
      return out;
    },
    apply(ctx, action) {
      const b = bs(ctx.state);
      const enc = b.encounter!;
      if (action.payload!.do === "disperse") {
        for (const id of enc.crowd ?? []) if (b.patrons[id]) b.patrons[id]!.memory.affinity = clamp(b.patrons[id]!.memory.affinity + (C.dispersed.affinity ?? 0), -100, 100);
        enc.crowd = [];
        const liked = bold(ctx.state);
        fx(ctx, liked ? C.dispersedBold : C.dispersedShy, null, "husband");
        ctx.log(`log.crowd.disperse${liked ? ".sulk" : ""}`);
        ctx.emit("crowd:dispersed", { liked });
        return;
      }
      const id = action.payload!.patron as string;
      enc.invited = [...(enc.invited ?? []), id];
      ctx.log("log.crowd.invite", { name: `@name:${b.patrons[id]?.name ?? 0}` });
      tryJoin(ctx, enc, id, C.invited);
    },
  });

  // === where a guest finishes ======================================================================
  gate.finish = (ctx, v, p, enc) => {
    const b = bs(ctx.state);
    const h = b.heroine;
    const sh = b.shift!;
    const seen = husbandSees(ctx.state, enc.loc) || b.mode === "open";
    const tags = seen ? undefined : ["unseen"];
    const name = `@name:${p.name}`;
    const options = cumPlaces(ctx, content.look.marks.byAct[enc.act] ?? ["body"]);
    // a pushy man, or one who likes it that way, goes for her face when he can
    const wantsFace = (p.approach === "push" || (v.drunk ?? 0) >= 60) && options.includes("face");
    let place = wantsFace ? "face" : ctx.rng.pick(options);
    const show = (pl: string) => {
      sh.fin = { patron: p.id, place: pl, act: enc.act, loc: enc.loc, until: sh.tick + Fi.shows };
    };
    if (place === "face" || place === "mouth") {
      const glad = h.traits.openness >= (Fi.wants[place] ?? 100) || h.latents.oral_fixation !== undefined || p.memory.affinity >= Fi.likedAffinity || h.drunk >= Fi.drunk;
      if (!glad && h.traits.confidence >= Fi.holdConfidence) {
        // she pulls clear: it goes nowhere near her
        fx(ctx, Fi.held, p, "finish");
        if (p.memory.affinity < Fi.offendedAffinity && h.traits.confidence >= Fi.offendedConfidence) {
          // and from a man she cannot stand, she makes a scene of it
          v.blocked = true;
          v.stay = 0;
          b.gossip = clamp(b.gossip + 1);
          ctx.log(`log.fin.offended.${PUBLIC.has(enc.loc) ? "public" : "private"}`, { name }, tags);
          ctx.emit("finish:refused", { patron: p.id, place, offended: true });
          b.encounter = null;
          ctx.state.where[WIFE] = HALL;
          ctx.emit("encounter:ended", { patron: enc.patron, act: enc.act, loc: enc.loc, minutes: sh.tick - enc.startTick, came: enc.came });
          return true;
        }
        ctx.log(`log.fin.held.${ctx.rng.int(1, 2)}`, { name }, tags);
        show("held");
        ctx.emit("finish:refused", { patron: p.id, place, offended: false });
        return true;
      }
      if (!glad) {
        fx(ctx, Fi.unwilling, p, "finish");
        ctx.log(`log.fin.${place}.unwilling`, { name }, tags);
      } else {
        fx(ctx, Fi.glad, p, "finish");
        const swallows = place === "mouth" && (h.traits.openness >= Fi.swallowOpenness || h.latents.oral_fixation !== undefined);
        ctx.log(`log.fin.${swallows ? "swallow" : place}`, { name }, tags);
        if (swallows) place = "mouth";
      }
    } else ctx.log(`log.fin.${place}`, { name }, tags);
    show(place);
    ctx.emit("cum:landed", { by: p.id, act: enc.act, where: place });
    ctx.emit("finish:done", { patron: p.id, place });
    return true;
  };
  api.events.on("bed:started", (ctx) => {
    const n = bs(ctx.state).night;
    if (n) n.fin = undefined;
  });
  // remember who was around, for when it is over
  api.events.on("shift:minute", (ctx) => {
    const sh = bs(ctx.state).shift;
    const enc = bs(ctx.state).encounter;
    if (sh && enc && ((enc.crowd?.length ?? 0) > 0 || (enc.men?.length ?? 0) > 0)) sh.lastCrowd = { crowd: [...(enc.crowd ?? [])], men: [...(enc.men ?? [])] };
    else if (sh && enc) sh.lastCrowd = undefined;
  }, -10);

  api.invariants.add("crowd", (s) => {
    const enc = bs(s).encounter;
    for (const m of enc?.men ?? []) if (!bs(s).patrons[m.patron]) return `a man who joined does not exist: ${m.patron}`;
    return null;
  });
}
