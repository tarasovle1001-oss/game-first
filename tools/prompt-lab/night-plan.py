# How the night plan (night-plan.json) was written, 20.11: variants for the 47 weak keys, portraits by mood, one plain close-up of the act per pair scene.
# Needs /tmp/roles.txt (scene, roles, tags dump) and /tmp/tagcheck.py (danbooru.csv check) from the session that wrote it; kept as the record of what was tried.
import json, random, re, sys, subprocess
sys.path.insert(0,'/tmp'); from tagcheck import check
random.seed(20261120)
ROLES={}; TAGS={}
for line in open('/tmp/roles.txt'):
    parts=line.rstrip('\n').split(' | ',1)
    head=parts[0].split(); ROLES[head[0]]=head[1].split('+'); TAGS[head[0]]=parts[1] if len(parts)>1 else ''

# text pass fixes for the new variants: less body hair on him in close-ups, loose trousers on every man
FIX={"husband":{"closeup":"mature male, pale skin, male pubic hair","clothes":"(clothed male:1.2), t-shirt, (baggy pants:1.1)"},
     "patron":{"closeup":"mature male, dark-skinned male, muscular male, male pubic hair","clothes":"(clothed male:1.2), shirt, (baggy pants:1.1)"},
     "patron2":{"clothes":"(clothed male:1.2), shirt, (baggy pants:1.1)"},"patron3":{"clothes":"(clothed male:1.2), shirt, (baggy pants:1.1)"}}
NAKED={"outfit":"naked"}
PROST="sdxl_lightning_8step_lora.safetensors:1,sora_v2-000010.safetensors:0.7,ProstateMilking_IL_V1_0.safetensors:0.8"
RIM="sdxl_lightning_8step_lora.safetensors:1,sora_v2-000010.safetensors:0.7,rmjb_v2b_IL-17.safetensors:0.8"
HERHAND="female hand, black nails, wedding ring"
bad=[]
def V(label, tags=None, **k):
    v={"label":label}
    if tags is not None:
        v["tags"]=tags; u=check(tags)
        if u: bad.append((label,u))
    if k.get("fix",True): v["cast"]=FIX
    k.pop("fix",None)
    v.update(k); return v
A=lambda: V("A как сейчас",fix=False)
def close(label,tags,roles,**k): return V(label,tags,close=True,roles=roles,**k)
def portrait(label,tags,**k):
    if "nude" in tags and "look" not in k: k["look"]=NAKED
    return close(label,"portrait, upper body, solo, looking at viewer, "+tags,["wife"],face=True,**k)
def IG(label,tags,roles=("wife","patron"),**k): return close(label,"close-up, "+("hetero, " if len(roles)>1 else "")+tags,list(roles),**k)
def IH(label,tags,roles=("wife","husband"),**k): return close(label,"close-up, "+("hetero, " if len(roles)>1 else "")+tags,list(roles),**k)

P={}
# ---- 1. groups: two men (+ husband)
P["join_dp"]=[A(),
 V("B другие теги, сзади","hetero, threesome, (2boys:1.2), interracial, (double penetration:1.2), anal, vaginal, sandwiched, girl on top, cowgirl position, man lying on back, man behind her, two penises, from behind",look=NAKED),
 V("C двое в кадре (гость)","hetero, sex, vaginal, (cowgirl position:1.2), girl on top, straddling, man lying on back, penis, large penis, hands on another's chest, looking back, from side",roles=["wife","patron"],look=NAKED),
 IH("C вставка муж","(anal:1.2), penis in ass, small penis, ass focus, lower body, head out of frame, from behind"),
 portrait("D портрет","(ahegao:1.1), blush, sweat, open mouth, heavy breathing, nude, bare shoulders"),
 IG("D вставка гость","sex, vaginal, penis in pussy, girl on top, lower body, head out of frame, from below"),
 IH("D вставка муж","(anal:1.2), penis in ass, small penis, ass focus, lower body, head out of frame, from behind"),
 V("E сверху","hetero, threesome, (2boys:1.2), (double penetration:1.2), anal, vaginal, sandwiched, lying on person, man lying on back, man on top, from above",look=NAKED)]
