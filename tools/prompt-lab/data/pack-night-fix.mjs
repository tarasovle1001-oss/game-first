// probe-plan rows have no `regions`: take her / his part out of `positive` ("adult woman ..." / "adult man ...")
import { readFileSync, writeFileSync } from "node:fs";
const f = "tools/prompt-lab/data/pack-night.mjs";
let s = readFileSync(f, "utf8");
if (s.includes("const part = (r, role)")) { console.log("already"); process.exit(0); }
const a = "ov[1].map((role) => r.regions?.[role])";
if (!s.includes(a)) throw new Error("anchor");
s = s.replace(a, "ov[1].map((role) => part(r, role))");
s = s.replace("const fix = (r, src) => {", `const part = (r, role) => {
  if (r.regions?.[role]) return r.regions[role];
  const w = r.positive.indexOf("adult woman"), h = r.positive.indexOf("adult man");
  const cut = (x, y) => (x < 0 ? "" : r.positive.slice(x, y > x ? y : undefined).replace(/[, ]+$/, ""));
  return role === "wife" ? cut(w, h) : cut(h, w);
};
const fix = (r, src) => {`);
writeFileSync(f, s);
console.log("ok");
