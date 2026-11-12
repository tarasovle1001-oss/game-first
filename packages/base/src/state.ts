import type { GameState } from "@tc/core";

export const BASE_ID = "base";
export const WIFE = "wife";
export const HUSBAND = "husband";

export interface Heroine {
  // fast state, 0..100
  energy: number;
  mood: number;
  arousal: number;
  drunk: number;
  // character, 0..100, changes slowly
  traits: { openness: number; confidence: number; fidelity: number; honesty: number; libido: number };
  // body: how much each zone has been stretched (0..100) and the highest it has ever been
  body: Record<Zone, { stretch: number; peak: number }>;
  skills: Record<string, number>; // act id -> 0..100
  frustration: number; // 0..100, nights that left her wanting pile up here
  satisfied: number; // 0..100, "just had her fill", cools down
  sizeTaste: number; // 0..100, how much size matters to her
  orgasms: number;
  marriage: { desire: number; resent: number; trust?: number }; // what she feels for her husband, 0..100
  outfit: string;
  bare?: Bare; // what she has taken off, on top of the outfit
  /** What is on her and in her, by place: minutes it still shows. */
  cum?: Record<string, number>;
  /** For each mark: true while it is only her husband's. */
  cumHis?: Record<string, boolean>;
  sore?: Record<string, number>; // soreness by zone, 0..100
  /** How she looks after something: flushed, sweat, hair, clothes - minutes left. */
  after?: Record<string, number>;
  panties?: "on" | "aside" | "off";
  skirtUp?: boolean;
  name?: string; // what she is called
  prefs?: Record<string, number>; // tastes set at the start, 0..100 each
  feel?: Partial<Record<import("./content/schema").Emotion, number>>; // feelings, 0..100 each; absent = none
  attrs?: Record<"charm" | "wit" | "stamina" | "composure", number>; // what she is made of, 0..100
  why?: Record<string, { r: string; a: number }[]>; // the last reasons each fast stat moved
  snap?: { day: number; traits: Record<string, number> }; // her character a week ago, to show where it is going
  annoyHim?: number; // 0..100: how much she has had of him today
  annoyance?: number; // 0..100: how much she has had of being asked and pawed at today
  tastes: { acts: Record<string, number>; types: Record<string, number> }; // what she has come to like
  latents: Record<string, true>; // hidden sides she has; absent = she does not have it
}

export type Directive = "reserved" | "natural" | "friendly";

export type Zone = "vagina" | "anus" | "mouth";
export type Mode = "hidden" | "open"; // NTR: she hides it; NTS: he knows

export interface Husband {
  size: number; // cm
  stamina: number;
  minutes: number; // how long he lasts
  style: "naive" | "jealous" | "encouraging";
  stretch: number; // 0..100, his own: what she has got him used to
  cumOn?: number; // minutes his own still shows on him
  fitness?: number; // 0..100, what the gym has done for him
  energy?: number; // 0..100
  mood?: number; // 0..100
  arousal?: number; // 0..100
  washed?: string; // "day:phase" he last washed
  spentDay?: number; // the day he came from a touch alone: nothing more from him that day
}

export interface PatronMemory {
  visits: number;
  lastDay: number;
  served: number;
  tipsTotal: number;
  affinity: number; // what she thinks of him, -100..100
  interest: number; // how much he wants her, 0..100
  tier: number; // how far she has gone with him on the ladder, -1 = nothing yet
  acts: Record<string, number>; // act id -> times
  refusals: number;
  hasNumber: boolean; // they exchanged numbers
  stance?: "free" | "polite" | "away"; // what her husband said about him
  sizeKnown: boolean; // she has seen what he has
  orgasms: number; // times he made her come
}

export interface Patron {
  id: string;
  type: string;
  name: number; // index into content.names
  age: number;
  build: string;
  size: number; // cm
  stamina: number;
  traits: { persistence: number; charm: number; honesty: number; jealousy: number; generosity: number };
  approach: "court" | "drink" | "pay" | "push";
  regular: boolean;
  lender?: boolean; // the man the cafe owes money to
  likes?: string[]; // acts he steers toward when he gets the chance
  memory: PatronMemory;
}

