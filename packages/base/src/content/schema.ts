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
    sees: z.array(id).default([]), // rooms in plain view from here (the bar looks onto the hall)
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
    rentGrowthPerWeek: z.number().min(0),
    // what she keeps of the tips men leave her: the options offered, the default, and how each sits with her (mood per day)
    purse: z.object({ shares: z.array(z.number().min(0).max(1)).min(1), start: z.number().min(0).max(1), moodAtNone: z.number(), moodAtAll: z.number(), actTipScale: z.number().min(0) }).strict(),
    // things break, and an unwatched till gets robbed
    trouble: z
      .object({
        breakdownChancePerDay: z.number().min(0).max(1),
        breakdownCost: range,
        tillTheftChancePerTick: z.number().min(0).max(1), // while she is in a back room and he cannot see the hall
        tillTheftShare: range, // percent of tonight's takings
      })
      .strict(),
    debtLimit: z.number().min(0), // supplies can be bought on credit until the debt reaches this
    debtInterestPerDay: z.number().min(0), // fraction, 0.01 = 1%
    supplies: z.object({ packCost: z.number().positive(), packServings: z.number().int().positive() }).strict(),
    heroine: z.object({ arousalCoolPerTick: z.number().min(0), moodSettlePerTick: z.number().min(0).max(1), soberPerTick: z.number().min(0) }).strict(),
    // clock: minute of the day each phase starts at (for the log and the top bar)
    clock: z.object({ prep: z.number().int(), night: z.number().int(), summary: z.number().int() }).strict(),
    loan: z.object({ everyDays: z.number().int().positive(), firstDueDay: z.number().int().positive(), share: z.number(), min: z.number(), lateFee: z.number(), visitsAfterMiss: z.number().int(), forgivePerTier: z.number(), consent: z.number(), suspicion: z.number(), lender: z.object({ size: z.number(), persistence: z.number(), generosity: z.number(), interest: z.number(), arrivesAtTick: z.number().int() }).strict() }).strict(),
    hotel: z.object({ roomPrice: z.number(), takeChance: z.number().min(0).max(1), returningChance: z.number().min(0).max(1), nights: z.tuple([z.number().int().positive(), z.number().int().positive()]), comesDownAtTick: z.number().int(), nightVisitTier: z.number().int(), towels: z.object({ interest: z.number(), chance: z.number().min(0).max(1), maxTier: z.number().int(), hoursAffinity: z.number(), hoursChance: z.number().min(0).max(1), hoursEnergy: z.number(), hoursSuspicion: z.number(), hoursPower: z.number() }).strict() }).strict(),
    shift: z
      .object({
        opensAt: z.number().int().min(0).max(23), // hour
        hours: z.number().positive(),
        minutesPerTick: z.number().int().positive(),
        seats: z.number().int().positive(),
        arrivalsPerHour: z.number().min(0), // expected new guests per hour at reputation 50
        stayMinutes: range,
        billFactor: z.number().positive(),
        orderEveryMinutes: z.number().positive(), // a guest wants a new order this often
        maxWaitMinutes: z.number().positive(), // he walks out after waiting this long
        energyPerServe: z.number().min(0),
        regularAfterVisits: z.number().int().positive(),
        returnChance: z.number().min(0).max(1), // chance that an arriving guest has been here before
        // where the husband spends the evening changes what the cafe earns
        serveMinutes: z.number().int().positive(), // how long one order keeps her busy
        husbandServeMinutes: z.number().int().positive(), // his own time when he takes a table himself
        husbandInKitchenBill: z.number().min(0), // share added to every bill while he cooks
        husbandAtBarTip: z.number().min(0), // share added to tips while he pours
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
    only: z.enum(["husband"]).optional(), // an act that only happens in the marriage bed
    motives: z.array(z.enum(["affection", "giving", "power"])).optional(), // why she does it, when her own body is not the point
  })
  .strict();

