// The night at home: him and her. Goes through the same consent formula as any guest,
// and through the same body rules, so a husband who does little for her shows up in the numbers.
import type { ModApi } from "@tc/core";
import { content } from "../content";
import { confidenceOf, earlyChance } from "./nerve";
import { slurTags } from "./voice";
import { bs, clamp, HUSBAND, WIFE } from "../state";
import { pleasureFor } from "./body";
import { owe, toneOf, whyTonight, cruelNow } from "./hernight";
import { actById } from "./encounters";
import { changeHeroine } from "./heroine";
import { HALL, TICKS_PER_SHIFT } from "./places";

import { himOf, onNightMinute } from "./rhythm";
export * from "./bed/acts";
import { AFTER, BED, BEDROOM, BED_ACTS, BED_SAVE, IN_BED, LEAD, NIGHT_ACT, NIGHT_ACTS, NIGHT_DECLINE, NIGHT_SELF, PULL_OUT, REST, SOFT_ACTS, UPSTAIRS, UPSTAIRS_ACTS, hisActOpen, toyForHim } from "./bed/acts";
import * as S from "./bed/scene";
import { registerHisNight } from "./bed/hisnight";

export function registerMarriage(api: ModApi) {
  const { B, H, feel, refuseLine, ask, moveLine, onTop, setAct, rewardOf, watching, turnedDown, rates, turn, startSecond, restRefused, finish, finishScene, herFinish, herTurn, bedOptions } = S;
  api.events.on("phase:enter", (ctx, e) => {
    const b = bs(ctx.state);
    const phase = e.payload!.phase;
    if (phase === "night") {
      ctx.state.where[HUSBAND] = BEDROOM;
      ctx.state.where[WIFE] = BEDROOM;
      b.night = { scene: "night_awake", asked: false, sex: null };
      // some nights she is the one who reaches for him
      const h = b.heroine;
      const W = content.body.night.wants;
      const promised = b.promised === ctx.state.time.day && h.energy >= W.energy / 2; // she started something earlier today
      const able = h.marriage.desire >= W.desire && h.energy >= W.energy && h.satisfied < 50 && h.marriage.resent < content.manners.talk.complainAt;
      const C = content.body.night.wantsChance;
      // worked up, she always does; otherwise it is a matter of how much she needs it, how much she wants him, and how long it has been
      const luck = able && h.arousal < W.arousal && ctx.rng.chance(Math.min(C.max, C.base + h.traits.libido * C.perLibido + (h.marriage.desire - W.desire) * C.perDesireAbove + Math.max(0, b.denied) * C.perNightWithout));
      // left wanting badly enough, a wife with some say comes for what she needs whether she wants him or not
      const Hn = content.intimacy.her;
      const needs = h.frustration >= Hn.why.needFrustration && b.power >= Hn.why.needPower && h.energy >= W.energy / 2 && h.satisfied < 50;
      if (promised || (able && h.arousal >= W.arousal) || luck || needs) {
        b.night.wants = true;
        b.night.scene = "wants_him";
        // why she reaches for him decides what she has in mind, and her power over him decides how she says it
        const why = whyTonight(ctx);
        b.night.why = why;
        ctx.log(`log.her.night.${why}.t${toneOf(ctx.state)}`);
        const idea = (why === "punish" ? Hn.punish : why === "need" && needs && !able ? Hn.need : []).filter((a) => NIGHT_ACTS.includes(a) && hisActOpen(ctx.state, a));
        if (idea.length > 0) b.night.counter = ctx.rng.pick(idea); // tonight it is this or nothing
        // he is locked up and she is fond of him: her idea of tonight is about him, by the only way left
        if (b.husband.caged && h.marriage.desire >= content.body.cage.prostateDesire && hisActOpen(ctx.state, "prostate") && ctx.rng.chance(content.body.cage.prostateChance)) {
          b.night.counter = "prostate";
          ctx.log("log.cage.prostate");
        }
      }
    }
    if (phase === "prep" && ctx.state.time.day > 1) {
      ctx.state.where[HUSBAND] = "cafe.hall";
      ctx.state.where[WIFE] = "cafe.bar";
    }
  });
  api.events.on("phase:exit", (ctx, e) => {
    if (e.payload!.phase === "night") bs(ctx.state).night = null;
  });


  // He reaches for her. If she is willing, the scene begins and runs turn by turn.
  api.actions.register({
    id: NIGHT_ACT,
    labelKey: "action.night",
    describe: (a) => ({ key: `action.night.${a.payload!.act}` }),
    enumerate(state) {
      const b = bs(state);
      // he can reach for her again after the first time or after a "no": each time counts against the next, and she does fall asleep
      if (state.time.phase !== "night" || !b.night || b.night.asked || b.night.sex || b.night.herAsleep || (b.night.asks ?? 0) >= content.body.night.maxAsks) return [];
      if (state.where[HUSBAND] !== BEDROOM || state.where[WIFE] !== BEDROOM) return [];
      if (b.night.counter) return [{ type: NIGHT_ACT, payload: { act: b.night.counter } }]; // tonight it is this or nothing
      // spent for today, he has only what needs nothing of him
      const spent = b.husband.spentDay === state.time.day || !!b.husband.caged;
      return NIGHT_ACTS.filter((act) => hisActOpen(state, act) && (!spent || act === "kiss" || SOFT_ACTS.includes(act) || (!!b.husband.caged && content.body.cage.through.includes(act)))).map((act) => ({ type: NIGHT_ACT, payload: { act } }));
    },
    apply(ctx, action) {
      const b = bs(ctx.state);
      const h = b.heroine;
      const act = actById(action.payload!.act as string);
      const before = b.night!.asks ?? 0;
      b.night!.asks = before + 1;
      b.night!.rest = undefined; // whatever was left open after the last time, this is his answer to it
      b.night!.fin = undefined;
      const wanted = b.night!.wants === true;
      b.night!.wants = false;
      const countered = b.night!.counter === act.id;
      b.night!.counter = undefined;
      const verdict = countered ? "eager" : ask(ctx, act.id, wanted ? content.body.night.wants.consent : 0, "wants", BEDROOM, [["again", -before * content.body.night.againPenalty]]);
      if (verdict === "refuse") {
        // not what he asked for, but she has her own idea of what he is good for tonight
        const C = content.body.bed.counter;
        const leads = b.power >= C.power || cruelNow(b) || (h.traits.confidence >= C.confidence && h.sizeTaste >= C.sizeTaste);
        const inside = act.zones.includes("vagina") || act.zones.includes("anus");
        if (leads && inside && h.marriage.resent < C.maxResent && ctx.rng.chance(C.chance)) {
          const hard = b.power >= C.peggingPower || cruelNow(b);
          const options = [...IN_BED.counter.filter((a) => hisActOpen(ctx.state, a)), ...(hard ? IN_BED.counterHard.filter((a) => hisActOpen(ctx.state, a)) : [])];
          // a wife who still asks rather than tells does not order him down there: she asks for his mouth, quietly
          const meek = toneOf(ctx.state) < 2;
          const offer = meek && options.includes("cunnilingus") ? "cunnilingus" : options.length ? options[ctx.rng.int(0, options.length - 1)] : undefined;
          if (offer) {
            b.night!.counter = offer;
            b.night!.scene = "wants_him";
            ctx.log(meek ? "log.night.counter.soft" : `log.night.counter.${offer}`);
            ctx.emit("husband:countered", { asked: act.id, offer });
            return;
          }
        }
        b.night!.scene = "cold_back";
        feel(ctx, 0, 1);
        // the "no" says why: whatever pulled hardest against it
        const why = refuseLine(ctx.state);
        ctx.log(why, { act: `action.night.${act.id}` }, slurTags(ctx.state, why));
        ctx.emit("husband:refused", { act: act.id });
        return;
      }
      if (act.id === "kiss") {
        feel(ctx, 1, -1);
        changeHeroine(ctx, "mood", 2, "husband");
        ctx.log("log.husband.kiss");
        return;
      }
      // being wanted by the man she wants does part of the work
      changeHeroine(ctx, "arousal", h.marriage.desire * H.foreplay, "husband");
      const unlucky = ctx.rng.chance(H.prematureChance + earlyChance(ctx.state));
      b.night!.sex = {
        act: act.id,
        his: clamp(B.startHis + Math.max(0, b.denied) * B.deniedStart + (unlucky ? B.unluckyStart : 0) + himOf(ctx.state).arousal * content.day.rhythm.him.arousal.startHis),
        hers: clamp(h.arousal * 0.4),
        came: 0,
        turns: 0,
        top: false,
        skirt: false,
        pleasure: 0,
        bored: 0,
        asks: null,
        ignored: 0,
        out: false,
        byHand: false,
        looseSaid: false,
        ...(b.husband.spentDay === ctx.state.time.day || b.husband.caged ? { soft: true } : {}),
      };
      // a yes she had to talk herself into does not look like one she was waiting for
      const start = verdict === "hesitant" ? "log.bed.start.hesitant" : "log.bed.start";
      ctx.log(start, { act: `act.${act.id}` }, slurTags(ctx.state, start));
      setAct(ctx, act.id); // after the line that starts it: what she feels of him comes second
      ctx.emit("bed:started", { act: act.id });
    },
  });

  api.actions.register({
    id: UPSTAIRS,
    labelKey: "action.upstairs",
    describe: (a) => ({ key: `action.upstairs.${a.payload!.pub ? "public" : a.payload!.here ? "here" : "up"}`, params: { act: `act.${a.payload!.act}` } }),
    enumerate(state) {
      const b = bs(state);
      const sh = b.shift;
      const phase = state.time.phase;
      if (b.husband.spentDay === state.time.day || b.husband.caged || b.encounter || b.caught || b.reaction || b.night) return [];
      if (phase === "shift" ? !sh || sh.tick >= TICKS_PER_SHIFT : phase !== "prep" || !b.day || !!b.day.busy || b.day.left < B.minutesPerTurn * 4) return [];
      if (state.where[HUSBAND] !== state.where[WIFE] || state.where[HUSBAND]?.startsWith("town.")) return [];
      const guests = phase === "shift" ? (state.where[HUSBAND] === HALL ? sh!.visits.length : 0) : 0;
      if (guests === 0) return UPSTAIRS_ACTS.map((act) => ({ type: UPSTAIRS, payload: { act, here: 1 } }));
      return [...UPSTAIRS_ACTS.map((act) => ({ type: UPSTAIRS, payload: { act, here: 0 } })), ...(watching(state) > 0 ? UPSTAIRS_ACTS.map((act) => ({ type: UPSTAIRS, payload: { act, here: 1, pub: 1 } })) : [])];
    },
    apply(ctx, action) {
      const b = bs(ctx.state);
      const h = b.heroine;
      const act = actById(action.payload!.act as string);
      const pub = action.payload!.pub === 1;
      const here = action.payload!.here === 1;
      const loc = here ? ctx.state.where[HUSBAND]! : BEDROOM;
      const N = content.body.night;
      if (b.shift) b.shift.upstairs = true;
      // their own bed is the easy place; an empty room is nearly as good; a room full of guests is another matter
      const more: [string, number][] = [];
      if (pub) more.push(["plain_sight", -Math.max(0, N.public.base + (100 - h.traits.openness) * N.public.perClosed - (h.latents.exhibitionist !== undefined ? N.public.exhibitionist : 0))]);
      else if (here && !loc.startsWith("home.")) more.push(["elsewhere", -N.elsewhere]); // their own rooms upstairs (the bathroom too) are as private as the bed
      else if (!here) more.push(["work", -N.work]); // leaving a full room to itself is not nothing for her
      const verdict = ask(ctx, act.id, 0, "going", loc, more);
      if (verdict === "refuse") {
        feel(ctx, 0, pub ? 1 : 0.5);
        if (pub) ctx.log("log.upstairs.no.public");
        else if (!here) ctx.log("log.upstairs.no");
        else {
          const why = refuseLine(ctx.state);
          ctx.log(why, { act: `action.night.${act.id}` }, slurTags(ctx.state, why));
        }
        ctx.emit("husband:refused", { act: act.id });
        return;
      }
      if (!here) {
        ctx.state.where[HUSBAND] = BEDROOM;
        ctx.state.where[WIFE] = BEDROOM;
      }
      changeHeroine(ctx, "arousal", h.marriage.desire * H.foreplay, "husband");
      b.night = { scene: act.id, asked: true, ...(here ? { here: pub ? ("public" as const) : ("here" as const) } : {}), sex: { act: act.id, his: clamp(B.startHis + Math.max(0, b.denied) * B.deniedStart), hers: clamp(h.arousal * 0.4), came: 0, turns: 0, top: false, skirt: false, pleasure: 0, bored: 0, asks: null, ignored: 0, out: false, byHand: false, looseSaid: false } };
      setAct(ctx, act.id);
      if (pub) {
        // the whole room has it to talk about, and to think about
        b.gossip = clamp(b.gossip + N.public.gossip);
        for (const v of b.shift!.visits) if (v.stay > 0) v.heat = clamp((v.heat ?? 0) + N.public.heat);
        h.traits.openness = clamp(h.traits.openness + N.public.openness);
      }
      const start = pub ? "log.upstairs.public" : !here ? "log.upstairs.up" : ctx.state.time.phase === "shift" ? "log.upstairs.here" : "log.upstairs.prep";
      ctx.log(start, { act: `act.${act.id}` });
      ctx.emit("bed:started", { act: act.id, shift: ctx.state.time.phase === "shift", public: pub });
    },
  });
  // He stepped in while she was with a guest and she let him: from here it is a scene of three, and he is one of them.
  api.events.on("join:start", (ctx, e) => {
    const b = bs(ctx.state);
    const h = b.heroine;
    const { act: actId, patron } = e.payload as { act: string; patron: string };
    const p = b.patrons[patron];
    if (b.night || !p) return;
    const act = actById(NIGHT_ACTS.includes(actId) || BED_ACTS.includes(actId) ? actId : "sex");
    const pub = ctx.state.where[WIFE] === HALL;
    ctx.state.where[HUSBAND] = ctx.state.where[WIFE]!;
    b.night = { scene: "join_husband", asked: true, here: pub ? "public" : "here", third: patron, sex: { act: act.id, his: clamp(B.startHis + Math.max(0, b.denied) * B.deniedStart), hers: clamp(h.arousal * 0.6), came: 0, turns: 0, top: false, skirt: false, pleasure: 0, bored: 0, asks: null, ignored: 0, out: false, byHand: false, looseSaid: false } };
    setAct(ctx, act.id);
    // two men at once is more than either of them alone, and she knows which of them is the bigger
    b.night.sex!.hers = clamp(b.night.sex!.hers + 15);
    if (p.size > b.husband.size + 2) {
      b.power = clamp(b.power + 1);
      ctx.log("log.join.bigger", { name: `@name:${p.name}` }, ["unseen", "thought"]);
    }
    ctx.log("log.join.start", { name: `@name:${p.name}`, act: `act.${act.id}` });
    ctx.emit("bed:started", { act: act.id, shift: true, public: pub, third: patron });
  });
  // The doors open while they are at it: it stops there.
  api.events.on("phase:enter", (ctx, e) => {
    const b = bs(ctx.state);
    if (e.payload!.phase !== "shift" || !b.night) return;
    if (b.night.sex) finishScene(ctx, "stop");
    b.night = null;
  });
  // Walking away in the middle of it ends it.
  api.events.on("entity:moved", (ctx, e) => {
    if (e.payload!.id === HUSBAND && bs(ctx.state).night?.sex) finish(ctx, "stop");
  });

  // She said no. He can still see to himself next to her, if she lets him: she lies there, he looks at her.
  api.actions.register({
    id: NIGHT_SELF,
    labelKey: "action.night.self",
    enumerate(state) {
      const b = bs(state);
      const n = b.night;
      if (state.time.phase !== "night" || !n || n.sex || n.scene !== "cold_back" || n.selfAsked || b.husband.spentDay === state.time.day) return [];
      return state.where[HUSBAND] === BEDROOM && state.where[WIFE] === BEDROOM ? [{ type: NIGHT_SELF }] : [];
    },
    apply(ctx) {
      const b = bs(ctx.state);
      const h = b.heroine;
      b.night!.selfAsked = true;
      if (h.marriage.resent >= content.body.bed.selfResent) {
        feel(ctx, 0, 0.5);
        ctx.log("log.night.self.no");
        return;
      }
      b.night!.scene = "by_hand";
      b.husband.spentDay = ctx.state.time.day;
      b.denied = -1;
      const mocks = b.mode === "open" && (b.power >= 30 || cruelNow(b));
      if (mocks) b.power = clamp(b.power + 2);
      const kind = h.marriage.desire >= content.body.bed.reward.lovingDesire;
      feel(ctx, mocks ? -0.5 : 0, 0); // she does not think less of him for it unless she was already looking down
      ctx.log(mocks ? "log.night.self.mock" : kind ? "log.night.self.kind" : `log.night.self.ignored.${ctx.rng.int(1, 3)}`);
      ctx.emit("bed:ended", { act: "self", came: false, outcome: "by_hand", turns: 0, alone: true }); // she said no herself: nothing is owed for this
    },
  });

  // "Not tonight": turning her down has a price, and she still has the night ahead of her.
  api.actions.register({
    id: NIGHT_DECLINE,
    labelKey: "action.night.decline",
    enumerate: (state) => (state.time.phase === "night" && bs(state).night?.wants && !bs(state).night?.sex ? [{ type: NIGHT_DECLINE }] : []),
    apply(ctx) {
      const b = bs(ctx.state);
      b.night!.wants = false;
      b.night!.asked = true;
      b.night!.scene = "cold_back";
      turnedDown(ctx, 1);
      ctx.log("log.night.declined");
    },
  });
  // Rolling over without a word is an answer too, a slightly kinder one.
  api.events.on(
    "phase:exit",
    (ctx, e) => {
      if (e.payload!.phase !== "night" || !bs(ctx.state).night?.wants || bs(ctx.state).night?.asked) return;
      turnedDown(ctx, 0.6);
      ctx.log("log.night.ignored_her");
    },
    20,
  );




  // Some nights, once she holds the reins in the marriage, she does not wait to be given them.
  api.events.on("bed:started", (ctx) => {
    const b = bs(ctx.state);
    const sex = b.night?.sex;
    if (!sex || ctx.state.time.phase !== "night") return;
    const cruel = cruelNow(b);
    // she came to play, or to collect: the scene is hers from the start, in any mode
    const hers = b.night?.why === "play" || b.night?.why === "punish";
    if (!hers) {
      if (b.mode !== "open") return;
      if (b.power < LEAD.takesAtPower && !cruel) return;
      if (!ctx.rng.chance(cruel ? LEAD.cruelTakes : LEAD.takesChance)) return;
    }
    sex.lead = true;
    onTop(ctx);
    ctx.log("log.bed.lead.takes");
    ctx.emit("bed:lead", { given: false });
  });

  // Afterwards: "lick it up", "clean me". She does, or she turns it round on him.
  api.actions.register({
    id: AFTER,
    labelKey: "action.after",
    describe: (a) => ({ key: `action.after.${a.payload!.do}` }),
    enumerate(state) {
      const n = bs(state).night;
      if (state.time.phase !== "night" || !n || n.sex || !n.after || bs(state).complaint) return [];
      // "clean me with your mouth" is for a wife who would do it: not one who has been saying no to him all night
      const h = bs(state).heroine;
      const A = content.intimacy.after;
      const willing = h.traits.openness >= A.willingOpenness || h.latents.oral_fixation !== undefined || h.latents.submissive !== undefined || (bs(state).mode === "open" && bs(state).power >= A.reversePower);
      const dos = [...(PULL_OUT.has(n.after) || n.after === "face" ? ["lick_it"] : []), ...(willing && (n.noes ?? 0) === 0 ? ["clean_me"] : [])];
      return dos.map((d) => ({ type: AFTER, payload: { do: d } }));
    },
    apply(ctx, action) {
      const b = bs(ctx.state);
      const h = b.heroine;
      const A = content.intimacy.after;
      const what = action.payload!.do as string;
      const where = b.night!.after!;
      b.night!.after = undefined;
      const willing = h.traits.openness >= A.willingOpenness || h.latents.oral_fixation !== undefined || h.latents.submissive !== undefined;
      if (b.mode === "open" && b.power >= A.reversePower) {
        b.power = clamp(b.power + (A.reversed.power ?? 0));
        ctx.log(`log.after.${what}.reversed`);
        ctx.emit("bed:after", { do: what, outcome: "reversed", where });
        if (what === "lick_it") for (const k of ["face", "chest", "body"]) delete h.cum?.[k];
      } else if (willing) {
        changeHeroine(ctx, "arousal", A.done.arousal ?? 0, "husband");
        ctx.log(`log.after.${what}`);
        ctx.emit("bed:after", { do: what, outcome: "done", where });
        if (what === "lick_it") for (const k of ["face", "chest", "body"]) delete h.cum?.[k];
        else b.husband.cumOn = 0;
      } else {
        ctx.log(`log.after.${what}.no`);
        ctx.emit("bed:after", { do: what, outcome: "refused", where });
      }
    },
  });

  api.actions.register({
    id: REST,
    labelKey: "action.rest",
    describe: (a) => ({ key: `action.rest.${a.payload!.do}`, ...(a.payload!.act ? { params: { act: `act.${a.payload!.act}` } } : {}) }),
    enumerate(state) {
      const n = bs(state).night;
      if (state.time.phase !== "night" || !n?.rest || n.sex || n.herAsleep !== undefined || state.where[HUSBAND] !== state.where[WIFE]) return [];
      const out: { type: string; payload: Record<string, string> }[] = [];
      if (n.rest.wants) out.push({ type: REST, payload: { do: "give", act: n.rest.wants } });
      else if (!n.rest.hers && !n.herCame) out.push({ type: REST, payload: { do: "for_her" } }); // "you haven't yet" only if she really has not
      out.push({ type: REST, payload: { do: "hold" } });
      return out;
    },
    apply(ctx, action) {
      const b = bs(ctx.state);
      const h = b.heroine;
      const r = b.night!.rest!;
      const what = action.payload!.do as string;
      if (what === "give") {
        feel(ctx, 0.5, -0.5);
        ctx.log("log.bed.gives", { act: `act.${r.wants}` });
        return void startSecond(ctx, r.wants!, r.hersAt);
      }
      if (what === "for_her") {
        // he offers without being asked: she takes it if there is anything left in her to take it with
        const A = B.after;
        const pick = IN_BED.givesHer.filter((a) => hisActOpen(ctx.state, a)).map((a) => ({ a, r: rewardOf(ctx.state, a, pleasureFor(ctx.state, actById(a), b.husband.size)) })).sort((x, y) => y.r - x.r || x.a.localeCompare(y.a))[0];
        if (!pick || h.marriage.resent >= A.maxResent || (r.hersAt < A.minHers / 2 && h.arousal < 30)) {
          b.night!.rest = undefined;
          feel(ctx, 0.5, 0);
          return void ctx.log("log.bed.rest.for_her.no");
        }
        feel(ctx, 1, -1);
        ctx.log("log.bed.rest.for_her", { act: `act.${pick.a}` });
        return void startSecond(ctx, pick.a, Math.max(r.hersAt, h.arousal * 0.4));
      }
      // he holds her: after a good night it is the rest of it, after her asking it is a no
      if (r.wants) {
        ctx.log("log.bed.rest.hold.no");
        return void restRefused(ctx);
      }
      b.night!.rest = undefined;
      b.night!.fin = undefined;
      b.night!.after = undefined;
      b.night!.scene = "him_hug";
      feel(ctx, r.hers ? 1 : 0.5, -0.5);
      changeHeroine(ctx, "mood", r.hers ? 2 : 1, "husband");
      ctx.log(r.hers ? "log.bed.rest.hold" : "log.bed.rest.hold.plain");
    },
  });
  // the stage after does not last: a few minutes of his silence are an answer too, and then she can sleep
  onNightMinute((ctx) => {
    const n = bs(ctx.state).night;
    if (!n?.rest || n.sex) return;
    n.rest.age = (n.rest.age ?? 0) + 1;
    if (n.rest.age < B.restMinutes) return;
    if (n.rest.wants) restRefused(ctx);
    else n.rest = undefined;
  });
  // he fell asleep on what she asked for
  api.events.on("phase:exit", (ctx, e) => void (e.payload!.phase === "night" && bs(ctx.state).night?.rest?.wants && restRefused(ctx, true)), 20);

  // What he can do while it lasts.
  // The moment before it goes wrong - he is going soft, or it is coming far too soon - and what he does about it.
  api.actions.register({
    id: BED_SAVE,
    labelKey: "action.bed_save",
    describe: (a) => ({ key: `action.bed_save.${a.payload!.do}` }),
    enumerate(state) {
      const sex = bs(state).night?.sex;
      if (!sex || !sex.warned || sex.saved) return [];
      return (sex.warned === "soft" ? ["focus", "ask_her"] : ["slow", "tell_her"]).map((d) => ({ type: BED_SAVE, payload: { do: d } }));
    },
    apply(ctx, action) {
      const b = bs(ctx.state);
      const h = b.heroine;
      const sex = b.night!.sex!;
      const what = action.payload!.do as string;
      const warm = h.marriage.desire >= B.reward.lovingDesire || h.arousal >= B.save.herArousal;
      let ok = false;
      if (what === "focus") ok = ctx.rng.chance(Math.min(0.9, B.save.focusBase + confidenceOf(ctx.state) * B.save.focusPerConfidence));
      else if (what === "slow") ok = true;
      else ok = warm; // asking her, either way: it works when she wants him to get there
      if (ok) {
        sex.saved = true;
        if (sex.warned === "soft") sex.his = clamp(sex.his + B.save.focusHis);
        else {
          sex.his = clamp(sex.his - (what === "slow" ? B.save.slowHis : B.save.toldHis));
          if (what === "slow") sex.pleasure = clamp(sex.pleasure - B.save.slowHers);
        }
        if (what === "ask_her" || what === "tell_her") feel(ctx, 0.5, -0.3);
      } else if (what !== "focus") h.marriage.resent = clamp(h.marriage.resent + 0.5);
      ctx.log(`log.bed.save.${what}.${ok ? "ok" : "no"}`);
      ctx.emit("bed:save", { do: what, ok, of: sex.warned ?? "" });
    },
  });
  api.actions.register({
    id: BED,
    labelKey: "action.bed",
    describe: (a) => (a.payload!.do === "give" ? { key: "action.bed.give", params: { act: `act.${a.payload!.act}` } } : a.payload!.to ? { key: "action.bed.switch", params: { act: `act.${a.payload!.to}` } } : a.payload!.where ? { key: `action.bed.finish.${a.payload!.where}` } : { key: `action.bed.${a.payload!.do}` }),
    enumerate: (state) => bedOptions(state),
    // while she leads, anything he tries to do on his own is simply her next move
    accepts: (state, a) => {
      const sex = bs(state).night?.sex;
      if (!sex) return false;
      if (sex.lead && ["keep", "faster", "slower", "talk", "kiss"].includes(a.payload?.do as string)) return true;
      const key = (p: Record<string, unknown> | undefined) => JSON.stringify(Object.entries(p ?? {}).sort(([x], [y]) => x.localeCompare(y)));
      return bedOptions(state).some((o) => key(o.payload) === key(a.payload));
    },
    apply(ctx, action) {
      const b = bs(ctx.state);
      const sex = b.night!.sex!;
      let what = action.payload!.do as string;
      if (sex.lead && ["keep", "faster", "slower", "talk", "kiss"].includes(what)) what = "follow";
      const r = rates(ctx.state);
      switch (what) {
        case "give": {
          // he does what she asked for: no question to answer, she wanted it
          const to = sex.asks!;
          sex.asks = null;
          sex.ignored = 0;
          sex.bored = 0;
          moveLine(ctx, sex.act, to, "he");
          setAct(ctx, to);
          feel(ctx, 0.5, -0.5);
          ctx.log("log.bed.gives", { act: `act.${to}` });
          turn(ctx, 2, 4);
          break;
        }
        case "hand":
          sex.byHand = true;
          ctx.log(sex.out ? "log.bed.hand.ignored" : "log.bed.hand");
          turn(ctx, rates(ctx.state).his, 0);
          break;
        case "keep":
          turn(ctx, r.his, r.hers);
          break;
        case "faster":
          turn(ctx, r.his * B.faster[0], r.hers * B.faster[1]);
          break;
        case "slower":
          turn(ctx, r.his * B.slower[0], r.hers * B.slower[1]);
          break;
        case "talk":
          // dirty talk lands with an open woman and falls flat with a shy one
          turn(ctx, B.talk[0], B.talk[1] * (0.4 + b.heroine.traits.openness / 80));
          break;
        case "kiss":
          turn(ctx, B.kiss[0], B.kiss[1] * (0.5 + b.heroine.marriage.desire / 100));
          break;
        case "top":
        case "skirt":
          sex[what] = true;
          turn(ctx, 2, B.undress);
          break;
        case "panties_aside":
        case "panties_off":
          sex.panties = what === "panties_off" ? "off" : "aside";
          b.heroine.panties = sex.panties;
          sex.skirt = true;
          turn(ctx, 2, B.undress);
          break;
        case "naked":
          sex.naked = true;
          sex.panties = "off";
          b.heroine.panties = "off";
          turn(ctx, 3, B.undress);
          break;
        case "say_mine": {
          // a wife who holds the reins laughs at it; one who wants him says it
          const Tk = content.intimacy.talk;
          if (b.power >= Tk.sayMinePower && b.mode === "open") {
            b.power = clamp(b.power + (Tk.sayMineLaugh.power ?? 0));
            ctx.log("log.bed.say_mine.laughs");
            turn(ctx, 1, 0);
          } else if (b.heroine.marriage.desire >= 45) {
            ctx.emit("bed:said", { what: "mine" });
            ctx.log("log.bed.say_mine");
            turn(ctx, Tk.sayMine.his ?? 0, Tk.sayMine.hers ?? 0);
          } else {
            ctx.log("log.bed.say_mine.no");
            turn(ctx, 0, -3);
          }
          break;
        }
        case "look_at_me":
          ctx.log(sex.out ? "log.bed.look_at_me.out" : "log.bed.look_at_me");
          turn(ctx, sex.out ? 0 : (content.intimacy.talk.lookAtMe.his ?? 0), sex.out ? 0 : (content.intimacy.talk.lookAtMe.hers ?? 0));
          break;
        case "give_lead":
          sex.lead = true;
          onTop(ctx);
          ctx.log("log.bed.lead.given");
          ctx.emit("bed:lead", { given: true });
          herTurn(ctx);
          break;
        case "follow":
          herTurn(ctx);
          break;
        case "beg": {
          // "please": she decides
          const lets = b.heroine.marriage.desire >= LEAD.begAllowDesire && sex.came > 0;
          if (lets || sex.turns >= LEAD.maxTurns) herFinish(ctx);
          else {
            sex.his = clamp(sex.his + (LEAD.begDenied.his ?? 0));
            b.power = clamp(b.power + (LEAD.begDenied.power ?? 0));
            ctx.log(`log.bed.lead.denied.${ctx.rng.int(1, 2)}`);
            turn(ctx, 0, r.hers);
          }
          break;
        }
        case "moan": {
          // he lets her hear it: a woman who holds the reins likes that, a gentle one is touched by it
          const hard = b.power >= 25 || cruelNow(b);
          changeHeroine(ctx, "arousal", hard ? 5 : 2, "his moans");
          if (hard) b.power = clamp(b.power + 0.5);
          ctx.log(`log.bed.fd.moan.${hard ? "hard" : "soft"}`);
          if (sex.lead) herTurn(ctx);
          else turn(ctx, r.his * 1.15, 0);
          break;
        }
        case "beg_more": {
          // "more": a finger becomes a toy, a toy becomes the next size up - whether he can take it or not
          const K = content.body.his;
          const owned = content.day.shop.toys.filter((t) => b.toys.includes(t.id)).sort((x, y) => x.size - y.size);
          const now = sex.act === "prostate" ? K.fingerSize : (toyForHim(ctx.state).toy?.size ?? 0);
          const next = owned.find((t) => t.size > now);
          const willing = b.power >= 15 || b.heroine.marriage.desire >= 50 || cruelNow(b);
          if (!willing) {
            ctx.log("log.bed.fd.more.no");
            if (sex.lead) herTurn(ctx);
            else turn(ctx, r.his, 0);
            break;
          }
          b.power = clamp(b.power + 1);
          changeHeroine(ctx, "arousal", 3, "he begs");
          if (sex.act === "prostate" && next && hisActOpen(ctx.state, "dildo_him")) {
            sex.himToy = next.id;
            setAct(ctx, "dildo_him");
            ctx.log("log.bed.fd.more.toy", { toy: `toy.${next.id}` });
          } else if (next && sex.act !== "fisting_him") {
            sex.himToy = next.id;
            setAct(ctx, sex.act); // his body takes the new size: the stretch is counted again
            ctx.log("log.bed.fd.more.bigger", { toy: `toy.${next.id}` });
          } else ctx.log("log.bed.fd.more.none");
          if (sex.lead) herTurn(ctx);
          else turn(ctx, r.his, 0);
          break;
        }
        case "beg_gentle": {
          // "easy...": a fond wife slows down; one who enjoys it does not
          const hard = b.power >= 40 || cruelNow(b);
          if (hard) b.power = clamp(b.power + 1);
          ctx.log(`log.bed.fd.gentle.${hard ? "no" : "ok"}`);
          if (sex.lead && hard) herTurn(ctx);
          else turn(ctx, r.his * (hard ? 1.2 : 0.6), 0);
          break;
        }
        case "take_back":
          sex.lead = false;
          if (b.power >= LEAD.takesAtPower) {
            feel(ctx, 0, LEAD.takeBack.resent ?? 0);
            ctx.emit("bed:lead", { given: false, taken: true });
            ctx.log("log.bed.lead.taken_back.sulk");
          } else ctx.log("log.bed.lead.taken_back");
          turn(ctx, r.his, r.hers * 0.5);
          break;
        case "finish": {
          // where he finishes is a small thing she either likes or puts up with
          let where = (action.payload!.where as string) ?? "self";
          if (where === "self") {
            // nothing of his lands anywhere on her: her finger in him, her foot, his own hand - the act has its own ending
            finish(ctx, "choice");
            break;
          }
          const Fn = content.intimacy.finish;
          const hh = b.heroine;
          // she has her own mind about it
          if (where === "face" && hh.traits.openness < 60 && hh.latents.oral_fixation === undefined && hh.traits.confidence >= Fn.dodgeConfidence) {
            where = "chest";
            ctx.log("log.bed.finish.dodged");
          } else if (PULL_OUT.has(where) && (sex.act === "sex" || sex.act === "riding") && hh.arousal >= Fn.holdArousal && hh.marriage.desire >= Fn.holdDesire && ctx.rng.chance(Fn.holdChance)) {
            where = "inside";
            ctx.log("log.bed.finish.held");
            if (b.night) b.night.lock = true; // she held him in: her legs locked around him (fin_inside, lock=1)
          }
          if (b.night && ctx.state.time.phase === "night") b.night.after = where;
          if (b.night) b.night.fin = where;
          if (where === "face" || where === "mouth") {
            const likes = b.heroine.traits.openness >= (where === "face" ? 60 : 45) || b.heroine.latents.oral_fixation !== undefined;
            if (likes) changeHeroine(ctx, "arousal", 4, "finish");
            else feel(ctx, 0, where === "face" ? 1.5 : 0.5);
            ctx.log(`log.bed.finish.${where}${likes ? "" : ".no"}`);
          } else if (PULL_OUT.has(where)) ctx.log(`log.bed.finish.${where}`);
          ctx.emit("cum:landed", { by: HUSBAND, act: bs(ctx.state).night!.sex!.act, where });
          finish(ctx, "choice");
          break;
        }
        case "stop": {
          // saying no to what she kept him for after he was done: that is one more thing he owes her
          const sx = bs(ctx.state).night!.sex!;
          const kept = sx.soft && (bs(ctx.state).night!.rounds ?? 0) > 0 && sx.came === 0;
          finish(ctx, "stop");
          if (kept) {
            feel(ctx, 0, content.intimacy.her.second.refusedResent);
            ctx.log(`log.bed.second.refused.t${toneOf(ctx.state)}`);
            owe(ctx, "refused");
          }
          break;
        }
        case "switch": {
          const to = action.payload!.to as string;
          if (ask(ctx, to, B.switchBonus) === "refuse") {
            ctx.log("log.bed.switch.no", { act: `act.${to}` });
            turn(ctx, 0, -6);
          } else {
            moveLine(ctx, sex.act, to, "he");
            setAct(ctx, to);
            ctx.log("log.bed.switch.yes", { act: `act.${to}` });
            turn(ctx, 2, 2);
          }
          break;
        }
      }
    },
  });

  registerHisNight(api);
}