export type Bare = "none" | "top" | "bottom" | "all";

export interface Visit {
  sawBare?: Bare; // how undressed he has already seen her tonight
  cumOn?: number; // minutes it still shows on him after he has finished
  drunk?: number; // 0..100, how much he has had tonight
  heat?: number; // 0..100, how worked up he is
  patron: string;
  stay: number; // ticks left
  served: number;
  waited: number; // ticks he has been waiting for an order
  sinceOrder: number; // ticks since his last order
  tier: number; // how far he got tonight, -1 = nothing yet
  blocked: boolean; // he stopped trying for tonight
  pressure: number; // times he insisted after a "no"
  retry: string | null; // act he is going to ask for again
  rounds: number; // times he has finished tonight
  cooldownUntil?: number; // minute before which he does not try to take her aside again
  pushed?: boolean; // the husband nudged her toward him tonight
  crossed?: number; // times he would not take a no tonight
  dealt?: boolean; // he has already been to the husband about her tonight
}

/** The two of them in bed, turn by turn. */
export interface BedScene {
  act: string;
  his: number; // 0..100
  hers: number; // 0..100
  came: number; // times she has come in this scene
  turns: number;
  top: boolean; // her top is open
  skirt: boolean; // her skirt is pushed up
  pleasure: number; // what the current act gives her, 0..100
  bored: number; // grows while what they do gives her too little
  asks: string | null; // what she has asked for instead: an act id, or "finish"
  ignored: number; // times he went on without answering her
  out: boolean; // she has checked out: she lies there and waits for it to be over
  byHand: boolean; // he is finishing himself
  looseSaid: boolean;
  soft?: boolean; // he is done; she keeps him at it with what needs nothing of him
  lead?: boolean; // she runs the scene
  heldSaid?: boolean;
  switched?: number;
  tried?: string[]; // what she has already had them do in this scene while leading
  panties?: "on" | "aside" | "off";
  naked?: boolean;
}

export type Verdict = "eager" | "hesitant" | "refuse";

/** Something is happening between her and a guest right now. The scene is derived from it. */
export interface Encounter {
  patron: string;
  act: string;
  loc: string;
  verdict: Verdict;
  startTick: number; // minute of the shift it began
  actTick: number; // minute the current act began
  nextTry: number; // minute he next tries to move it on
  his: number; // 0..100, only moves in intimate acts
  hers: number; // 0..100
  hisRate: number; // per minute
  pleasure: number; // what the current act gives her, 0..100
  came: number; // times she came in this one
  finished?: boolean; // he came at least once in this one
  heard?: boolean; // the husband has had his ear to the door of this one
  owed?: number; // what he means to leave her when it is over
  refusals: number; // changes she said no to
  paid: boolean; // his offer of money is already on the table
  bored?: number; // attempts in a row that gave her too little
  joined?: string; // her husband joined in: how
  joinUntil?: number; // minute until which the picture is the three of them
  men?: { patron: string; slot: string; act: string }[]; // other men who joined in
  crowd?: string[]; // men who have come over to watch
  crowdSince?: Record<string, number>; // minute each of them came over
  reacted?: number; // minute of the last line about the room
  invited?: string[]; // men her husband already waved over
  lastLine?: number;
}

/** Kept for the debug panel: why she answered the way she did. */
export interface ProposalRecord {
  day: number;
  tick: number;
  patron: string;
  act: string;
  loc: string;
  verdict: Verdict;
  seen: boolean; // the husband was close enough to notice
  rolled?: number; // chance of a yes when she hesitated (absent when there was no roll)
  total: number;
  rows: { id: string; labelKey: string; value: number }[];
}