export const POSES = ["stand", "sit", "kneel", "kneel_sit", "lie_back", "lie_open", "lie_front", "lie_side", "bend", "all_fours", "straddle", "squat"] as const;
const limbSchema = z.union([z.tuple([z.number(), z.number()]), z.object({ to: z.union([z.string(), z.tuple([z.number(), z.number()])]), dx: z.number().optional(), dy: z.number().optional(), bend: z.union([z.literal(1), z.literal(-1)]).optional() }).strict()]);
const propSchema = z.object({ len: z.number().optional(), angle: z.number().optional(), to: z.string().optional(), dx: z.number().optional(), dy: z.number().optional(), hand: z.enum(["R", "L"]).optional(), from: z.string().optional(), curve: z.number().optional(), then: z.string().optional() }).strict();
export const sceneSchema = z
  .object({
    id,
    figures: z
      .array(
        z
          .object({
            role: z.string(), pose: z.enum(POSES), x: z.number(), y: z.number().default(0), flip: z.boolean().default(false),
            scale: z.number().optional(), torso: z.number().optional(), head: z.number().optional(),
            armR: limbSchema.optional(), armL: limbSchema.optional(), legR: limbSchema.optional(), legL: limbSchema.optional(),
            penis: z.union([z.boolean(), propSchema]).optional(), toy: propSchema.optional(),
          })
          .strict(),
      )
      .min(1),
  })
  .strict();

export const consentSchema = z
  .object({
    eagerAt: z.number(), // total >= this: she is glad to
    hesitantAt: z.number(), // total >= this: she agrees, reluctantly; below: refusal
    hesitantYesAtZero: z.number().min(0).max(1), // chance she says yes at the very bottom of the hesitant zone; 1 at its top
    inPlainSight: z.number(), // intimate acts on the cafe floor instead of a back room
    // what she thinks her husband allows (-100 = he made clear he does not want it, +100 = he said yes)
    expect: z
      .object({
        unknown: z.number(), // where an act she has no idea about sits on that scale
        ignoreGain: z.number(), // he watched and said nothing
        ignoreCap: z.number(), // silence alone never makes her sure
        approve: z.number(), // he told her he does not mind
        forbid: z.number(), // he stepped in
        forbidHigher: z.number(), // ...which also tells her about everything beyond it
        friendly: z.number(), // "be nice to the guests", for the light acts
        reserved: z.number(), // "keep your distance", for everything
        behindBack: z.number(), // weight of a believed "no" when he is not looking (times how honest she is)
        permission: z.number(), // bonus of a believed "yes" anywhere
      })
      .strict(),
    guest: z
      .object({
        drunkPerTick: z.number(), boldDrunk: z.number(), boldHeat: z.number(), boldBonus: z.number(), deafDrunk: z.number(), deafChance: z.number(), sloppyFrom: z.number(), sloppy: z.number(),
        heatPerInterest: z.number(), heatBare: z.number(), heatTouched: z.number(), heatCool: z.number(), heatAsks: z.number(), heatFinish: z.number(), heatAfter: z.number(),
        rewardAffinity: z.number(), rewardPaid: z.number(), rewardRough: z.number(), rewardEnough: z.number(), rewardBetter: z.number(), boredLimit: z.number(),
        her: z.object({ perShift: z.number(), arousalFrom: z.number(), perArousal: z.number(), perFrustration: z.number(), perDrunk: z.number(), perResent: z.number(), trait: z.number(), urgeFrom: z.number(), chancePerMinute: z.number(), maxChance: z.number(), pullFrom: z.number(), traitPull: z.number(), margin: z.number(), interest: z.number() }).strict(),
      })
      .strict(),
    scene: z
      .object({
        tryEvery: z.tuple([z.number().int().positive(), z.number().int().positive()]),
        goingBonus: z.number(),
        maxMinutes: z.number().int().positive(),
        maxMinutesRoom: z.number().int().positive(),
        restMinutes: z.number().int().min(0),
        patronCooldown: z.number().int().min(0),
        skipMargin: z.number(),
        herRate: z.number(),
        stayLimit: z.number().int().positive(),
        endBelow: z.number(),
        continueChance: z.number().min(0).max(1),
        likeChance: z.number().min(0).max(1),
        pushed: z.number(),
        pushedTooFar: z.number(),
        fedUpAfter: z.number().int(),
        fedUpPer: z.number(),
        fedUpMax: z.number(),
        leaveSuspicion: z.number(),
      })
      .strict(),
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
    frustrated: z.number(), // per point of piled-up frustration, with guests
    satisfied: z.number(), // she has just had her fill
    size: z.number(), // per cm of his size above what she takes comfortably, intimate acts only
    sizeCap: z.number(),
    pity: z.number(),
    pityMax: z.number(),
    stranger: z.number(),
    strangerBelow: z.number(),
    sizeHusband: z.number(),
    marital: z.number(), // husband only: flat, he is her husband
    desire: z.number(), // husband only: her desire for him
    resent: z.number(), // husband only: her resentment
    // how fast her character moves when she says yes
    drift: z.object({ openness: z.number(), fidelity: z.number(), confidence: z.number(), husbandSize: z.number(), husbandSizeGap: z.number() }).strict(),
  })
  .strict();