P["join_take"]=[A(),
 V("B другие теги, сбоку","hetero, threesome, (2boys:1.2), interracial, (double penetration:1.2), sandwiched, girl on top, straddling, man lying on back, man kneeling behind, hand on another's hip, two penises, from side",look=NAKED),
 V("C двое в кадре (гость)","hetero, sex, vaginal, (cowgirl position:1.2), girl on top, leaning forward, man lying on back, penis, large penis, ass, from behind",roles=["wife","patron"],look=NAKED),
 IH("C вставка муж","(anal:1.2), penis in ass, small penis, ass focus, lower body, head out of frame, from behind"),
 portrait("D портрет","blush, (half-closed eyes:1.1), open mouth, sweat, nude, bare shoulders"),
 IG("D вставка гость","sex, vaginal, penis in pussy, girl on top, lower body, head out of frame, from below"),
 V("E снизу","hetero, threesome, (2boys:1.2), (double penetration:1.2), sandwiched, girl on top, from below, ass, two penises",look=NAKED)]
for k,(guest,mouth) in {"join_mouth":("doggystyle","fellatio"),"join_husband":("doggystyle","fellatio"),"join_two_mouths":("doggystyle","fellatio")}.items():
    P[k]=[A(),
     V("B другие теги, сбоку","hetero, threesome, (2boys:1.2), interracial, (spitroast:1.2), sex from behind, doggystyle, (fellatio:1.1), all fours, man kneeling behind, man kneeling in front, two penises, from side",look=NAKED),
     V("C двое в кадре (гость сзади)","hetero, sex, vaginal, (doggystyle:1.2), sex from behind, all fours, man kneeling behind, hands on another's hips, penis, large penis, open mouth, from side",roles=["wife","patron"],look=NAKED),
     IH("C вставка муж","(fellatio:1.2), penis in mouth, small penis, (eyes out of frame:1.2), lips, saliva, from side"),
     portrait("D портрет","blush, open mouth, saliva, tears, sweat, nude, bare shoulders, all fours"),
     IG("D вставка гость","sex from behind, vaginal, penis in pussy, ass focus, lower body, head out of frame, from behind"),
     IH("D вставка муж","(fellatio:1.2), penis in mouth, small penis, (eyes out of frame:1.2), lips, saliva, from side"),
     V("E сверху","hetero, threesome, (2boys:1.2), (spitroast:1.2), doggystyle, fellatio, all fours, from above, ass",look=NAKED)]
P["join_hand"]=[A(),
 V("B другие теги, сверху","hetero, threesome, (2boys:1.2), interracial, sex, vaginal, missionary, lying on back, spread legs, man between legs, (handjob:1.2), reaching, man kneeling beside, two penises, from above",look=NAKED),
 V("C двое в кадре (гость)","hetero, sex, vaginal, (missionary:1.2), lying on back, spread legs, man between legs, penis, large penis, reaching, looking to the side, from above",roles=["wife","patron"],look=NAKED),
 IH("C вставка муж","(handjob:1.2), "+HERHAND+", small penis, erection, lower body, head out of frame"),
 portrait("D портрет","blush, open mouth, sweat, looking to the side, nude, lying on back"),
 IG("D вставка гость","sex, vaginal, penis in pussy, missionary, spread legs, lower body, head out of frame"),
 V("E сбоку, руки видно","hetero, threesome, (2boys:1.2), sex, vaginal, missionary, (handjob:1.3), hand on penis, lying on back, man kneeling beside, from side",look=NAKED)]
P["join_hold"]=[A(),
 V("B другие теги, спереди","hetero, threesome, (2boys:1.2), interracial, sex, vaginal, (cowgirl position:1.2), girl on top, man lying on back, (hug from behind:1.2), man behind her, grabbing another's breast, upright straddle, facing viewer",look=NAKED),
 V("C двое в кадре (гость)","hetero, sex, vaginal, (cowgirl position:1.2), girl on top, upright straddle, man lying on back, penis, large penis, arms up, breasts, facing viewer",roles=["wife","patron"],look=NAKED),
 IH("C вставка муж","grabbing another's breast, (groping:1.2), male hand, breasts, nipples, upper body, head out of frame"),
 portrait("D портрет","blush, open mouth, (half-closed eyes:1.1), sweat, nude, breasts"),
 IG("D вставка гость","sex, vaginal, penis in pussy, girl on top, lower body, head out of frame, from below")]
P["join_after"]=[A(),
 V("B другие теги, сверху","hetero, threesome, (2boys:1.2), after sex, (cum in pussy:1.2), cumdrip, lying on back, spread legs, on bed, heavy breathing, sweat, from above",look=NAKED),
 V("C только она","after sex, (cum in pussy:1.2), cumdrip, cum on body, lying on back, spread legs, on bed, heavy breathing, sweat, messy hair, solo, from above",roles=["wife"],look=NAKED),
 portrait("D портрет","(exhausted:1.1), heavy breathing, sweat, messy hair, half-closed eyes, nude, lying"),
 IG("D вставка","(cum in pussy:1.2), cumdrip, (excessive cum:1.1), pussy, spread legs, lower body, head out of frame",roles=["wife"])]
