// Plays a playtest again, move for move, from the notes file the game saves (the moves are at its end, after "=== replay ===").
//   npx tsx tools/replay.ts playtest-notes-20a.txt            every note: where it was, what was on screen, the last lines of the log
//   npx tsx tools/replay.ts playtest-notes-20a.txt 412        stop after move 412 of the record ("запись 412" in a note)
//   npx tsx tools/replay.ts playtest-notes-20a.txt 412 out.json   ... and write a save of that moment, to load in the game
// The same build must be checked out: a move the code no longer offers stops the replay with a message.
import { readFileSync, writeFileSync } from "node:fs";
import { baseLocales, baseMod, bs, clockText, renderLog } from "../packages/base/src";
import { cheatsLocales, cheatsMod } from "../packages/mods/cheats/src";
import { createEngine, createTranslator, loadGame, saveGame } from "../packages/core/src";
import type { Action, GameState } from "../packages/core/src";

const [file, stopArg, out] = process.argv.slice(2);
if (!file) throw new Error("usage: replay.ts notes.txt [move] [out.json]");
const text = readFileSync(file, "utf8");
const at = text.indexOf("=== replay ===");
if (at < 0) throw new Error("no move record in this file: it was saved by a build before 20a, or the game was started before it");
const journal = JSON.parse(text.slice(at + "=== replay ===".length).trim().split("\n")[0]!) as { build: string; base: { seed: number; setup?: unknown } | { save: string }; actions: Action[]; mods?: string[] };
if (journal.mods?.length) console.log(`! mods loaded from files during this game (${journal.mods.join(", ")}): moves after that may not replay`);
const mods = [baseMod, cheatsMod];
const engine = createEngine(mods);
const t = createTranslator({ en: [baseLocales.en!, cheatsLocales.en ?? {}], ru: [baseLocales.ru!, cheatsLocales.ru ?? {}] }, "ru");

// the moves the notes point at ("запись N"), to stop at each of them
const marks = [...text.slice(0, at).matchAll(/запись (\d+)\n {2}(.*)/g)].map((m) => ({ n: Number(m[1]), note: m[2]! }));
const stops = stopArg ? [{ n: Number(stopArg), note: "" }] : marks;
const show = (s: GameState, n: number, note: string) => {
  const b = bs(s);
  const scene = engine.currentScene(s);
  console.log(`\n--- запись ${n}: день ${s.time.day} ${clockText(s.time.minute)} ${s.time.phase} | ход ${s.turn} | сцена ${scene?.type ?? "-"} @${scene?.location ?? "-"} | она ${s.where.wife}, ты ${s.where.husband}`);
  if (note) console.log(`    заметка: ${note}`);
  if (b.encounter) console.log(`    встреча: ${b.encounter.act} с ${b.encounter.patron} в ${b.encounter.loc}`);
  if (b.shift?.attend) console.log(`    она в комнате: ${b.shift.attend.loc} (${b.shift.attend.why})`);
  for (const e of s.log.slice(-8)) console.log(`    ${e.tags?.includes("unseen") ? "*" : " "} ${renderLog(e, t, "ru")}`);
  const bad = engine.checkInvariants(s);
  if (bad.length) console.log(`    ! ${bad.join("; ")}`);
};

let s: GameState = "save" in journal.base ? loadGame(journal.base.save, mods).state : engine.init(journal.base.seed, journal.base.setup ? { base: journal.base.setup as never } : undefined);
const last = Math.max(0, ...stops.map((x) => x.n));
for (let i = 0; i < Math.min(last, journal.actions.length); i++) {
  try {
    s = engine.dispatch(s, journal.actions[i]!);
  } catch (e) {
    console.log(`! move ${i + 1} (${JSON.stringify(journal.actions[i])}) does not replay: ${(e as Error).message}`);
    break;
  }
  for (const x of stops) if (x.n === i + 1) show(s, x.n, x.note);
}
if (out) {
  writeFileSync(out, saveGame(s, engine));
  console.log(`\nsave written to ${out}`);
}
console.log(`\n${Math.min(last, journal.actions.length)} of ${journal.actions.length} moves replayed (build ${journal.build})`);
