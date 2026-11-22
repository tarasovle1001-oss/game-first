// day 21.11, Alexey 19:35 on why he threw out what Claude passed: the view is from HIS eyes and the hand on the penis is his own
// (a glove or a manicure on a male hand), second men / yaoi in bulge, cage, soft; a penis on her in footjob.
// New branches: her hand must visibly come from HER (her torso beyond, head out of frame), "male masturbation" and own hands in the negative;
// cage / soft / bulge strictly one man and no hands; footjob without her crotch.
import { readFileSync, writeFileSync } from "node:fs";
const f = "tools/prompt-lab/synth.yaml";
let s = readFileSync(f, "utf8");
if (s.includes("id: handjob4")) { console.log("already patched"); process.exit(0); }
const anchor = "      - id: handjob2";
const i = s.indexOf(anchor);
if (i < 0) throw new Error("no anchor");
const SELF = "(male masturbation:1.4), masturbation, (male hand:1.4), own hands, hand on own penis, (2boys:1.5), multiple boys, yaoi, (dark-skinned male:1.4), gloves, futanari";
const ALONE = "(2boys:1.5), multiple boys, yaoi, another person, 1girl, hand, hands, (male hand:1.3), (dark-skinned male:1.4), futanari, breasts, pussy, wide hips, standing";
const HER = "1girl, 1boy, hetero, {look}, head out of frame, kneeling, between legs, leaning forward, cleavage";
const text = `      - id: handjob4
        title: "Её рука на члене 4: она за кадром по шею, рука идёт от неё"
        count: 300
        prompt: "${HER}, pov, {act}, {view}, {state}, {hand}, {hbody3}, {hpenis}, {room}"
        negative: "${SELF}"
        acts: ["(handjob:1.3), penis grab", "(handjob:1.3), two fingers, pinching, small penis humiliation", "(handjob:1.3), stroking, foreskin", "(handjob:1.2), fingertips, glans, teasing"]
        axes:
          view: ["man lying on back, spread legs, from above", "man sitting, spread legs, from above", "close-up, man lying on back, lower body"]
          state: ["erection, precum", "erection, (precum:1.3), precum string", "ejaculation, cum, cum on hand"]
      - id: ruined8
        title: "Впустую 8: она за кадром по шею, её раскрытые ладони, он кончает без рук"
        count: 300
        prompt: "${HER}, pov, {act}, {gesture}, {view}, {hand}, {hbody3}, {hpenis}, {room}"
        negative: "${SELF}, handjob, penis grab"
        acts: ["(ruined orgasm:1.3), (handsfree ejaculation:1.2), cum, twitching penis", "(handsfree ejaculation:1.3), ejaculation, cumdrip, weak ejaculation", "(ruined orgasm:1.3), cumdrip, cum, dripping"]
        axes:
          gesture: ["open hands, hands up, palms", "hands off, hands raised, w arms", "hands on own thighs, smirk"]
          view: ["man lying on back, spread legs, from above", "close-up, man lying on back, lower body"]
      - id: cage5
        title: "Клетка 5: он один, без рук, сидя или лёжа"
        count: 300
        prompt: "1boy, solo, male focus, close-up, {act}, {view}, crotch focus, lower body, head out of frame, arms out of frame, {hbody3}, {room}"
        negative: "${ALONE}"
        acts: ["(chastity cage:1.3), male chastity", "(chastity cage:1.3), male chastity, padlock", "(chastity cage:1.3), flat chastity cage, precum"]
        axes:
          view: ["lying on back, spread legs, from above", "sitting, spread legs, from above", "lying on back, knees up"]
      - id: soft5
        title: "Обмякший 5: он один, без рук, сидя или лёжа"
        count: 300
        prompt: "1boy, solo, male focus, close-up, {act}, {view}, crotch focus, lower body, head out of frame, arms out of frame, {hbody3}, {hpenis}, {room}"
        negative: "${ALONE}, erection"
        acts: ["flaccid, soft penis, (small penis:1.2)", "flaccid, soft penis, (small penis:1.2), after sex, cumdrip", "flaccid, small penis, foreskin, phimosis"]
        axes:
          view: ["lying on back, spread legs, from above", "sitting, spread legs, from above", "lying on back, knees up"]
      - id: bulge3
        title: "Бугор 3: он один, без рук"
        count: 300
        prompt: "1boy, solo, male focus, close-up, {act}, {pants}, {view}, clothed male, crotch focus, lower body, head out of frame, arms out of frame, mature male"
        negative: "${ALONE.replace(", standing", "")}, penis, exposed penis, open fly"
        acts: ["(bulge:1.0), erection under clothes", "(erection under clothes:1.1), bulge, wet spot", "(bulge:0.9), (wet spot:1.2)"]
        axes:
          pants: ["(baggy pants:1.2)", "sweatpants, loose clothes", "pants, belt, loose clothes"]
          view: ["standing, facing viewer", "sitting, spread legs, from above", "lying on back, from above"]
      - id: foot3
        title: "Её нога 3: только её ноги, без её паха"
        count: 300
        prompt: "1girl, 1boy, hetero, femdom, {act}, {view}, feet, legs, barefoot, black toenails, girl out of frame, female legs only, {hbody3}, {hpenis}, {room}"
        negative: "(futanari:1.5), penis on female, newhalf, girl with penis, female crotch, pussy, spread legs female, (2boys:1.5), yaoi, (dark-skinned male:1.4), male feet"
        acts: ["(footjob:1.3), two-footed footjob, soles", "(footjob:1.3), one foot, foot on penis, stepping on penis", "(footjob:1.2), toes, penis between feet"]
        axes:
          view: ["close-up, man lying on back, lower body, from above", "close-up, from side, man lying on back", "pov, man sitting, spread legs, from above"]
`;
s = s.slice(0, i) + text + s.slice(i);
writeFileSync(f, s);
console.log("patched");
