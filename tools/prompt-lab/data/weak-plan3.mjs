// day 21.11: round 3 (labels X1 / X2) for the weak keys that round 2 did not fix
import { writeFileSync } from "node:fs";
const HAND = "female hand, black nails, wedding ring, slender fingers";
const AGE = "(child:1.5), (shota:1.5), (teenage:1.4), (young:1.3), petite, short male, small body";
const v = (label, tags, o = {}) => ({ label, tags, ...o });
const P = {
  came_spank_him: [v("X1 на коленях, взрослый муж", "hetero, femdom, 1girl, 1boy, clothed female nude male, sitting, smirk, (spanking:1.3), red ass, male ass, over the knee, on lap, from side, mature male, adult, 35 years old, stubble, cum", { negative: `female spanked, spanked girl, nude female, (2boys:1.4), ${AGE}` }),
                   v("X2 крупно: её ладонь, красный зад", `close-up, femdom, (spanking:1.3), red ass, slap mark, male ass, ${HAND}, hand on another's ass, 1boy, male focus, mature male, ass focus, lying on stomach, head out of frame`, { close: true, roles: ["husband"], hands: ["wife"], negative: `(male hand:1.3), (2boys:1.4), ${AGE}` })],
  came_rimming_her: [v("X1 сидит на лице, кончает", "hetero, femdom, (anilingus:1.2), facesitting, sitting on face, girl on top, man lying on back, (female ejaculation:1.2), trembling, open mouth, head back, from side", { look: { outfit: "naked" } }),
                     v("X2 сзади, он на коленях", "hetero, (anilingus:1.3), face in ass, girl standing, bent over, man kneeling behind, hands on another's ass, looking back, open mouth, pussy juice, from side", { look: { outfit: "naked" } })],
  detail_him_cum_pants: [v("X1 пятно, член закрыт, сидя", "close-up, 1boy, solo, male focus, clothed male, pants, zipped, (wet spot:1.4), (cum stain:1.2), stained clothes, sitting, crotch focus, lower body, head out of frame", { close: true, roles: ["husband"], negative: "penis, erection, exposed penis, open fly, unzipped, pubic hair, (2boys:1.4), yaoi" }),
                         v("X2 серые спортивные, стоя", "close-up, 1boy, solo, male focus, clothed male, grey sweatpants, (wet spot:1.4), (cum stain:1.2), stained clothes, standing, facing viewer, crotch focus, lower body, head out of frame", { close: true, roles: ["husband"], negative: "penis, erection, exposed penis, open fly, pubic hair, (2boys:1.4), yaoi" })],
  sauna_massage: [v("X1 он лицом вниз на лавке", "1girl, 1boy, sauna, steam, wooden bench, man lying on stomach, face down, towel, girl standing, leaning forward, (massaging:1.2), back massage, hands on another's back, from side", { roles: ["wife", "patron"], look: { outfit: "towel" }, negative: "girl lying, female lying on stomach, massaging girl" }),
                  v("X2 она одна в сауне", "sauna, steam, wooden bench, towel, sweat, sitting, looking at viewer, upper body, solo", { roles: ["wife"], look: { outfit: "towel" } })],
  detail_touch_bulge: [v("X1 его глазами: тянется к штанам", "hetero, pov, (hand on another's crotch:1.2), reaching, bulge, pants, smirk, looking at viewer, leaning forward, from above, upper body", { roles: ["wife"] }),
                       v("X2 только её рука, крупнее", `close-up, hetero, ${HAND}, (hand on another's crotch:1.3), (bulge:1.1), erection under clothes, pants, clothed male, 1boy, sitting, spread legs, from above, crotch focus, lower body, head out of frame`, { close: true, roles: ["husband"], hands: ["wife"], negative: "(male hand:1.4), hands on own knees, own hands together, (2boys:1.4), yaoi, pubic hair" })],
  came_pegging: [v("X1 её глазами + кончает", `close-up, femdom, female pov, pov, (pegging:1.3), strap-on, anal, man on all fours, male ass, from behind, hands on another's hips, ${HAND}, handsfree ejaculation, cum, cumdrip, 1boy, male focus`, { close: true, roles: ["husband"], hands: ["wife"], negative: "(male hand:1.3), (2boys:1.4), dark-skinned male" })],
  sixty_nine: [v("X1 лёжа на нём, сбоку, во весь рост", "hetero, (69:1.4), mutual oral, fellatio, cunnilingus, girl on top, lying on person, man lying on back, penis in mouth, face in crotch, from side, full body, on bed", { look: { outfit: "naked" } })],
};
const plan = { n: 4, sameSeeds: true, plan: Object.entries(P).map(([id, variants]) => ({ id, variants })) };
writeFileSync("tools/prompt-lab/data/weak-plan3.json", JSON.stringify(plan, null, 1));
const r = await fetch("http://127.0.0.1:8195/api/compare", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(plan) });
console.log(r.status, (await r.text()).slice(0, 300));