export interface Shift {
  tick: number;
  visits: Visit[];
  income: number;
  tips: number;
  served: number;
  turnedAway: number;
  moment: { patron: string; act: string; until: number } | null; // last light act of this tick
  interrupt: boolean; // something worth stopping "wait until" for has happened
  herMoves?: number; // times she started something with a guest herself tonight
  wifeFreeAt?: number; // minute she is done with the order in her hands
  restUntil?: number; // minute before which nobody takes her off the floor
  upstairs?: boolean; // he already took her away from the floor tonight
  stockWarned: boolean;
  stolen?: number; // taken from the unwatched till tonight
  fin?: { patron: string; place: string; act: string; loc: string; until: number }; // how the last one ended, while it still shows
  lastCrowd?: { crowd: string[]; men: { patron: string; slot: string; act: string }[] }; // who was around the encounter that is running
  cleanUntil?: number; // minute she is done cleaning herself up
  marksSeen?: boolean;
  show?: { type: string; until: number; patron?: string }; // a short thing on the floor that is the picture for a few minutes
  marksGuests?: boolean;
  hisQuiet?: boolean; // he has gone up to lie down in the middle of the evening
  quietUntil?: number; // she went up to lie down: the minute she is back
  awayUntil?: number; // minute until which she is out of reach (behind the back room door)
  momentsSeen?: string[]; // "patron:moment" that already happened tonight
  groupAt?: number; // minute a company walks in
  group?: { pending?: number; ignored?: number; kind: string; size: number; lead: string; until: number; heat: number; nextTray: number; rounds: number; bill: number; wants?: number; herOut?: number; sauna?: boolean }; // the company in the back room
  tableSat?: number;
  tableWith?: string[];
}

export interface Ledger {
  day: number;
  income: number;
  tips: number;
  rent: number;
  interest: number;
  supplies: number;
  served: number;
  turnedAway: number;
}

