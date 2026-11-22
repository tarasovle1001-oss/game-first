// night 22.11: the pack for the game, in passes. Reads the game's own plans (probe-plan: every layout once; pack-plan: keys by how often
// bots see them), swaps the goth's body for figure B, puts the concept LoRAs and the compositions found on 21.11 onto the layouts that
// need them, and writes one plan file per pass and LoRA group for tools/comfy-run.ts. Nothing is written into the game.
//   node tools/prompt-lab/data/pack-night.mjs [rowsPerPass=400] [passes=12] [loraWeight=0.6]
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
const [M = "400", P = "12", W = "0.6"] = process.argv.slice(2);
const dir = "tools/prompt-lab/data/pack";
const probe = JSON.parse(readFileSync(`${dir}/probe-plan.json`, "utf8"));
const pack = JSON.parse(readFileSync(`${dir}/pack-plan.json`, "utf8"));
const OLD_BODY = "slim, slender body, medium breasts, (narrow waist:1.3), (ass visible through thighs:1.3)";
const BODY_B = "slender, medium breasts, (narrow waist:1.2), (wide hips:1.1), (ass visible through thighs:1.2), thigh gap, toned";
const GROUPS = [
  ["femdom", /^(came_)?(prostate|pegging|dildo_him|fisting_him|spank_him)$|^detail_toy_him$/, "tc_femdom"],
  ["xray", /^detail_xray/, "tc_xray"],
  ["groups", /^group_|^(came_)?join_(dp|two_mouths)$/, "tc_groups"],
  ["sixtynine", /sixty_nine/, "tc_sixtynine"],
  ["hisclose", /^detail_him_|^detail_touch_|^detail_join_|^(came_)?(chastity|footjob|tease_denial|edging|ignore_handjob)$|^lead_ruined$|^went_soft$|^by_hand$|^handjob$/, "tc_hisclose"],
];
const HIS_NEG = "(dark-skinned male:1.4), dark skin, tan, (abs:1.3), muscular male, (veiny penis:1.3), (large penis:1.4), leg hair, chest hair";
const HAND = "(female hand:1.3), (pale hand:1.3), pale arm, slender arm, slender fingers, (black nails:1.2), wedding ring";
const FPOV_NEG = "(dark-skinned hand:1.4), dark hand, male arm, muscular arm, veiny arm, (2boys:1.6), multiple boys, second penis, (multiple penises:1.5), anal sex, penis in anus, male pov, pov crotch, 1girl, breasts, pussy, gloves";
const SOLO_NEG = "1girl, female, breasts, pussy, (2boys:1.5), multiple boys, another person, hand, hands";
// scene part replaced wholesale: [new scene tags, regions kept, extra negative, size]
const OV = {
  prostate: [`close-up, femdom, female pov, pov, pov hands, ${HAND}, (anal fingering:1.4), index finger in anus, (prostate milking:1.2), (male penetrated:1.2), 1boy, (solo focus:1.2), male focus, man on all fours, male ass, from behind, precum, precum drip`, ["husband"], FPOV_NEG, "1024x1024"],
  fisting_him: [`close-up, femdom, female pov, pov, pov hands, ${HAND}, (anal fisting:1.5), (arm in anus:1.3), forearm in anus, hand inside, wrist deep, stretched anus, (male penetrated:1.2), 1boy, (solo focus:1.2), male focus, man on all fours, male ass, from behind`, ["husband"], FPOV_NEG + ", fingers visible, hand on ass, anal fingering", "1024x1024"],
  dildo_him: ["1boy, solo, male focus, close-up, from behind, all fours, ass up, (anal object insertion:1.4), (dildo:1.3), dildo in anus, ass focus, male ass, testicles, arms out of frame, head out of frame", ["husband"], SOLO_NEG, "1024x1024"],
  detail_toy_him: ["1boy, solo, male focus, close-up, from behind, bent over, (anal object insertion:1.4), (butt plug:1.3), ass focus, male ass, testicles, arms out of frame, head out of frame", ["husband"], SOLO_NEG, "1024x1024"],
  pegging: ["1girl, 1boy, hetero, femdom, (pegging:1.3), strap-on, anal, (black strap-on:1.3), black dildo, strap-on harness, breasts, from side, man on all fours, girl kneeling behind him, hands on another's hips", ["wife", "husband"], "male wearing strap-on, girl on all fours, female pegged, vaginal, penis in pussy, flesh-colored dildo", "832x1216"],
};
for (const k of Object.keys(OV)) OV["came_" + k] = [OV[k][0] + ", (handsfree ejaculation:1.2), cum, cumdrip", OV[k][1], OV[k][2], OV[k][3]];

