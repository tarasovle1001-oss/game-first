// day 21.11: round 4 (labels Y1 / Y2) for the three stubborn keys
import { writeFileSync } from "node:fs";
const HAND = "female hand, black nails, wedding ring, slender fingers";
const AGE = "(child:1.5), (shota:1.5), (teenage:1.4), (young:1.3), petite, short male, small body";
const v = (label, tags, o = {}) => ({ label, tags, ...o });
const N69 = "facesitting, sitting on face, upright, sitting, standing, cowgirl position";
const P = {
  sixty_nine: [v("Y1 лёжа лицом вниз на нём, сбоку", "hetero, (69:1.5), sixty-nine, mutual oral, (fellatio:1.2), penis in mouth, cunnilingus, girl on top, lying on person, face down, man lying on back, head between thighs, from side, on bed", { look: { outfit: "naked" }, negative: N69 }),
               v("Y2 то же сверху", "hetero, (69:1.5), sixty-nine, mutual oral, (fellatio:1.2), penis in mouth, cunnilingus, girl on top, lying on person, face down, man lying on back, head between thighs, from above, on bed", { look: { outfit: "naked" }, negative: N69 })],
  detail_touch_bulge: [v("Y1 её глазами: её рука на его штанах", `close-up, female pov, pov, pov hands, ${HAND}, (hand on another's crotch:1.3), bulge, erection under clothes, pants, clothed male, 1boy, sitting, crotch focus, lower body, head out of frame`, { close: true, roles: ["husband"], hands: ["wife"], negative: "(male hand:1.4), hands on own knees, own hands together, (2boys:1.4), yaoi" })],
  came_spank_him: [v("Y1 он нагнут, она одета, сбоку", "1girl, 1boy, hetero, femdom, clothed female nude male, sitting, smirk, (spanking:1.3), (red ass:1.2), male ass, bent over, from side, man bent over, hands on bed, nude male, mature male, adult, 35 years old, stubble, cum, handsfree ejaculation", { negative: `female spanked, spanked girl, (nude female:1.2), (2boys:1.4), ${AGE}` })],
};
const plan = { n: 4, sameSeeds: true, plan: Object.entries(P).map(([id, variants]) => ({ id, variants })) };
writeFileSync("tools/prompt-lab/data/weak-plan4.json", JSON.stringify(plan, null, 1));
const r = await fetch("http://127.0.0.1:8195/api/compare", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(plan) });
console.log(r.status, (await r.text()).slice(0, 300));
