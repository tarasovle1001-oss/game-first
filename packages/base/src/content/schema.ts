// Shape of the YAML content. The build tool validates files against these schemas,
// the game imports only the inferred types.
import { z } from "zod";

const id = z.string().regex(/^[a-z][a-z0-9_.]*$/, "lowercase id: letters, digits, _ and .");
const range = z.tuple([z.number(), z.number()]).refine(([a, b]) => a <= b, "range must be [min, max]");

export const roomSchema = z
  .object({
    id,
    links: z.array(id),
    tags: z.array(z.string()).default([]),
    map: z.object({ x: z.number().int(), y: z.number().int(), w: z.number().int().min(1), h: z.number().int().min(1) }),
  })
  .strict();

export const zoneFileSchema = z.object({ zone: id, rooms: z.array(roomSchema).min(1) }).strict();

export const patronTypeSchema = z
  .object({
    id,
    weight: z.number().positive(), // how often this type walks in
    age: range.refine(([min]) => min >= 18, "all characters are adults: age must start at 18+"),
    builds: z.array(z.enum(["slim", "average", "athletic", "heavy"])).min(1),
    size: range, // cm
    stamina: range, // rounds in a row
    traits: z
      .object({ persistence: range, charm: range, honesty: range, jealousy: range, generosity: range })
      .strict(),
    // how he pursues: relative weights
    approach: z.object({ court: z.number().min(0), drink: z.number().min(0), pay: z.number().min(0), push: z.number().min(0) }).strict(),
    onRefusal: z.enum(["backs_off", "insists", "sulks", "leaves"]),
    spend: range, // money per order
  })
  .strict();

export const nameSchema = z.object({ en: z.string().min(1), ru: z.string().min(1) }).strict();

export const balanceSchema = z
  .object({
    start: z.object({ money: z.number(), debt: z.number().min(0), reputation: z.number().min(0).max(100), stock: z.number().int().min(0) }).strict(),
    rentPerDay: z.number().min(0),
    debtInterestPerDay: z.number().min(0), // fraction, 0.01 = 1%
    supplies: z.object({ packCost: z.number().positive(), packServings: z.number().int().positive() }).strict(),
    heroine: z.object({ arousalCoolPerTick: z.number().min(0), moodSettlePerTick: z.number().min(0).max(1), soberPerTick: z.number().min(0) }).strict(),
    // clock: minute of the day each phase starts at (for the log and the top bar)
    clock: z.object({ prep: z.number().int(), night: z.number().int(), summary: z.number().int() }).strict(),
    shift: z
      .object({
        opensAt: z.number().int().min(0).max(23), // hour
        hours: z.number().positive(),
        minutesPerTick: z.number().int().positive(),
        seats: z.number().int().positive(),
        arrivalsPerHour: z.number().min(0), // expected new guests per hour at reputation 50
        stayMinutes: range,
        orderEveryMinutes: z.number().positive(), // a guest wants a new order this often
        maxWaitMinutes: z.number().positive(), // he walks out after waiting this long
        energyPerServe: z.number().min(0),
        regularAfterVisits: z.number().int().positive(),
        returnChance: z.number().min(0).max(1), // chance that an arriving guest has been here before
      })
      .strict(),
  })
  .strict();

export const actSchema = z
  .object({
    id,
    tier: z.number().int().min(0),
    base: z.number(),
    scene: id,
    place: z.enum(["public", "private"]),
    effects: z.object({ arousal: z.number(), mood: z.number(), energy: z.number(), interest: z.number(), affinity: z.number() }).strict(),
    minutes: z.number().int().min(0), // how long it takes; 0 = happens in passing
    tip: z.number().min(0),
    zones: z.array(z.enum(["mouth", "vagina", "anus", "hands"])),
  })
  .strict();

export const POSES = ["stand", "sit", "kneel", "lie_back", "lie_front", "bend", "all_fours", "straddle"] as const;
export const sceneSchema = z
  .object({
    id,
    figures: z
      .array(z.object({ role: z.string(), pose: z.enum(POSES), x: z.number(), y: z.number().default(0), flip: z.boolean().default(false) }).strict())
      .min(1),
  })
  .strict();