P["came_join_after"]=[A(),
 V("B другие теги, сверху","hetero, threesome, (2boys:1.2), after sex, (cum in pussy:1.2), cum in ass, cumdrip, excessive cum, lying on back, spread legs, on bed, heavy breathing, from above",look=NAKED),
 V("C только она","after sex, (cum in pussy:1.2), cum in ass, cumdrip, excessive cum, cum on body, lying on stomach, on bed, ass, heavy breathing, solo, from behind",roles=["wife"],look=NAKED),
 portrait("D портрет","(exhausted:1.1), heavy breathing, sweat, cum on face, half-closed eyes, nude"),
 IG("D вставка","(cum in pussy:1.2), cum in ass, cumdrip, (excessive cum:1.2), ass focus, lower body, head out of frame, from behind",roles=["wife"])]
P["came_join_dp"]=[A(),
 V("B другие теги, сзади","hetero, threesome, (2boys:1.2), interracial, (double penetration:1.2), sandwiched, (creampie:1.2), cum in pussy, cum in ass, cum overflow, excessive cum, girl on top, two penises, from behind",look=NAKED),
 V("C двое в кадре (гость)","hetero, sex, vaginal, (creampie:1.2), cum in pussy, cum overflow, girl on top, man lying on back, penis, large penis, trembling, from behind",roles=["wife","patron"],look=NAKED),
 IH("C вставка муж","anal, (cum in ass:1.2), small penis, penis in ass, ass focus, lower body, head out of frame, from behind"),
 portrait("D портрет","(ahegao:1.1), trembling, blush, sweat, tongue out, nude"),
 IG("D вставка гость","vaginal, (creampie:1.2), cum overflow, penis in pussy, lower body, head out of frame, from below")]
P["came_join_hold"]=[A(),
 V("B другие теги, спереди","hetero, threesome, (2boys:1.2), interracial, sex, vaginal, (creampie:1.2), cum overflow, girl on top, (hug from behind:1.2), man behind her, upright straddle, trembling, facing viewer",look=NAKED),
 V("C двое в кадре (гость)","hetero, sex, vaginal, (creampie:1.2), cum overflow, girl on top, upright straddle, man lying on back, trembling, arched back, facing viewer",roles=["wife","patron"],look=NAKED),
 portrait("D портрет","(female orgasm:1.1), trembling, blush, open mouth, sweat, nude"),
 IG("D вставка гость","vaginal, (creampie:1.2), cum overflow, penis in pussy, lower body, head out of frame, from below")]
P["came_join_two_mouths"]=[A(),
 V("B другие теги, сбоку","hetero, threesome, (2boys:1.2), interracial, (spitroast:1.2), doggystyle, (cum in mouth:1.1), creampie, cum overflow, all fours, man kneeling behind, man kneeling in front, from side",look=NAKED),
 V("C двое в кадре (гость сзади)","hetero, sex, vaginal, doggystyle, (creampie:1.2), cum overflow, all fours, man kneeling behind, open mouth, from side",roles=["wife","patron"],look=NAKED),
 IH("C вставка муж","(cum in mouth:1.2), fellatio, small penis, ejaculation, (eyes out of frame:1.2), lips, from side"),
 portrait("D портрет","cum in mouth, cum on face, blush, tears, open mouth, nude"),
 IG("D вставка гость","doggystyle, (creampie:1.2), cum overflow, penis in pussy, ass focus, lower body, head out of frame, from behind")]
P["group_airtight"]=[A(),
 V("B другие теги, сбоку","hetero, group sex, gangbang, (3boys:1.2), (triple penetration:1.2), double penetration, (fellatio:1.1), girl on top, man lying on back, man behind her, man standing, multiple penises, from side",look=NAKED),
 V("C двое в кадре + рот вставкой","hetero, threesome, (2boys:1.2), (double penetration:1.2), sandwiched, girl on top, man lying on back, man behind her, open mouth, from side",roles=["wife","patron","patron2"],look=NAKED),
 close("C вставка рот","close-up, hetero, (fellatio:1.2), penis in mouth, large penis, (eyes out of frame:1.2), lips, saliva",["wife","patron3"]),
 portrait("D портрет","(ahegao:1.1), saliva, tears, sweat, blush, nude"),
 IG("D вставка снизу","double penetration, vaginal, anal, penis in pussy, penis in ass, lower body, head out of frame, from below"),
 close("D вставка рот","close-up, hetero, (fellatio:1.2), penis in mouth, large penis, (eyes out of frame:1.2), lips, saliva",["wife","patron3"])]