export const nightSchema = z
  .object({
    restlessArousal: z.number(), // she cannot sleep above this arousal when the evening left her unsatisfied
    selfChance: z.number().min(0).max(1), // she takes care of herself in the bathroom
    slipOutChance: z.number().min(0).max(1), // she goes to a lover instead, if she has one
    slipOutFidelityBelow: z.number(),
    husbandWakesChance: z.number().min(0).max(1),
    wakesSuspicion: z.number(),
    wants: z.object({ arousal: z.number(), desire: z.number(), energy: z.number(), consent: z.number(), declineDesire: z.number(), declineResent: z.number() }).strict(),
    work: z.number(),
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
    his: z.object({ fitBase: z.number(), fitPerStretch: z.number(), tooBig: z.number(), powerPerPegging: z.number(), peggingHerBase: z.number(), peggingHerPerPower: z.number(), practice: z.number(), fingerSize: z.number(), fistSize: z.number(), rimmingRate: z.number(), power: z.record(z.string(), z.number()), herShare: z.record(z.string(), z.number()), hisShare: z.record(z.string(), z.number()) }).strict(),
    sizeClasses: z.tuple([z.number(), z.number(), z.number(), z.number()]),
    night: nightSchema,
    // the bedroom scene, turn by turn: both of them have a pleasure meter 0..100
    bed: z
      .object({
        minutesPerTurn: z.number().int().positive(),
        startHis: z.number(),
        hisRate: z.number(), // per turn for a husband who lasts 12 minutes
        hisRateSex: z.number(),
        hersRate: z.number(),
        faster: z.tuple([z.number(), z.number()]), // multipliers [his, hers]
        slower: z.tuple([z.number(), z.number()]),
        talk: z.tuple([z.number(), z.number()]), // flat gains [his, hers]
        kiss: z.tuple([z.number(), z.number()]),
        undress: z.number(), // her gain per piece of clothing, once each
        cumAt: z.number(), // he can let go from here
        herCloseAt: z.number(), // if she is this far when he finishes, it tips her over
        afterOrgasm: z.number(), // her meter after she comes
        looseForHim: z.number().min(0).max(1), // what he still feels in a wife stretched far beyond his size
        looseNoneAt: z.number(),
        selfResent: z.number(),
        counter: z.object({ power: z.number(), confidence: z.number(), sizeTaste: z.number(), maxResent: z.number(), chance: z.number(), peggingPower: z.number() }).strict(),
        looseFullAt: z.number(),
        handRate: z.number(),
        reward: z
          .object({ affection: z.number(), giving: z.number(), power: z.number(), cruel: z.number(), enough: z.number(), limit: z.number(), better: z.number(), lovingDesire: z.number(), lovingOut: z.number().min(0).max(1), dropChance: z.number().min(0).max(1) })
          .strict(),
        soft: z.object({ whenOut: z.number(), whenLoose: z.number(), perResent: z.number(), belowHis: z.number() }).strict(),
        unluckyStart: z.number(),
        deniedStart: z.number(), // added to his start per night he has gone without
        switchBonus: z.number(), // consent bonus for changing what they do once it is going
      })
      .strict(),
    sizeTasteGain: z.number().min(0), // taste for size gained per orgasm with someone bigger than her husband
    husband: z
      .object({
        size: z.number().positive(),
        stamina: z.number().int().positive(),
        minutes: z.number().positive(), // how long he lasts
        style: z.enum(["naive", "jealous", "encouraging"]),
        prematureChance: z.number().min(0).max(1), // any night, on top of everything else
        prematureChancePerDeniedNight: z.number().min(0),
        shorterPerDeniedNight: z.number().min(0), // share of his minutes lost per night he has gone without
        skillHalvesAt: z.number().positive(), // her skill at which he lasts half as long
        tooSoonBelow: z.number(), // minutes: below this he finishes before it starts
        prematureBelow: z.number(), // minutes: below this it is over almost at once
        fakesBelowHonesty: z.number(), // she fakes it when her honesty is below this
        finishesHerselfAtLibido: z.number(),
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
    heardNextDoor: z.number(), // he was next door and heard something
    oddTips: z.number(), // tips do not match the evening
    oddTipsShare: z.number(), // tips above this share of the sales look odd
    guiltyLook: z.number(), // at home she cannot look him in the eye (the more honest she is, the more it shows)
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
    // nights when she takes the lead: power needed for each, and how often it happens
    lead: z.object({ tease: z.number(), facesit: z.number(), ignore: z.number(), chancePerPower: z.number().min(0) }).strict(),
    gossip: z.object({ fromTier: z.number().int(), perTier: z.number(), braggart: z.number(), noticeFrom: z.number(), interest: z.number(), arrivals: z.number(), reachesHusband: z.number(), suspicion: z.number(), fadePerDay: z.number() }).strict(),
  })
  .strict();

const pct = z.number().min(0).max(100);
export const presetSchema = z
  .object({
    id,
    traits: z.object({ openness: pct, confidence: pct, fidelity: pct, honesty: pct, libido: pct }).strict(),
    sizeTaste: pct,
    latents: z.array(id), // always present with this preset; the rest are rolled as usual unless "noRandomLatents"
    noRandomLatents: z.boolean().default(false),
  })
  .strict();
export type Preset = z.infer<typeof presetSchema>;

export const outfitSchema = z
  .object({
    id,
    order: z.number().int(), // from modest to revealing
    allure: z.number().min(0), // interest a guest gets just from seeing her
    tip: z.number().min(0), // share added to tips
    openness: z.number().min(0).max(100), // she wears it on her own from this openness up
    price: z.number().min(0), // 0 = hers from the start, otherwise bought in town
  })
  .strict();
export const daySchema = z
  .object({
    minutes: z.number().int().positive(),
    dirtPerServed: z.number().min(0),
    cleanStart: z.number().min(0).max(100),
    clean: z.object({ tipShare: z.number(), dirtyBelow: z.number(), dirtyReputation: z.number() }).strict(),
    activities: z.array(
      z
        .object({
          id,
          minutes: z.number().int().positive(),
          cost: z.number().optional(),
          money: z.number().optional(),
          clean: z.number().optional(),
          arrivals: z.number().optional(), // share added to tonight's flow of guests
          at: z.string().optional(), // "cafe" (anywhere at home) or the one room in town where it is done
          withHer: z.boolean().optional(), // needs her to be around this afternoon
          stock: z.number().optional(),
          gossip: z.boolean().optional(), // he hears what the town says about her
          gym: z.enum(["alone", "together"]).optional(),
          energy: z.number().optional(), // what it takes out of him (negative: gives back)
          her: z.record(z.enum(["mood", "arousal", "energy", "drunk", "desire", "resent"]), z.number()).optional(),
        })
        .strict(),
    ),
    herDay: z
      .object({
        walkToTown: z.number().int().positive(), walkInTown: z.number().int().positive(), awayMinutes: z.number().int().positive(), trips: z.array(id).min(1), tripChance: z.number().min(0).max(1), tripMinutes: z.tuple([z.number().int().positive(), z.number().int().positive()]), notThereSuspicion: z.number(),
        tasks: z.array(z.object({ id, loc: id, minutes: z.tuple([z.number().int().positive(), z.number().int().positive()]), clean: z.number().optional(), her: z.record(z.enum(["mood", "energy", "arousal"]), z.number()).optional() }).strict()).min(2),
      })
      .strict(),
    gym: z.object({ fitness: z.number(), minutesPerSession: z.number(), minutesMax: z.number(), herDesireSteps: z.array(z.number()), herDesire: z.number(), lockerChance: z.number(), meetChance: z.number(), meetAffinity: z.number(), maxTier: z.number().int(), lateSuspicion: z.number() }).strict(),
    shop: z
      .object({
        toys: z.array(z.object({ id, size: z.number().positive(), price: z.number().positive() }).strict()),
        toyStretchAbove: z.number(),
        toySatisfied: z.number().min(0).max(100),
        gigolo: z
          .object({ price: z.number(), size: z.number(), minutes: z.number(), fidelityBelow: z.number(), sizeTasteFrom: z.number(), chance: z.number().min(0).max(1), suspicion: z.number() })
          .strict(),
        herOutfitMargin: z.number(),
        affair: z.object({ fidelityBelow: z.number(), affinity: z.number(), chance: z.number().min(0).max(1), minutes: z.number().int(), suspicion: z.number() }).strict(),
      })
      .strict(),
    upgrades: z.array(z.object({ id, cost: z.number().positive(), bill: z.number().optional(), tip: z.number().optional(), reputation: z.number().optional() }).strict()),
    world: z
      .object({
        weekdays: z.array(z.number()).length(7),
        weather: z.array(z.object({ id, weight: z.number().positive(), arrivals: z.number() }).strict()).min(1),
        famePerRegular: z.number(),
        famePerDay: z.number(),
        fameArrivals: z.number(),
        fameTiers: z.array(z.tuple([z.number(), z.string()])).min(1),
      })
      .strict(),
    rhythm: z
      .object({
        wake: z.array(z.number().int().min(5).max(14)).min(1), // hours he may sleep till; the first is what happens by default
        herWake: z.number().int(),
        energyPerHour: z.object({ him: z.number(), her: z.number() }).strict(),
        herBedtime: z.number().int(), // minutes after midnight she falls asleep if nothing keeps her up
        wakeHer: z.object({ consent: z.number(), annoy: z.number(), mood: z.number() }).strict(),
        nightWaits: z.array(z.number().int().positive()).min(1),
        nightCosts: z.object({ ask: z.number().int(), turn: z.number().int(), self: z.number().int(), talk: z.number().int() }).strict(),
        him: z
          .object({
            start: z.object({ energy: z.number(), mood: z.number(), arousal: z.number() }).strict(),
            moodRest: z.number(),
            arousalRest: z.number(),
            settle: z.number(), // share of the way back to rest each morning
            shiftPerTick: z.number(),
            serve: z.number(),
            bed: z.number(), // energy a night in bed takes
            tiredBelow: z.number(), // below this he cannot take tables or start work
            tiredMood: z.number(),
            softTired: z.number(), // added chance of going soft when tired
            arousal: z.object({ watch: z.number(), bare: z.number(), touch: z.number(), carried: z.number(), startHis: z.number() }).strict(),
            mood: z.object({ came: z.number(), refused: z.number(), talkLow: z.number(), talkHigh: z.number(), toHer: z.number() }).strict(),
          })
          .strict(),
        worry: z.object({ cashBelow: z.number(), debtFrom: z.number(), mood: z.number(), hardDebt: z.number(), hardMood: z.number(), herShare: z.number() }).strict(),
        bath: z.object({ washMinutes: z.number().int(), washMood: z.number(), sendMinutes: z.number().int(), sendAnnoy: z.number(), walkIn: z.object({ margin: z.number(), arousal: z.number(), annoy: z.number() }).strict() }).strict(),
      })
      .strict(),
  })
  .strict();
export type DayTuning = z.infer<typeof daySchema>;
export const latentSchema = z.object({ id, chance: z.number().min(0).max(1), strength: z.number() }).strict();
export const mannersSchema = z
  .object({
    // what the husband asked her to be like tonight: consent shift with guests and share added to tips
    directives: z.record(z.enum(["reserved", "natural", "friendly"]), z.object({ consent: z.number(), maxTier: z.number().int(), tip: z.number() }).strict()),
    askOutfitBonus: z.number(), // how much his asking lowers the openness an outfit needs
    orders: z.array(z.object({ id, openness: z.number(), allure: z.number(), tip: z.number(), arousal: z.number(), consent: z.number() }).strict()),
    change: z
      .object({ chancePerTick: z.number(), arousalFrom: z.number(), drunkFrom: z.number(), margin: z.number(), guestInterest: z.number(), guestChance: z.number(), guestMargin: z.number(), suspicion: z.number(), backResent: z.number() })
      .strict(),
    // small things between the two of them, each once a day
    talk: z
      .object({
        options: z.array(
          z
            .object({
              id,
              group: z.enum(["chat", "touch"]),
              effects: z.record(z.enum(["mood", "arousal", "energy", "drunk", "desire", "resent"]), z.number()),
              needs: z.object({ stat: z.string(), min: z.number(), publicExtra: z.number().optional() }).strict().optional(),
              fail: z.record(z.enum(["mood", "arousal", "energy", "drunk", "desire", "resent"]), z.number()).optional(),
              phases: z.array(z.string()).optional(),
              stock: z.number().optional(),
            })
            .strict(),
        ),
        // what he can say "go on" or "don't" about, by act tier (inclusive)
        groups: z.array(z.object({ id, tiers: z.tuple([z.number().int(), z.number().int()]) }).strict()),
        bare: z
          .object({
            need: z.record(z.enum(["bedroom", "private", "hall"]), z.object({ top: z.number(), bottom: z.number(), all: z.number() }).strict()),
            perShowTaste: z.number(), night: z.number(), exhibitionist: z.number(), perArousal: z.number(), perDrunk: z.number(), perDesire: z.number(), perTime: z.number(), habitMax: z.number(),
            shy: z.number(), offended: z.number(), refuseResent: z.number(), backResent: z.number(),
            openness: z.object({ private: z.number(), hall: z.number() }).strict(),
            allure: z.object({ top: z.number(), bottom: z.number(), all: z.number() }).strict(),
            tip: z.object({ top: z.number(), bottom: z.number(), all: z.number() }).strict(),
            consent: z.object({ top: z.number(), bottom: z.number(), all: z.number() }).strict(),
            gossip: z.object({ top: z.number(), bottom: z.number(), all: z.number() }).strict(),
            arousalPerTick: z.number(), ownMargin: z.number(), ownChance: z.number().min(0).max(1),
          })
          .strict(),
        her: z
          .object({
            harassedAt: z.number(), harassedHonesty: z.number(), maxResent: z.number(),
            comfortMood: z.number(), comfortEnergy: z.number(), teaseArousal: z.number(), teaseDesire: z.number(), affectionDesire: z.number(),
            chance: z.object({ comfort: z.number(), tease: z.number(), affection: z.number() }).strict(),
            ignoredResent: z.number(), declinedResent: z.number(), publicCools: z.number(), remarkHonesty: z.number(),
            protect: z.object({ interest: z.number(), desire: z.number(), resent: z.number() }).strict(),
            endure: z.object({ resent: z.number(), expect: z.number() }).strict(),
            ask: z.object({ arousal: z.number(), openness: z.number(), resent: z.number() }).strict(),
            comfort: z.object({ mood: z.number(), resent: z.number() }).strict(),
            stretchSteps: z.array(z.number()), hisSteps: z.array(z.number()),
          })
          .strict(),
        annoy: z.object({ tired: z.number(), done: z.number(), guestRefused: z.number(), guestHesitant: z.number(), guestEager: z.number(), guestPushed: z.number(), guestPushedFar: z.number(), husbandTouch: z.number(), husbandAsk: z.number(), husbandRefused: z.number(), cameRelief: z.number(), coolShift: z.number(), coolPrep: z.number(), keptOvernight: z.number(), consent: z.number(), strip: z.number(), spillToHim: z.number(), spillToGuests: z.number() }).strict(),
        touchCum: z.object({ from: z.array(id), fromDenied: z.number().int(), base: z.number(), perDenied: z.number(), max: z.number().min(0).max(1) }).strict(),
        complainAt: z.number(),
        complainEveryDays: z.number().int(),
        hear: z.object({ resent: z.number() }).strict(),
        probe: z.object({ resent: z.number() }).strict(),
        pushBack: z.object({ resent: z.number() }).strict(),
        shockFromTier: z.number().int(), // "I do not mind" about things from this tier up hurts a faithful wife
        shockAtFidelity: z.number(),
        confessAtHonesty: z.number(), // asked about the evening, she owns up from this honesty...
        confessUpToTier: z.number().int(), // ...to things up to this tier
      })
      .strict(),
    guest: z
      .object({
        round: z.object({ interest: z.number(), stay: z.number().int(), drunk: z.number() }).strict(),
        encourage: z.object({ tiersAhead: z.number().int(), expect: z.number(), consent: z.number() }).strict(),
        throwOut: z.object({ affinity: z.number(), reputation: z.number() }).strict(),
        joinUpToTier: z.number().int(),
        joinExpect: z.number(),
      })
      .strict(),
    taste: z.object({ came: z.number(), eager: z.number(), hesitant: z.number(), min: z.number(), max: z.number(), typeEager: z.number() }).strict(),
  })
  .strict();
export type Outfit = z.infer<typeof outfitSchema>;
export type Latent = z.infer<typeof latentSchema>;
export type Manners = z.infer<typeof mannersSchema>;

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

const steps = z.array(z.tuple([z.number(), z.string()]));
export const lookSchema = z
  .object({
    marks: z.object({ byAct: z.record(z.string(), z.array(z.string()).min(1)), husbandWhere: z.record(z.string(), z.string()), lasts: z.record(z.string(), z.number().positive()), dripAfter: z.number(), onHim: z.number() }).strict(),
    after: z.record(z.string(), z.number().positive()),
    words: z
      .object({
        outfit: z.record(z.string(), z.string()), bare: z.record(z.string(), z.array(z.string())), panties: z.record(z.string(), z.string()), skirtUp: z.string(),
        mood: z.array(z.object({ when: z.string(), tags: z.array(z.string()) }).strict()), drunk: steps, stretch: z.record(z.string(), steps), sore: z.record(z.string(), steps).default({}),
        cum: z.record(z.string(), z.string()), after: z.record(z.string(), z.string()), size: z.array(z.string()).length(5), man: z.record(z.string(), z.array(z.string())),
        hisCum: z.string(), hisStretch: steps, room: z.record(z.string(), z.string()), act: z.record(z.string(), z.string()),
      })
      .strict(),
  })
  .strict();
export type Look = z.infer<typeof lookSchema>;

export const EMOTIONS = ["anger", "contempt", "guilt", "shame", "longing", "disgust", "fear", "pride", "tenderness", "delight"] as const;
export type Emotion = (typeof EMOTIONS)[number];
const feelings = z.record(z.enum(EMOTIONS), z.number());
export const mindSchema = z
  .object({
    emotions: z.record(z.enum(EMOTIONS), z.object({ fade: z.number().min(0), night: z.number().min(0).max(1) }).strict()),
    showFrom: z.number(),
    consent: z.object({ guest: feelings, husband: feelings }).strict(),
    gain: z.record(z.string(), z.union([feelings, z.number()])),
    thoughts: z.object({ from: z.number(), gap: z.number() }).strict(),
    trust: z.object({ start: z.number(), consent: z.number(), confess: z.number(), change: z.record(z.string(), z.number()) }).strict(),
    attributes: z
      .object({
        spread: z.number().int().min(0),
        charm: z.object({ tipShare: z.number() }).strict(),
        wit: z.object({ guiltyLook: z.number() }).strict(),
        stamina: z.object({ energy: z.number() }).strict(),
        composure: z.object({ annoy: z.number(), feel: z.number() }).strict(),
      })
      .strict(),
    wants: z.object({ hintFrom: z.number() }).strict(),
  })
  .strict();
export type Mind = z.infer<typeof mindSchema>;

const nums = z.record(z.string(), z.number());
export const termsSchema = z
  .object({
    wishes: z.record(z.string(), z.object({ consent: z.number().optional(), upTo: z.number().optional(), tip: z.number().optional(), needs: z.number(), outfit: z.number().optional(), offer: z.number().optional(), seen: z.boolean().optional(), expect: z.number().optional(), expectAll: z.number().optional() }).strict()),
    against: z.record(z.string(), z.array(z.string())),
    wishShock: nums,
    wishGlad: nums,
    staleAfter: z.number().int(),
    staleAnnoy: z.number(),
    items: z.array(z.object({ id, acts: z.array(id).optional(), where: z.array(z.string()).optional() }).strict()),
    cumObeys: z.number(),
    ask: z.object({ maxSure: z.number(), fromTier: z.number(), trust: z.number(), honesty: z.number(), upToTierHidden: z.number(), perDay: z.number(), yes: nums, later: nums, no: nums, explain: nums, because: nums, relent: nums }).strict(),
    stance: z.object({ free: nums, polite: nums, away: nums, hidden: z.number(), likedFrom: z.number(), likedResent: z.number(), praise: nums, own: nums }).strict(),
    dares: z.object({ list: z.array(z.object({ id, act: id.optional(), bare: z.enum(["top", "bottom", "all"]).optional(), margin: z.number().optional() }).strict()), reasons: nums, curiousPerOpenness: z.number(), herPick: z.number(), fromHim: z.number(), perEvening: z.number(), done: nums, refused: nums, flashHeat: z.number(), flashTip: z.number() }).strict(),
    about: z.object({ liked: z.object({ expect: z.number(), arousal: z.number(), shockFidelity: z.number(), shock: nums }).strict(), disliked: nums, never: nums, tell: nums, protect: nums }).strict(),
    promises: z.record(z.string(), z.object({ days: z.number().int(), kept: z.number(), broken: z.number(), contempt: z.number() }).strict()),
    press: z.object({ base: z.number(), perLowConfidence: z.number(), submissive: z.number(), perTrust: z.number(), gaveIn: nums, snapped: nums }).strict(),
    morning: z.object({ ignoredDesire: z.number(), ignored: nums }).strict(),
  })
  .strict();
export type Terms = z.infer<typeof termsSchema>;

export const floorSchema = z
  .object({
    moments: z
      .object({
        chancePerTick: z.number(),
        likeAffinity: z.number(),
        list: z.array(
          z
            .object({
              id,
              when: z.object({ regular: z.boolean().optional(), newcomer: z.boolean().optional(), approach: z.string().optional(), minInterest: z.number().optional(), minDrunk: z.number().optional(), minGenerosity: z.number().optional(), maxGenerosity: z.number().optional(), minAffinity: z.number().optional(), waiting: z.boolean().optional(), noNumber: z.boolean().optional(), pushyNear: z.boolean().optional() }).strict(),
              needOpen: z.number().optional(),
              likeAffinity: z.number().optional(),
              good: nums.optional(),
              bad: nums.optional(),
              secret: nums.optional(), // on top, while she has something to hide
            })
            .strict(),
        ),
      })
      .strict(),
    deal: z.object({ fromTier: z.number(), chance: z.number(), drunkGenerous: z.tuple([z.number(), z.number()]), priceFactor: z.number(), hourFactor: z.number(), raise: z.array(z.number()), acceptPerGenerosity: z.number(), acceptPerInterest: z.number(), wantBonus: z.number(), expires: z.number(), soldTrust: z.number(), soldResent: z.number(), refusedAffinity: z.number(), refuseHerLiked: nums, refuseHerRelief: nums }).strict(),
    groups: z.object({ fromDay: z.number(), chancePerDay: z.number(), arriveTick: z.tuple([z.number(), z.number()]), stay: z.number(), size: z.tuple([z.number().int(), z.number().int()]), kinds: z.array(id), saunaChance: z.number(), saunaHeat: z.number(), saunaTier: z.number(), trayEvery: z.number(), trayWait: z.number(), bill: z.tuple([z.number(), z.number()]), tipHer: z.number(), tipHusband: z.number(), heatPerRound: z.number(), heatHer: z.number(), restlessReputation: z.number(), inside: z.tuple([z.number(), z.number()]), longInside: z.tuple([z.number(), z.number()]), tierByHeat: z.array(z.tuple([z.number(), z.number()])), pressurePerMan: z.number(), manyBonus: z.number(), tipPerTier: z.number(), husbandEnergy: z.number(), refusedHeat: z.number() }).strict(),
    table: z.object({ minutes: z.number().int(), perEvening: z.number().int(), slipDrunk: z.number(), slipHonesty: z.number(), slipSuspicion: z.number(), cards: z.object({ bet: z.array(z.number().int()), winChance: z.number(), perDrunk: z.number(), stayTicks: z.number() }).strict(), rivalCools: z.number() }).strict(),
    join: z.object({ consentBonus: z.number(), hersRate: z.number(), power: z.number(), done: nums, refused: nums }).strict(),
  })
  .strict();
export type Floor = z.infer<typeof floorSchema>;

export const intimacySchema = z
  .object({
    lead: z.object({ takesAtPower: z.number(), takesChance: z.number(), cruelTakes: z.number(), hisActsPower: z.number(), holdAt: z.number(), slipPerTurn: z.number(), slipped: nums, minTurns: z.number(), maxTurns: z.number(), begAllowDesire: z.number(), begDenied: nums, takeBack: nums, ending: z.object({ ruined: z.number(), snowball: z.number(), lickClean: z.number() }).strict(), ruinedPower: z.number(), snowballPower: z.number(), snowballOpenness: z.number(), lickPower: z.number(), power: z.number() }).strict(),
    finish: z.object({ dodgeConfidence: z.number(), holdArousal: z.number(), holdDesire: z.number(), holdChance: z.number() }).strict(),
    after: z.object({ willingOpenness: z.number(), reversePower: z.number(), done: nums, reversed: nums, refused: nums }).strict(),
    talk: z.object({ sayMine: nums, sayMineLaugh: nums, sayMinePower: z.number(), lookAtMe: nums }).strict(),
    zones: z.object({ perMinute: z.number(), perOversize: z.number(), mouth: z.number(), slickCuts: z.number(), slickArousal: z.number(), slickConsent: z.number(), fade: z.number(), night: z.number(), consentFrom: z.number(), consent: z.number(), enoughAt: z.number(), enough: z.number(), thoughtAt: z.number() }).strict(),
    marks: z.object({ visible: z.array(z.string()), guests: nums, husbandSuspicion: z.number(), husbandOpen: z.record(z.string(), nums), cleanPerMark: z.number(), cleanAfter: z.number(), skipChance: z.number() }).strict(),
    dress: z.object({ lowMood: z.number(), lowMoodStep: z.number(), fearStep: z.number(), wantStep: z.number(), wishStep: z.number() }).strict(),
    wear: z.object({ night: z.string(), nightBold: z.string(), boldOpenness: z.number(), wash: z.string(), home: z.string() }).strict(),
  })
  .strict();
export type Intimacy = z.infer<typeof intimacySchema>;

export interface Content {
  look: Look;
  mind: Mind;
  terms: Terms;
  floor: Floor;
  intimacy: Intimacy;
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
  outfits: Outfit[];
  latents: Latent[];
  manners: Manners;
  day: DayTuning;
  presets: Preset[];
  locales: Record<string, Record<string, string>>;
}
