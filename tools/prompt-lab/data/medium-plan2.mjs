// day 21.11, round 2 for the middle keys that round 1 (M1 / M2) did not fix. Labels N1 / N2.
import { writeFileSync } from "node:fs";
const HAND = "female hand, black nails, wedding ring, slender fingers";
const v = (label, tags, o = {}) => ({ label, tags, ...o });
const P = {
  detail_throat_bulge: [v("N1 крупно шея, профиль", "close-up, hetero, (deepthroat:1.3), (throat bulge:1.4), irrumatio, penis in mouth, neck focus, profile, from side, saliva, tears, eyes closed, nude, bare shoulders", { face: true, close: true, look: { outfit: "naked" } }),
                        v("N2 на коленях, сбоку", "hetero, (deepthroat:1.3), (throat bulge:1.3), fellatio, kneeling, man standing, hands on another's head, from side, upper body, saliva, tears", { roles: ["wife", "patron"] })],
  group_sex_hand: [v("N1 двое: миссионерская, рука тянется", "hetero, sex, vaginal, (missionary:1.2), lying on back, spread legs, man on top, between legs, arm outstretched, reaching out, from side, on bed", { roles: ["wife", "patron"], look: { outfit: "naked" } }),
                   v("N2 вставка: её рука на втором", `close-up, hetero, (handjob:1.2), ${HAND}, penis, erection, crotch focus, lower body, head out of frame`, { close: true, roles: ["patron2"], hands: ["wife"] })],
  lead_snowball: [v("N1 поцелуй сверху, сперма", "hetero, femdom, (kiss:1.2), (snowballing:1.2), cum swap, cum in mouth, cum string, girl on top, straddling, man lying on back, hand on another's chin, on bed, from side, upper body"),
                  v("N2 она одна, сперма во рту", "(cum in mouth:1.3), cum on tongue, open mouth, tongue out, smirk, looking at viewer, upper body, solo", { roles: ["wife"], face: true })],
  fd_ignore: [v("N1 его глазами: она в телефоне", "hetero, pov, femdom, (handjob:1.2), (holding phone:1.3), looking at phone, bored, expressionless, sitting, one hand, penis, from above"),
              v("N2 портрет с телефоном + рука вниз", "(holding phone:1.3), looking at phone, bored, half-closed eyes, sitting, on bed, upper body, arm down, solo", { roles: ["wife"] })],
  titfuck: [v("N1 его глазами, член виден", "hetero, pov, (paizuri:1.3), (penis between breasts:1.2), breast squeeze, breasts out, nipples, penis, glans, looking at viewer, kneeling, from above", { look: { outfit: "topless" } }),
            v("N2 крупно грудь", "close-up, hetero, (paizuri:1.3), (penis between breasts:1.2), breast squeeze, breasts out, nipples, penis, glans, cum, breast focus, head out of frame", { close: true, look: { outfit: "topless" } })],
  caught: [v("N1 двое, на коленях, взгляд в сторону", "hetero, netorare, fellatio, (kneeling:1.2), man standing, penis in mouth, caught, surprised, wide-eyed, looking to the side, from side, cowboy shot", { roles: ["wife", "patron"] }),
           v("N2 портрет: застигнута", "surprised, wide-eyed, open mouth, saliva, blush, looking at viewer, hand over own mouth, upper body, kneeling, solo", { roles: ["wife"], face: true })],
  chastity: [v("N1 клетка крупно, лёжа", `close-up, femdom, (chastity cage:1.3), male chastity, 1boy, male focus, lying on back, spread legs, crotch focus, lower body, head out of frame, ${HAND}, holding key, key`, { close: true, roles: ["husband"], hands: ["wife"] }),
             v("N2 ключ на цепочке, портрет", "(holding key:1.3), key, key necklace, dangling, smirk, looking at viewer, upper body, hand up, solo", { roles: ["wife"], face: true })],
  mutual_touching: [v("N1 вставка: её рука на нём", `close-up, hetero, (handjob:1.2), ${HAND}, small penis, crotch focus, lower body, head out of frame, sitting`, { close: true, roles: ["husband"], hands: ["wife"] }),
                    v("N2 она одна: ласкает себя, сидя", "female masturbation, fingering, hand in panties, sitting, on bed, blush, looking to the side, cowboy shot, solo", { roles: ["wife"] })],
};
const plan = { n: 4, sameSeeds: true, plan: Object.entries(P).map(([id, variants]) => ({ id, variants })) };
writeFileSync("tools/prompt-lab/data/medium-plan2.json", JSON.stringify(plan, null, 1));
const r = await fetch("http://127.0.0.1:8195/api/compare", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(plan) });
console.log(r.status, (await r.text()).slice(0, 300));