P["group_spitroast_hand"]=[A(),
 V("B другие теги, сбоку","hetero, group sex, gangbang, (3boys:1.2), (spitroast:1.2), doggystyle, fellatio, (handjob:1.2), reaching, all fours, man kneeling behind, man kneeling in front, man standing beside, multiple penises, from side",look=NAKED),
 V("C двое в кадре + рука вставкой","hetero, threesome, (2boys:1.2), (spitroast:1.2), doggystyle, fellatio, all fours, man kneeling behind, man kneeling in front, from side",roles=["wife","patron","patron2"],look=NAKED),
 close("C вставка рука","close-up, hetero, (handjob:1.2), "+HERHAND+", large penis, erection, lower body, head out of frame",["wife","patron3"],hands=["wife"]),
 portrait("D портрет","saliva, blush, tears, open mouth, sweat, nude, all fours"),
 IG("D вставка сзади","doggystyle, sex from behind, vaginal, penis in pussy, ass focus, lower body, head out of frame, from behind"),
 close("D вставка рука","close-up, hetero, (handjob:1.2), "+HERHAND+", large penis, erection, lower body, head out of frame",["wife","patron3"],hands=["wife"])]

# ---- 2. husband whole in frame -> without him / his parts only
P["left_wanting"]=[A(),
 V("B без мужа","(frustrated:1.2), sitting on bed, on bed, after sex, aroused, flushed, biting lip, looking away, legs together, hand between legs, messy bed, solo, cowboy shot",roles=["wife"],look=NAKED),
 portrait("C портрет","(frustrated:1.2), biting lip, flushed, aroused, looking away, nude, bare shoulders"),
 IH("C вставка муж","flaccid, (small penis:1.2), after sex, cum, lower body, head out of frame, on bed",hands=["wife"]),
 V("D со спины, муж краем","sitting on bed, from behind, back, looking back, frustrated, nude, bare back, faceless male, man lying on back, out of frame, on bed",look=NAKED)]
P["finishing_herself"]=[A(),
 V("B без мужа","(female masturbation:1.2), fingering, lying on back, spread legs, on bed, under covers, frustrated, blush, biting lip, night, solo, from above",roles=["wife"],look=NAKED),
 V("C его рука краем","(female masturbation:1.2), fingering, lying on back, on bed, night, male hand, arm, sleeping, solo focus, frustrated, blush, from above",look=NAKED),
 portrait("D портрет","(frustrated:1.1), blush, biting lip, half-closed eyes, night, lying, nude"),
 IH("D вставка муж","flaccid, (small penis:1.2), sleeping, lying, under covers, lower body, head out of frame, night",roles=["husband"])]
P["night_awake"]=[A(),
 V("B без мужа, сидит","sitting on bed, (sitting:1.2), undressing, taking off shirt, night, lamp, bedroom, looking at viewer, solo, cowboy shot",roles=["wife"],look={"outfit":"nightgown"}),
 V("C его рука на ней","sitting on bed, (sitting:1.2), undressing, night, lamp, male hand, hand on another's shoulder, solo focus, looking back, from behind",look={"outfit":"nightgown"}),
 portrait("D портрет","night, lamp, looking at viewer, half-closed eyes, sitting, bare shoulders",look={"outfit":"nightgown"})]
P["her_rest"]=[A(),
 V("B без мужа","lying on bed, on side, resting, closed eyes, relaxed, pillow, solo, from above",roles=["wife"],look={"outfit":"nightgown"}),
 V("C его рука","lying on bed, on side, resting, closed eyes, relaxed, male hand, hand on another's head, headpat, solo focus, from above",look={"outfit":"nightgown"}),
 portrait("D портрет","lying, on side, closed eyes, relaxed, light smile, pillow",look={"outfit":"nightgown"})]

# ---- 3. femdom with an object / into him
def femdom(k, act, cl, lora=None, angle="", her="smirk, looking down"):
    v=[A()]
    if lora: v.append(V("B + LoRA",TAGS[k],loras=lora))
    v.append(close("C крупно без лиц","close-up, hetero, femdom, "+cl+", "+HERHAND+", thighs, lower body, head out of frame",["wife","husband"]))
    if angle: v.append(V("D другой ракурс",angle))
    v.append(portrait("E портрет",her+", nude, femdom"))
    v.append(close("E вставка","close-up, hetero, femdom, "+cl+", lower body, head out of frame",["wife","husband"],hands=["wife"]))
    return v
