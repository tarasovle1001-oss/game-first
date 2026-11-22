// night 21.11, cycle 2: new words and *3 targets, inserted into synth.yaml before fixed anchor lines
import { readFileSync, writeFileSync } from "node:fs";
const f = "tools/prompt-lab/synth.yaml";
let s = readFileSync(f, "utf8");
if (s.includes("id: prostate3")) { console.log("already patched"); process.exit(0); }
const ins = (anchor, text) => { const i = s.indexOf(anchor); if (i < 0) throw new Error("no anchor: " + anchor); s = s.slice(0, i) + text + s.slice(i); };
const N = '(male hand:1.3), (dark-skinned male:1.4), (2boys:1.4), muscular arm, veiny arm, hairy arm, futanari';
ins('  hpenis: "', `  # cycle 2 (night 21.11): h_full gave 0 everywhere and is out; glove in pov and a thin arm are new; hbody = the husband without a face, for close-ups
  h_povglove: "1boy, solo focus, male focus, female pov, pov, pov hands, {hand}, (black gloves:1.3), elbow gloves, latex gloves"
  h_slim: "1boy, solo focus, male focus, {hand}, (pale skin:1.2), slender fingers, thin wrist, slender arm, long fingernails"
  hbody: "(faceless male:1.2), head out of frame, mature male, (pale-skinned male:1.4), (pale skin:1.3), white skin, average build, soft body"
`);
ins('  patron: "pale-skinned male', `  hbody: "(dark-skinned male:1.4), (dark skin:1.4), brown skin, tan, interracial, (child:1.4), (shota:1.4), (teenage:1.4), (young:1.3), (short male:1.2), (muscular male:1.3), abs, large penis, huge penis, wide hips, breasts, pussy, face"
`);
ins('      - id: spank_him', `      - id: prostate3
        title: "Простата 3: крупно, без лица, её рука (перчатка / вид её глазами)"
        count: 150
        prompt: "{who}, femdom, hetero, {act}, {view}, {state}, {hbody}, {hpenis}, {room}"
        negative: "${N}"
        acts: ["(anal fingering:1.3), finger in ass, fingering", "(prostate milking:1.2), (anal fingering:1.2), finger in ass, handjob", "(anal fingering:1.3), two fingers, lube, anus", "(anal fingering:1.3), (prostate milking:1.1), one finger, finger in ass, hand on another's ass"]
        axes:
          who: ["{h_pov}", "{h_glove}", "{h_povglove}", "{h_slim}"]
          view: ["close-up, lower body, lying on back, legs up, spread legs", "from above, lower body, lying on back, legs up, spread legs", "close-up, lower body, lying on back, knees up, testicles, perineum"]
          state: ["erection, precum", "handsfree ejaculation, cum"]
      - id: dildo3
        title: "Дилдо в нём 3: крупно, игрушка в её руке"
        count: 150
        prompt: "{who}, femdom, hetero, {act}, {view}, {state}, {hbody}, {hpenis}, {room}"
        negative: "${N}, vaginal"
        acts: ["(anal object insertion:1.3), (dildo:1.2), holding dildo", "(anal object insertion:1.3), (butt plug:1.2)", "(anal object insertion:1.3), (anal beads:1.2), pulling", "(anal object insertion:1.3), (dildo:1.2), holding sex toy, sex toy, lube"]
        axes:
          who: ["{h_pov}", "{h_glove}", "{h_povglove}", "1boy, solo, male focus"]
          view: ["close-up, lower body, lying on back, legs up, spread legs", "close-up, from behind, all fours, ass focus, testicles", "close-up, lower body, lying on back, knees up, anus"]
          state: ["erection, precum", "handsfree ejaculation, cum"]
      - id: fisting3
        title: "Кулак в нём 3: крупно сзади, рука в перчатке по локоть"
        count: 150
        prompt: "{who}, femdom, hetero, {act}, {view}, {hbody}, {hpenis}, {room}"
        negative: "${N}"
        acts: ["(anal fisting:1.3), fisting", "(anal fisting:1.3), fist, deep insertion, forearm", "(fisting:1.3), anal, large insertion, stomach bulge", "(anal fisting:1.3), wrist deep, lube, stretched anus"]
        axes:
          who: ["{h_glove}", "{h_povglove}", "{h_slim}", "1boy, solo focus, male focus, {hand}, (black gloves:1.3), (elbow gloves:1.3), latex, slender arm"]
          view: ["close-up, from behind, all fours, ass focus", "close-up, lower body, lying on back, legs up", "close-up, from behind, top-down bottom-up, ass focus, testicles"]
      - id: spank3
        title: "Шлепки 3: она одета, он голый у неё на коленях / нагнут"
        count: 150
        prompt: "1girl, 1boy, {look}, {who}, femdom, hetero, {act}, {view}, nude male, {husband}, {room}"
        negative: "(dark-skinned male:1.3), (2boys:1.4), nude female, female spanked"
        acts: ["(spanking:1.3), (red ass:1.2), male ass", "(spanking:1.2), riding crop, holding riding crop, red ass, male ass", "(spanking:1.2), (holding paddle:1.2), paddle, red ass, male ass", "(spanking:1.3), slap mark, red ass, male ass, raised hand"]
        axes:
          who: ["clothed female nude male, sitting, smirk", "clothed female nude male, standing, smirk, looking down", "clothed female nude male, black dress, sitting, crossed legs"]
          view: ["over the knee, on lap, from side", "over the knee, lying on lap, face down, from above", "bent over, from side, man bent over, hands on bed"]
`);
ins('      - id: handjob2', `      - id: ruined3
        title: "Впустую 3: он кончает без рук, её рука отдёрнута"
        count: 150
        prompt: "{who}, femdom, hetero, {act}, {gesture}, {view}, {hbody}, {hpenis}, {room}"
        negative: "${N}, 1girl, handjob, penis grab"
        acts: ["(ruined orgasm:1.3), (handsfree ejaculation:1.2), cum, twitching penis", "(handsfree ejaculation:1.3), ejaculation, cumdrip, weak ejaculation", "(ruined orgasm:1.3), cumdrip, cum, dripping", "(handsfree ejaculation:1.3), (ruined orgasm:1.2), cum on stomach, erection"]
        axes:
          who: ["{h_pov}", "{h_povglove}", "{h_glove}"]
          gesture: ["open hand, hand up", "open hand, hand up, spread fingers, cum on hand", "hands off, hand hovering"]
          view: ["lower body, lying on back, from above", "close-up, lower body, lying on back", "from side, lower body, kneeling"]
`);
ins('      - id: patron69', `      - id: husband69c
        title: "69 с мужем 3: она сверху, бледный муж"
        count: 150
        size: 832x1216
        prompt: "1girl, 1boy, {look}, nude, hetero, {act}, {pose}, {view}, licking, tongue, {husband}, {hpenis}, {skin}, {room}"
        negative: "(dark-skinned male:1.5), (dark skin:1.4), tan, tanned male, interracial, large penis, huge penis"
        acts: ["(69:1.4), fellatio, cunnilingus", "(69:1.3), (fellatio:1.2), (cunnilingus:1.2), licking pussy, penis in mouth", "(69:1.4), fellatio, cunnilingus, face in crotch, oral"]
        axes:
          pose: ["girl on top, lying on person, upside-down, head between thighs", "girl on top, all fours, man lying on back, head between thighs"]
          view: ["from side", "from above", "from side, close-up"]
          skin: ["pale skin, white skin", "(pale skin:1.3), (white skin:1.2), same skin color", "(pale:1.3), colored skin, white skin"]
`);
writeFileSync(f, s);
console.log("patched");