export const consentSchema = z
  .object({
    eagerAt: z.number(), // total >= this: she is glad to
    hesitantAt: z.number(), // total >= this: she agrees, reluctantly; below: refusal
    proposalsPerTick: z.number().int().positive(),
    askChancePerHour: z.number().min(0), // base chance that a guest makes a move within an hour
    askChancePerInterest: z.number().min(0), // added per point of his interest
    // row weights
    arousal: z.number(),
    drunk: z.number(),
    mood: z.number(),
    openness: z.number(),
    fidelity: z.number(),
    libido: z.number(),
    affinity: z.number(),
    charm: z.number(),
    familiar: z.number(), // bonus when she has already done this with him
    jumpPerTier: z.number(), // penalty per tier skipped on the ladder with him
    witnesses: z.number(),
    husbandWatching: z.number(),
    money: z.number(),
    pressure: z.number(),
    tired: z.number(),
    satisfied: z.number(), // she has just had her fill
    size: z.number(), // per cm of his size above what she takes comfortably, intimate acts only
    sizeCap: z.number(),
    desire: z.number(), // husband only: her desire for him
    resent: z.number(), // husband only: her resentment
    // how fast her character moves when she says yes
    drift: z.object({ openness: z.number(), fidelity: z.number(), confidence: z.number() }).strict(),
  })
  .strict();

const zoneFit = z.object({ base: z.number().positive(), perStretch: z.number().min(0) }).strict();
export const bodySchema = z
  .object({
    // the size (cm) a zone takes comfortably = base + stretch * perStretch
    fit: z.object({ vagina: zoneFit, anus: zoneFit, mouth: zoneFit }).strict(),
    stretchPerCm: z.number().min(0), // stretch gained per cm above the comfortable size
    recoverPerDay: z.number().min(0),
    permanentShare: z.number().min(0).max(1), // part of the peak stretch that never goes back
    skillGain: z.number().min(0), // per practice, shrinking as the skill grows
    orgasmAt: z.number(), // climax meter needed for her to come
    satisfiedCoolPerTick: z.number().min(0),
    sizeTasteGain: z.number().min(0), // taste for size gained per orgasm with someone bigger than her husband
    husband: z
      .object({
        size: z.number().positive(),
        stamina: z.number().int().positive(),
        minutes: z.number().positive(), // how long he lasts
        style: z.enum(["naive", "jealous", "encouraging"]),
        foreplay: z.number().min(0), // arousal she gets from him per point of her desire for him
        desire: z.number().min(0).max(100), // her desire for him at the start
        resent: z.number().min(0).max(100),
      })
      .strict(),
  })
  .strict();

export const secrecySchema = z
  .object({
    styleFactor: z.object({ naive: z.number(), jealous: z.number(), encouraging: z.number() }).strict(), // how fast each husband gets suspicious
    sawPublicPerTier: z.number(), // he watched something on the floor
    sawThemLeave: z.number(), // he saw her walk off with a guest
    tracePerSecretAct: z.number(), // traces of what he did not see, counted at the end of the day
    fadePerDay: z.number(),
    confrontAt: z.number(), // suspicion at which he may confront her at night
    confessHonesty: z.number(), // her honesty needed to admit it
    // open mode
    watchingByStyle: z.object({ naive: z.number(), jealous: z.number(), encouraging: z.number() }).strict(), // consent row when he watches and knows
    powerPerSeen: z.number(),
    powerPerTold: z.number(),
    powerRow: z.number(), // consent weight of her power over him
    powerDenies: z.number(), // how much her power makes her refuse her husband
  })
  .strict();

export const phoneSchema = z
  .object({
    numberAtTier: z.number().int(), // how far things must have gone before he asks for her number
    numberAffinity: z.number(),
    textChance: z.number().min(0).max(1), // per day, per man who has her number
    replyAffinity: z.number(), // she answers from this affinity up; warmly from twice that
    comingTonightChance: z.number().min(0).max(1),
    expectedArrivesAtTick: z.number().int().positive(),
    peekMild: z.number(),
    peekWarm: z.number(),
    peekNoticedChance: z.number().min(0).max(1),
    callIgnored: z.number(),
    callBreathless: z.number(),
    buttDialChance: z.number().min(0).max(1),
    buttDial: z.number(),
  })
  .strict();
export type PhoneTuning = z.infer<typeof phoneSchema>;

export type Room = z.infer<typeof roomSchema> & { zone: string };
export type PatronType = z.infer<typeof patronTypeSchema>;
export type Balance = z.infer<typeof balanceSchema>;
export type NameEntry = z.infer<typeof nameSchema>;
export type Act = z.infer<typeof actSchema>;
export type SceneLayout = z.infer<typeof sceneSchema>;
export type ConsentTuning = z.infer<typeof consentSchema>;
export type BodyTuning = z.infer<typeof bodySchema>;
export type SecrecyTuning = z.infer<typeof secrecySchema>;

export interface Content {
  rooms: Room[];
  patronTypes: PatronType[];
  names: NameEntry[];
  balance: Balance;
  acts: Act[];
  scenes: SceneLayout[];
  consent: ConsentTuning;
  body: BodyTuning;
  secrecy: SecrecyTuning;
  phone: PhoneTuning;
  locales: Record<string, Record<string, string>>;
}