P["prostate"]=femdom("prostate","","(prostate milking:1.2), (anal fingering:1.2), finger in ass, handjob, small penis, precum, spread legs",PROST,
  "hetero, femdom, (prostate milking:1.3), (anal fingering:1.2), handjob, man lying on back, legs up, spread legs, girl kneeling, small penis, precum, from above")
P["came_prostate"]=femdom("came_prostate","","(prostate milking:1.2), (anal fingering:1.2), finger in ass, ejaculation, cum, small penis",PROST,
  "hetero, femdom, (prostate milking:1.3), (anal fingering:1.2), handsfree ejaculation, cum, man lying on back, legs up, spread legs, from above")
P["dildo_him"]=femdom("dildo_him","","(anal object insertion:1.2), (dildo:1.2), holding dildo, ass focus, man on all fours",None,
  "hetero, femdom, (dildo:1.3), (anal object insertion:1.3), holding dildo, man on all fours, girl kneeling behind, ass, from side")
P["came_dildo_him"]=femdom("came_dildo_him","","(anal object insertion:1.2), (dildo:1.2), holding dildo, ejaculation, cum, ass focus",None,
  "hetero, femdom, (dildo:1.3), (anal object insertion:1.3), holding dildo, handsfree ejaculation, cum on bed, man on all fours, girl kneeling behind, from side")
P["fisting_him"]=femdom("fisting_him","","(anal fisting:1.2), fisting, arm, ass focus, spread legs",None,
  "hetero, femdom, (anal fisting:1.3), fisting, man lying on back, legs up, girl kneeling, from above")
P["came_fisting_him"]=femdom("came_fisting_him","","(anal fisting:1.2), fisting, ejaculation, cum, ass focus",None,
  "hetero, femdom, (anal fisting:1.3), fisting, handsfree ejaculation, cum, man lying on back, legs up, from above")
P["came_pegging"]=femdom("came_pegging","","(pegging:1.2), (strap-on:1.2), girl penetrating man, handsfree ejaculation, cum, ass focus",None,
  "hetero, femdom, (strap-on:1.3), (pegging:1.3), girl penetrating man, man on all fours, girl behind man, hands on another's hips, handsfree ejaculation, cum on bed, from behind")
P["came_spank_him"]=femdom("came_spank_him","","(spanking:1.2), red ass, hand raised, ejaculation, cum, ass focus",None,
  "hetero, femdom, (spanking:1.3), over the knee, man lying on lap, red ass, ejaculation, cum, girl sitting, from side")
P["toy_on_her"]=[A(),
 close("C крупно без лиц","close-up, hetero, (dildo:1.2), vaginal object insertion, object insertion, male hand, holding dildo, pussy, pussy juice, spread legs, lower body, head out of frame",["wife","husband"],hands=["husband"]),
 V("D другой ракурс","hetero, (dildo:1.2), vaginal object insertion, holding dildo, man between legs, spread legs, lying on back, on bed, pussy juice, blush, open mouth, from below",look=NAKED),
 portrait("E портрет","blush, open mouth, half-closed eyes, lying on back, nude"),
 close("E вставка","close-up, (dildo:1.2), vaginal object insertion, male hand, holding dildo, pussy juice, lower body, head out of frame",["wife","husband"],hands=["husband"])]
P["came_toy_on_her"]=[A(),
 close("C крупно без лиц","close-up, hetero, (dildo:1.2), vaginal object insertion, male hand, holding dildo, (female orgasm:1.1), pussy juice, trembling, spread legs, lower body, head out of frame",["wife","husband"],hands=["husband"]),
 V("D другой ракурс","hetero, (dildo:1.2), vaginal object insertion, holding dildo, man between legs, (female orgasm:1.2), arched back, trembling, spread legs, on bed, pussy juice, from below",look=NAKED),
 portrait("E портрет","(female orgasm:1.1), ahegao, trembling, blush, lying on back, nude"),
 close("E вставка","close-up, (dildo:1.2), vaginal object insertion, male hand, holding dildo, (pussy juice:1.2), trembling, lower body, head out of frame",["wife","husband"],hands=["husband"])]
P["rimming_her"]=[A(),
 V("B + LoRA",TAGS["rimming_her"],loras=RIM),
 close("C крупно без лиц","close-up, hetero, (anilingus:1.3), licking anus, tongue, spread ass, ass focus, from behind",["wife","husband"],loras=RIM),
 V("D другой ракурс","hetero, (anilingus:1.3), licking anus, face in ass, lying on stomach, ass up, on bed, man behind her, looking back, blush, from behind",look=NAKED),
 portrait("E портрет","blush, looking back, open mouth, half-closed eyes, nude, all fours")]