export interface BaseState {
  daysPlayed: number;
  money: number;
  debt: number;
  reputation: number; // 0..100
  stock: number; // servings left
  purse: number; // her own money
  purseShare: number; // share of her tips she keeps, 0..1
  purseToday: number;
  heroine: Heroine;
  patrons: Record<string, Patron>;
  nextPatron: number;
  shift: Shift | null;
  encounter: Encounter | null;
  proposals: ProposalRecord[]; // newest last, short history
  husband: Husband;
  mode: Mode;
  suspicion: number; // 0..100, only matters while hidden
  power: number; // her power over him, 0..100, grows once it is open
  denied: number; // nights in a row he got nothing
  secretKnows: boolean; // he found out and she does not know that he knows
  caught: { patron: string; act: string } | null; // he has just walked in on them and has to choose
  secretActsToday: number;
  night: { scene: string; asked: boolean; sex: BedScene | null; here?: "here" | "public"; third?: string; wants?: boolean; selfAsked?: boolean; counter?: string; minute?: number; herAsleep?: number; woken?: boolean; refused?: string; pressed?: boolean; after?: string; fin?: string } | null; // what is going on in the bedroom tonight
  phone: import("./systems/phone").PhoneState;
  directive: Directive; // how he asked her to behave tonight
  expect: Record<string, number>; // act id -> what she thinks he allows, -100..100; absent = no idea
  told: { day: number; key: string; params?: Record<string, string | number> }[]; // what he has said or shown, newest last
  day: { left: number; done: string[]; arrivals: number; herOut?: boolean; busy?: { id: string; left: number; spent?: number }; her?: { task: string; left: number }; tripped?: boolean; cover?: string; coverSeen?: boolean } | null; // this afternoon: minutes left, what is done, tonight's extra flow
  clean: number; // 0..100, how the room looks
  owned: string[]; // outfits she has
  toys: string[];
  upgrades: string[];
  billBonus: number; // share added to every bill by upgrades
  sentUp?: number; // the day he last sent her up to a lodger
  stayedUp?: { day: number; patron: string; act: string; tells: string }; // she did not come back before morning
  lodgers: Record<string, { patron: string; nights: number }>; // hotel room -> who stays there
  changed: { from: string; by: string | null } | null; // she changed mid-shift: what she wore before and who asked (null = her own idea)
  gossip: number; // 0..100, what the town says about her
  loan: { dueDay: number; paid: boolean; missed: number; visitsLeft: number; forgiven: number }; // the instalment schedule
  kissedAfter?: number; // the minute of the shift she last kissed him straight after another man
  retroDay?: number; // the day she last asked him about a guest
  approach: { kind: string; patron?: string; public: boolean; at?: number; act?: string } | null; // she has come to him with something and waits for an answer
  approached: Record<string, number>; // kind -> last day she came with it
  pushedToday: Record<string, number>; // guest -> how hard he pushed her today
  sizeToday?: number; // the biggest guest she has had today, cm
  diary?: { day: number; with: Record<string, Record<string, number>>; seen: Record<string, boolean>; came: number; cameHim?: number }[]; // what happened, by day and by man
  tally?: { acts: Record<string, number>; partners: Record<string, number>; came: number };
  thoughtAt?: number;
  deal?: { patron: string; act: string; price: number; tick: number }; // a guest has come to him with money and waits
  wishes?: string[]; // what he said he wants from her and still stands
  wishStr?: Record<string, number>; // how fresh each of those is, 0..100: said again it is topped up, left alone it fades
  wishRun?: Record<string, { n: number; day: number; times?: number }>; // days running each wish has been said
  perm?: Record<string, "allow" | "forbid">; // single things he allowed or forbade
  ask?: { patron: string; act: string; tick?: number }; // she is asking him before she says yes
  askWhy?: { patron: string; act: string }; // he said no and she wants to know why
  asksToday?: number;
  stanceSaid?: string[];
  dared?: string[];
  daresToday?: number;
  aboutSaid?: number;
  promises?: { kind: string; day: number; due: number; topic?: string }[];
  ignoredHer?: boolean;
  ignoredSaid?: number;
  reachedDay?: number;
  weather?: string;
  wakeAt?: number; // hour he sleeps till tonight, when it is not the usual one
  slept?: { him: number; her: number }; // hours each of them got last night
  sentWash?: string;
  walkedIn?: number;
  washedWith?: number;
  promised?: number; // day she teased him: she will want him that night
  remarked: string[]; // things she has already said once about her body, his, and other men
  complaint: string | null; // what she has brought up tonight and he has not answered yet
  complainedDay: number;
  wantsBare?: number; // 0..100: how sure she is that he wants her seen without her underwear
  orders: string[]; // single things about her dress he asked for tonight and she agreed to
  ordersAsked: string[];
  memories: { id: string; day: number; key: string; params?: Record<string, string | number>; seen: boolean }[]; // firsts, dated
  talked: string[]; // what he already said or did with her today, repeats included
  bag?: { kind: "outfit" | "toy"; id: string }[]; // bought without her: not hers until he gives it to her
  dayTop: { act: string; patron: string; seen: boolean } | null; // the furthest it went with a guest today
  reaction: { patron: string; act: string; reacted: boolean } | null; // something is happening in front of him right now
  outfitAsked: boolean;
  bareTimes?: number; // times she has undressed when asked: it gets easier
  bareRefused?: string; // "day:phase" of her last no: he does not ask again until later
  bareOwn?: boolean; // she came down like that on her own
  today: Ledger;
  history: Ledger[]; // last days, newest last
  /** How she took the last thing asked of her: shown as a card under the scene. Drives nothing. */
  outcome?: { turn: number; day: number; minute: number; how: "wants" | "agrees" | "unsure" | "away" | "upset"; who: string; seen: boolean };
  /** For the inspector: the reasons numbers moved during the last action. Drives nothing. */
  trace?: { turn: number; why: { k: string; r: string; a: number }[] };
}

export const bs = (state: GameState): BaseState => state.mods[BASE_ID] as BaseState;
export const clamp = (v: number, min = 0, max = 100) => Math.min(max, Math.max(min, v));
export const emptyLedger = (day: number): Ledger => ({
  day,
  income: 0,
  tips: 0,
  rent: 0,
  interest: 0,
  supplies: 0,
  served: 0,
  turnedAway: 0,
});