const part = (r, role) => {
  if (r.regions?.[role]) return r.regions[role];
  const w = r.positive.indexOf("adult woman"), h = r.positive.indexOf("adult man");
  const cut = (x, y) => (x < 0 ? "" : r.positive.slice(x, y > x ? y : undefined).replace(/[, ]+$/, ""));
  return role === "wife" ? cut(w, h) : cut(h, w);
};
const fix = (r, src) => {
  const g = GROUPS.find((x) => x[1].test(r.layout));
  let positive = r.positive, negative = r.negative ?? "", size = r.size;
  const ov = OV[r.layout];
  if (ov) {
    positive = ["masterpiece, best quality", ov[0], "uncensored, sora \\(soraoraora\\)", ...ov[1].map((role) => part(r, role)).filter(Boolean)].join(", ");
    negative = ov[2] + ", " + negative; size = ov[3];
  }
  positive = positive.replaceAll(OLD_BODY, BODY_B);
  if (g) positive = g[2] + ", " + positive;
  if (g?.[0] === "hisclose") { positive += ", precum"; negative = HIS_NEG + ", " + negative; }
  if (r.layout === "detail_xray_a") negative = "(uterus:1.5), (womb:1.4), cervix, ovaries, (intestines:1.4), organs, " + negative;
  return { key: r.key, file: r.file, layout: r.layout, positive, negative, empty: r.empty ?? [], ...(size ? { size } : {}), group: g ? g[0] : "none", lora: g ? g[2] : "", n: r.n ?? 0, src };
};
// order: every layout once (probe), then the keys bots see, round-robin over layouts by how often each is seen
const seen = new Set();
const order = [];
const push = (r, src) => { if (!seen.has(r.key)) { seen.add(r.key); order.push(fix(r, src)); } };
for (const r of probe.plan) push(r, "probe");
const by = new Map();
const lay = (r) => (r.layout === "portrait" ? "portrait:" + (r.tags?.outfit ?? "") + ":" + (r.location ?? "") : r.layout);
for (const r of [...pack.plan, ...pack.insert, ...pack.detail, ...pack.portrait].sort((a, b) => b.n - a.n)) { const k = lay(r); if (!by.has(k)) by.set(k, []); by.get(k).push(r); }
for (let rank = 0; ; rank++) { let any = false; for (const list of by.values()) if (list[rank]) { push(list[rank], "pack"); any = true; } if (!any) break; }
mkdirSync(`${dir}/passes`, { recursive: true });
const m = Number(M), names = ["none", ...GROUPS.map((g) => g[0])];
const index = [];
for (let p = 0; p < Number(P) && p * m < order.length; p++) {
  const rows = order.slice(p * m, (p + 1) * m);
  for (const g of names) {
    const part = rows.filter((r) => r.group === g);
    if (!part.length) continue;
    const file = `${dir}/passes/pass${String(p + 1).padStart(2, "0")}_${g}.json`;
    writeFileSync(file, JSON.stringify({ plan: part, base: [] }));
    index.push({ pass: p + 1, group: g, lora: part[0].lora, weight: Number(W), rows: part.length, file });
  }
}
writeFileSync(`${dir}/passes/index.json`, JSON.stringify(index, null, 1));
console.log(`${order.length} keys in order (${probe.plan.length} probe); ${index.length} plan files`);
for (const i of index.slice(0, 14)) console.log(` pass ${i.pass} ${i.group} ${i.rows}`);