P["came_rimming_her"]=[A(),
 V("B + LoRA",TAGS["came_rimming_her"],loras=RIM),
 close("C крупно без лиц","close-up, hetero, (anilingus:1.3), licking anus, tongue, spread ass, ass focus, trembling, pussy juice, from behind",["wife","husband"],loras=RIM),
 portrait("E портрет","(female orgasm:1.1), trembling, blush, looking back, nude")]
P["fd_tease"]=[A(),
 V("B другие теги","hetero, femdom, teasing, (hand on another's crotch:1.3), (bulge:1.2), clothed male, pants, sitting on lap, straddling, smirk, whispering, from side"),
 close("C крупно без лиц","close-up, hetero, femdom, (hand on another's crotch:1.3), bulge, clothed male, pants, "+HERHAND+", thighs, skirt, lower body, head out of frame",["wife","husband"]),
 portrait("E портрет","smirk, half-closed eyes, teasing, looking at viewer, femdom")]

# ---- 4. poses the model does not know
for k,who in (("sixty_nine","husband"),("patron_sixty_nine","patron")):
    mk=IH if who=="husband" else IG
    P[k]=[A(),
     V("B другие теги, сверху","hetero, (69:1.3), (upside-down:1.1), lying on person, girl on top, fellatio, cunnilingus, man lying on back, penis, from above",look=NAKED),
     V("C сбоку","hetero, (69:1.3), girl on top, all fours, man lying on back, fellatio, cunnilingus, licking, from side",look=NAKED),
     portrait("D портрет","fellatio, penis in mouth, blush, saliva, nude"),
     mk("D вставка","(69:1.2), cunnilingus, licking pussy, tongue, ass focus, lower body, from behind")]
P["sauna_massage"]=[A(),
 V("B другие теги","sauna, steam, towel, (massage:1.3), (girl on top:1.2), sitting on person, straddling, man lying on stomach, hands on another's back, sweat, wet, from above"),
 V("C сбоку","sauna, steam, naked towel, (massage:1.3), girl kneeling beside, man lying on stomach, hands on another's back, back, sweat, from side"),
 close("D руки на спине","close-up, (massage:1.3), hands on another's back, back, male focus, sweat, wet, shiny skin, steam, "+HERHAND,["wife","patron"],hands=["wife"]),
 portrait("E портрет","sauna, steam, towel, naked towel, sweat, wet hair, smile")]
P["body_shot"]=[A(),
 V("B другие теги","(lying on table:1.2), on back, alcohol, liquor, shot glass, (licking stomach:1.2), navel, blush, from side",look={"outfit":"topless"}),
 V("C сверху","lying on table, on back, alcohol, pouring, (wet:1.1), liquid, navel, stomach, blush, looking at viewer, from above",look={"outfit":"topless"}),
 close("D крупно","close-up, licking stomach, tongue, navel, stomach, (wet:1.1), liquid, alcohol, shot glass, wet",["wife","patron"]),
 portrait("E портрет","blush, drunk, smile, lying on table, topless")]

# ---- 5. scenes without her
P["deal"]=[A(),
 V("B только двое","(2boys:1.2), (handshake:1.2), money, banknote, men standing, suit, talking, interracial, upper body, from side",roles=["husband","patron"]),
 portrait("C её портрет","worried, nervous, looking to the side, hands together, waitress"),
 close("C вставка руки","close-up, handshake, holding money, banknote, hand, male focus",["husband","patron"])]
P["table_sit"]=[A(),
 V("B другие теги","(2boys:1.2), sitting at table, beer mug, drinking, talking, interracial, casual, from side"),
 V("C издалека","(2boys:1.2), sitting at table, cafe, beer, talking, wide shot, scenery"),
 close("D руки и кружки","close-up, beer mug, table, hands, holding cup, male focus, cafe",["husband","patron"])]

# ---- 6. close-ups
D={}
D["him_bulge"]=[A(),
 V("B один, сидит","close-up, solo, male focus, (bulge:1.2), erection under clothes, (baggy pants:1.1), sitting, hands on own knees, crotch focus, lower body",negative="(2boys:1.4), (multiple boys:1.3), yaoi, 1girl"),
 V("C стоит, сверху","close-up, solo, male focus, (bulge:1.2), erection under clothes, jeans, standing, from above, crotch focus, lower body",negative="(2boys:1.4), (multiple boys:1.3), yaoi, 1girl"),
 V("D сбоку","close-up, solo, male focus, (bulge:1.2), erection under clothes, sweatpants, from side, lower body",negative="(2boys:1.4), (multiple boys:1.3), yaoi, 1girl")]
