// Picture review: what each key of a pack is meant to show, from the game itself (23.11).
// For every key found in a list of pack files: the scene's name and act in Russian, who and where, her look in words,
// a couple of lines the game logs for that act, the prompt the game would draw it with, and how often a player sees it.
//   npx tsx tools/review/build-context.ts <files.txt> [views.json] [out=tools/review/context.json]
// files.txt: one pack file name per line (tab and anything after it ignored). views.json: tools/pack-gaps.ts output (rows: key, n).
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { content, promptFor, sceneAct } from "../../packages/base/src";

const [filesArg, viewsArg, outArg = "tools/review/context.json"] = process.argv.slice(2);
if (!filesArg) throw new Error("usage: build-context.ts <files.txt> [views.json] [out]");
const ru = content.locales.ru as Record<string, string>;
const say = (k: string) => ru[k] ?? ru[`${k}#1`];

// one key per frame group: "a__b__c__tags~3.png" -> "a/b/c/tags"
const keyOf = (file: string) => file.replace(/^﻿/, "").split("\t")[0]!.trim().replace(/\\/g, "/").split("/").pop()!.replace(/~\d+\.png$|\.png$/, "").split("__").join("/");
const files = readFileSync(filesArg, "utf8").split(/\r?\n/).filter((l) => l.trim().endsWith(".png") || /\.png\t/.test(l));
const keys = [...new Set(files.map(keyOf))].sort();

const views: Record<string, number> = {};
if (viewsArg && existsSync(viewsArg)) for (const r of (JSON.parse(readFileSync(viewsArg, "utf8")) as { rows: { key: string; n: number }[] }).rows) views[r.key] = (views[r.key] ?? 0) + r.n;

const ROLE: Record<string, string> = { wife: "она", husband: "муж", patron: "гость", patron2: "второй гость", patron3: "третий гость", watcher: "зритель" };
const SIZE = ["до 9 см", "9-14 см", "14-24 см", "24-34 см", "больше 34 см"];
const tagLine = (k: string, v: string): string => {
  switch (k) {
    case "outfit":
      return `наряд: ${say(`outfit.${v}`) ?? v}`;
    case "face":
      return `лицо: ${say(`face.${v}`) ?? v}`;
    case "bare":
      return `раздета: ${say(`bare.${v}`) ?? v}`;
    case "tsize":
      return `игрушка: ${SIZE[Number(v)] ?? v}`;
    case "size":
    case "size2":
    case "size3":
      return `член гостя: ${SIZE[Number(v)] ?? v}`;
    case "hsize":
      return `член мужа: ${SIZE[Number(v)] ?? v}`;
    case "men":
      return `мужчин: ${v}`;
    case "phase":
      return v === "after" ? "после (кончили)" : "в процессе";
    case "under":
      return v === "off" ? "без белья" : `бельё: ${v}`;
    case "skirt":
      return "юбка задрана";
    case "crowd":
      return "на виду у зала";
    case "who":
      return v === "her" ? "игрушка в её руке" : "игрушка в его руке";
    case "gape":
      return `растянута: ${v}`;
    case "fin":
      return `кончил: ${say(`fin.${v}`) ?? v}`;
    default:
      return `${k}=${v}`;
  }
};

const out: Record<string, unknown> = {};
for (const key of keys) {
  const [type = "", roleStr = "", location = "any", tagStr = ""] = key.split("/");
  const tags = Object.fromEntries(tagStr.split(",").filter(Boolean).map((x) => x.split("=") as [string, string]));
  const roles = roleStr.split("+").filter(Boolean);
  const isDetail = type.startsWith("detail_");
  let prompt = "";
  try {
    prompt = promptFor({ type, location, participants: roles.map((r, i) => ({ id: `${r}${i}`, role: r })), tags }).positive;
  } catch {
    prompt = "";
  }
  const act = isDetail ? undefined : sceneAct(type);
  // a couple of lines the game logs for this act: what the moment reads like in the story
  const lines = act
    ? Object.keys(ru)
        .filter((k) => k.startsWith(`log.act.${act.id}.`) && !k.includes("#"))
        .slice(0, 2)
        .map((k) => ru[k]!.replace(/\{name\}/g, "Гость").replace(/\{tip\}/g, "чаевые").replace(/\{room\}/g, "в комнате").replace(/\{[a-z]+\}/g, "..."))
    : [];
  out[key] = {
    type,
    title: isDetail ? `Деталь крупно: ${type.slice(7).replace(/_/g, " ")}` : (say(`scene.${type}`) ?? type),
    act: act ? (say(`act.${act.id}`) ?? act.id) : undefined,
    who: roles.map((r) => ROLE[r] ?? r).join(", "),
    where: location === "any" ? "без фона" : (say(`loc.${location}`) ?? location),
    look: Object.entries(tags).map(([k, v]) => tagLine(k, v)),
    lines,
    prompt: prompt.replace(/^tc_[a-z_]+, /, "").replace(/masterpiece, best quality, /, ""),
    views: views[key] ?? 0,
  };
}
writeFileSync(outArg, JSON.stringify(out));
console.log(`${keys.length} keys from ${files.length} files -> ${outArg} (${Object.values(views).length ? "with" : "without"} views)`);
