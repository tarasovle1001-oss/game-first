// day 21.11: variants for the 19 "middle" keys of the probe (best take 2 of 4). Posts to the lab as labelled takes on the same seeds.
//   node tools/prompt-lab/data/medium-plan.mjs [--post]
import { writeFileSync } from "node:fs";
const HAND = "female hand, black nails, wedding ring, slender fingers";
const NAKED = { outfit: "naked" };
const v = (label, tags, o = {}) => ({ label, tags, ...o });
const solo = (label, tags, o = {}) => v(label, tags, { roles: ["wife"], ...o });
const hand = (label, tags, o = {}) => v(label, `close-up, femdom, ${tags}, ${HAND}, crotch focus, lower body, head out of frame`, { close: true, roles: ["husband"], hands: ["wife"], ...o });
const P = {
  anal: [v("M1 сзади, зад вверх", "hetero, (anal:1.2), sex from behind, doggystyle, all fours, top-down bottom-up, on bed, man kneeling behind, hands on another's hips, penis in ass, ass focus, from behind"),
         v("M2 лёжа на животе", "hetero, (anal:1.2), prone bone, lying on stomach, man on top, on bed, penis in ass, looking back, from side")],
  bath_walkin: [solo("M1 она одна, взгляд на вошедшего", "walk-in, showering, bathroom, nude, wet, covering breasts, covering crotch, surprised, looking at viewer, open door, cowboy shot", { look: NAKED }),
                solo("M2 со спины, оглянулась", "showering, bathroom, nude, wet, from behind, looking back, surprised, covering breasts, steam, cowboy shot", { look: NAKED })],
  caught: [v("M1 двое, она смотрит в кадр", "hetero, netorare, fellatio, kneeling, man standing, penis in mouth, caught, surprised, wide-eyed, looking at viewer, from side", { roles: ["wife", "patron"] }),
           v("M2 вид из двери", "hetero, netorare, pov doorway, open door, fellatio, kneeling, man standing, looking at viewer, shocked, wide shot", { roles: ["wife", "patron"] })],
  chastity: [hand("M1 её рука с ключом, крупно", "(chastity cage:1.2), male chastity, holding key, key, man lying on back, spread legs"),
             solo("M2 она с ключом, портрет", "holding key, key, dangling, smirk, looking at viewer, upper body, sitting, on bed")],
  cold_back: [solo("M1 она одна, отвернулась", "lying on bed, on side, facing away, under covers, bare shoulders, night, dark, from above, solo"),
              solo("M2 со спины, крупнее", "lying, on side, from behind, back, bare shoulders, blanket, dim lighting, night, solo, upper body")],
  detail_gape_a: [v("M1 gaping, сзади", "close-up, (gaping:1.2), anus, spread ass, ass focus, from behind, after anal, head out of frame"),
                  v("M2 со спермой", "close-up, (gaping:1.2), anus, spread ass, (cum in ass:1.1), cumdrip, ass focus, from behind, after anal, head out of frame")],
  detail_join_hand_lazy: [hand("M1 её рука, обратный хват", "hetero, (handjob:1.2), reverse grip, small penis, pale-skinned male"),
                          hand("M2 двумя пальцами", "hetero, (handjob:1.1), two fingers, pinching, small penis, pale-skinned male, bored")],
  detail_kiss_close: [v("M1 профиль, щетина", "close-up, hetero, 1girl, 1boy, (kiss:1.2), french kiss, tongue, saliva trail, stubble, profile, face focus, eyes closed", { face: true }),
                      v("M2 рука на щеке", "close-up, hetero, 1girl, 1boy, (kiss:1.2), from side, eyes closed, hand on another's cheek, stubble, face focus", { face: true })],
  detail_throat_bulge: [v("M1 профиль", "close-up, hetero, (deepthroat:1.2), (throat bulge:1.3), fellatio, neck, profile, from side, tears, saliva", { face: true }),
                        v("M2 голова свешена", "hetero, (deepthroat:1.2), (throat bulge:1.3), upside-down, lying on back, head back, neck, from side, close-up", { face: true })],
  detail_touch_bare: [hand("M1 её рука", "hetero, (handjob:1.2), hand on penis, penis, erection"),
                      hand("M2 кончиком пальца", "hetero, fingertip, index finger, finger on penis, penis, erection, precum")],
  fd_ignore: [v("M1 на диване, в телефоне", "hetero, femdom, (handjob:1.2), sitting, couch, holding phone, looking at phone, bored, expressionless, man kneeling, on floor, penis, from side"),
              v("M2 лёжа, телефон крупнее", "hetero, femdom, (handjob:1.3), reaching back, lying on side, facing away, (holding phone:1.2), looking at phone, bored, penis, on bed, upper body")],
  footjob: [v("M1 вид его глазами", "hetero, pov, femdom, (footjob:1.2), two-footed footjob, soles, toes, penis, erection, sitting, looking down, smirk, from below"),
            v("M2 одной ногой, он на полу", "hetero, femdom, (footjob:1.2), one foot, sitting, chair, crossed legs, man lying on back, on floor, penis, smirk, from side")],
  group_sex_hand: [v("M1 двое + рука к краю", "hetero, sex, vaginal, missionary, lying on back, spread legs, man between legs, (handjob:1.1), reaching, penis, from side", { roles: ["wife", "patron"] }),
                   v("M2 сверху", "hetero, mmf threesome, (2boys:1.2), sex, vaginal, missionary, (handjob:1.1), lying on back, from above")],
  her_dress: [solo("M1 одна, у зеркала", "dressing, standing, underwear, putting on dress, mirror, from behind, cowboy shot, solo"),
              solo("M2 одна, поправляет", "dressing, standing, bra, panties, adjusting clothes, looking down, cowboy shot, solo")],
  lead_snowball: [v("M1 больше спермы", "hetero, femdom, (snowballing:1.2), cum swap, kiss, (cum in mouth:1.2), cum on tongue, cum string, excessive cum, all fours, girl on top, man lying on back, on bed, from side"),
                  v("M2 крупно лица", "close-up, hetero, femdom, (snowballing:1.2), cum swap, kiss, cum string, cumdrip, face focus, from side", { face: true })],
  mutual_touching: [v("M1 крупно, руки", "close-up, hetero, mutual masturbation, handjob, fingering, female hand, lower body, sitting side by side, head out of frame", { close: true }),
                    v("M2 лёжа рядом, сверху", "hetero, mutual masturbation, lying, side by side, on bed, handjob, fingering, blush, from above")],
  tease_denial: [hand("M1 её палец, крупно", "teasing, index finger, finger on penis, penis, erection, precum, precum string"),
                 v("M2 его глазами", "hetero, pov, femdom, teasing, smirk, looking at viewer, finger to mouth, penis, erection, precum, kneeling, between legs")],
  titfuck: [v("M1 его глазами", "hetero, pov, (paizuri:1.2), penis between breasts, breasts squeezed together, looking at viewer, kneeling, from above"),
            v("M2 она лёжа", "hetero, (paizuri:1.2), lying on back, man straddling, penis between breasts, breasts squeezed together, on bed, from side")],
  went_soft: [solo("M1 она одна, разочарована", "lying on back, on bed, nude, disappointed, looking away, sigh, from above, solo", { look: NAKED }),
              hand("M2 обмякший, её рука", "flaccid, small penis, soft penis, man lying on back")],
};
const plan = { n: 4, sameSeeds: true, plan: Object.entries(P).map(([id, variants]) => ({ id, variants })) };
writeFileSync("tools/prompt-lab/data/medium-plan.json", JSON.stringify(plan, null, 1));
console.log(Object.keys(P).length, "keys,", plan.plan.reduce((a, p) => a + p.variants.length, 0), "variants");
if (process.argv.includes("--post")) {
  const r = await fetch("http://127.0.0.1:8195/api/compare", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(plan) });
  console.log(r.status, (await r.text()).slice(0, 300));
}