D["him_cum_pants"]=[A(),
 V("B один, сидит","close-up, solo, male focus, (cum stain:1.2), wet clothes, (baggy pants:1.1), sitting, crotch focus, lower body",negative="(2boys:1.4), (multiple boys:1.3), yaoi, 1girl, body hair, hairy"),
 V("C сверху","close-up, solo, male focus, (cum stain:1.2), wet clothes, sweatpants, from above, crotch focus, lower body",negative="(2boys:1.4), (multiple boys:1.3), yaoi, 1girl, body hair, hairy")]
D["touch_bulge"]=[A(),
 V("B с её бёдрами","close-up, hetero, 1girl, 1boy, "+HERHAND+", (hand on another's crotch:1.3), bulge, clothed male, (baggy pants:1.1), sitting, thighs, skirt, lower body",roles=["patron","wife"],hands=[],negative="yaoi, (2boys:1.4)"),
 V("C сверху","close-up, hetero, "+HERHAND+", (hand on another's crotch:1.3), bulge, clothed male, pants, from above, lower body",roles=["patron","wife"],hands=["wife"],negative="yaoi, (2boys:1.4)")]
D["join_ruined"]=[A(),
 V("B с её телом","close-up, hetero, femdom, (ruined orgasm:1.2), "+HERHAND+", hand away, ejaculation, cum, small penis, kneeling, thighs, lower body",roles=["husband","wife"],hands=[],negative="yaoi, (2boys:1.4)"),
 V("C рука крупно","close-up, hetero, (ruined orgasm:1.2), "+HERHAND+", open hand, ejaculation, cum, small penis, crotch focus",negative="yaoi, (2boys:1.4)")]
D["show_breasts"]=[A(),
 V("B платье вниз","close-up, (presenting:1.2), (dress pull:1.2), breasts out, nipples, clothed, skirt, upper body, head out of frame",look={"outfit":"modest"}),
 V("C задрала","close-up, (shirt lift:1.2), lifting own clothes, breasts out, nipples, skirt, cowboy shot, head out of frame",look={"outfit":"modest"})]
D["toy_a"]=[A(),
 V("B без stretched, сзади","close-up, (anal object insertion:1.3), dildo, object insertion, ass focus, spread ass, from behind, lower body, head out of frame"),
 V("C пробка","close-up, (butt plug:1.3), anal object insertion, ass focus, from behind, lower body"),
 V("D лёжа","close-up, (anal object insertion:1.3), dildo, lying on stomach, ass, from above, lower body")]
D["wet_sheet"]=[A(),
 V("B она под одеялом","(under covers:1.2), blanket, (cum stain:1.2), wet spot, sleeping, lying, on bed, pillow, night, from above",roles=["wife"],close=True,face=True),
 V("C оба под одеялом","(under covers:1.2), blanket, (cum stain:1.2), wet spot, sleeping, lying, on bed, night, from above",roles=["wife","husband"],close=True),
 V("D без людей, одеяло","no humans, blanket, (cum stain:1.3), (excessive cum:1.2), wet spot, messy bed, bed sheet, pillow, still life")]
D["xray_a"]=[A(),
 V("B без влагалища","close-up, hetero, (anal:1.2), (x-ray:1.2), cross-section, penis in ass, internal, ass focus, from behind",negative="vaginal, (pussy:1.2), uterus"),
 V("C снизу","close-up, hetero, anal, (cross-section:1.3), penis in ass, deep penetration, lower body, from below",negative="vaginal, (pussy:1.2), uterus")]
D["xray_v"]=[A(),
 V("B с влагалищем","close-up, hetero, sex, vaginal, (cross-section:1.3), x-ray, penis in pussy, pussy, cervix, uterus, deep penetration, lower body, spread legs"),
 V("C только просвет","(cross-section:1.3), x-ray, uterus, cervix, internal cumshot, penis, (close-up:1.2)")]
D["xray_toy"]=[A(),
 V("B вагинально","close-up, (cross-section:1.3), x-ray, dildo, vaginal object insertion, uterus, pussy, lower body"),
 V("C анально","close-up, (cross-section:1.3), x-ray, dildo, anal object insertion, ass, from behind, lower body")]

plan=[]
for k,vs in P.items(): plan.append({"id":k,"variants":vs})
for k,vs in D.items(): plan.append({"id":"detail_"+k,"variants":vs})

# ---- portraits by mood, and one plain close-up of the act per pair scene
MOODS=["plain","happy","tender","shy","worried","ashamed","guilty","annoyed","angry","scared","aroused","ecstatic"]
add=[]
for m in MOODS:
    add.append({"id":f"portrait_{m}","kind":"scene","roles":["wife"],"room":"cafe.hall","tags":{"outfit":"modest","face":m},"type":"idle","about":f"Портрет: {m}, кафе, рабочее платье","tags_text":"portrait, upper body, solo, looking at viewer"})
    plan.append({"id":f"portrait_{m}","variants":[V("A по пояс",None,fix=False),V("B кадр шире","solo, looking at viewer, cowboy shot",fix=False),close("C лицо крупно","portrait, close-up, solo, looking at viewer",["wife"],face=True,fix=False)]})
for m in ["plain","tender","shy","aroused","annoyed"]:
    add.append({"id":f"portrait_home_{m}","kind":"scene","roles":["wife"],"room":"home.bedroom","tags":{"outfit":"nightgown","face":m},"type":"idle","about":f"Портрет: {m}, дома, ночнушка","tags_text":"portrait, upper body, solo, looking at viewer, sitting on bed"})
    plan.append({"id":f"portrait_home_{m}","variants":[V("A по пояс",None,fix=False)]})

DROP=re.compile(r"^(from |cowboy shot|full body|upper body|wide shot|lying|kneeling|standing|sitting|all fours|straddling|girl on top|on bed|man |between legs|bent over|leaning|hands on table|height difference|looking|smirk|blush|moaning|open mouth|closed eyes|head back|tears|ahegao|surprised|bored|expressionless|frustrated|disappointed|embarrassed|eye contact|seductive|bedroom eyes|holding phone|facing away|reaching back|hug|leg lock|legs up|spread legs|girl behind man|hands? on another's|clothed|chair|table|covering|whispering|watching|crossed arms|disgust|half-closed|tongue out|smile|heavy breathing|sitting side by side|cum swap|kiss|upright|large penis|penis$|thighs$|feet$|soles$|ass$|trembling|arched back|after sex)")
ORAL=re.compile(r"fellatio|deepthroat|irrumatio|cum in mouth|facial|licking penis|snowball")
BREAST=re.compile(r"paizuri|cum on breasts|breast sucking")
FEET=re.compile(r"footjob")
FACE=re.compile(r"sitting on face")
SKIP={"kissing","patron_groping","patron_lap_dance","by_hand","caught","talk","wants_him","him_hug","him_kiss","him_grope","bath_together","patron_touching"}
n_ins=0
for k,roles in ROLES.items():
    t=TAGS[k]
    if k in SKIP or "wife" not in roles or not re.search(r"\bhetero\b|femdom",t): continue
    men=[r for r in roles if r!="wife"]
    if len(men)!=1: continue
    man=men[0]; who="husband" if man=="husband" else "patron"
    act=[w.strip() for w in t.split(",") if w.strip() and w.strip()!="hetero" and not DROP.search(w.strip())]
    if ORAL.search(t): frame="close-up, (eyes out of frame:1.2), lips"
    elif BREAST.search(t): frame="close-up, breast focus, head out of frame"
    elif FEET.search(t): frame="close-up, feet, soles, lower body"
    elif FACE.search(t): frame="close-up, thighs, ass focus, from below"
    else: frame="close-up, lower body, head out of frame"
    tags=f"{frame}, hetero, "+", ".join(act)
    u=check(tags)
    if u: bad.append((k,u))
    iid=f"insert_{k}_{who}"
    add.append({"id":iid,"kind":"detail","roles":["wife",who],"room":"any","tags":{},"close":True,"about":f"Вставка акта: {k}, {('муж' if who=='husband' else 'гость')} (нейтральная)","tags_text":tags})
    plan.append({"id":iid,"variants":[V("A нейтрально",None)]})
    n_ins+=1
# the same 4 seeds for all variants of one key
for e in plan: e["seeds"]=[random.randrange(2**31) for _ in range(4)]
out={"n":4,"add":add,"plan":plan}
json.dump(out,open('/home/claude/night/night-plan.json','w'),ensure_ascii=False,indent=1)
takes=sum(len(e["variants"]) for e in plan)
print("keys",len(plan),"weak",len(P)+len(D),"inserts",n_ins,"portraits",len(MOODS)+5,"takes",takes,"pictures",takes*4)
print("unknown tags:"); [print(' ',l,u) for l,u in bad]
