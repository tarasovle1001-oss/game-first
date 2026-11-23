import { describe, expect, it } from "vitest";
import { getOnScreen, picNote, setOnScreen } from "../../ui/src/pack";
import type { Shot } from "../../ui/src/pack";

const shot = (key: string, exact: boolean, variant: number): Shot => ({
  url: "blob:x",
  key,
  exact,
  asked: `${key}/face=happy`,
  desc: { type: key.split("/")[0]!, location: "cafe.hall", participants: [{ id: "wife", role: "wife" }], tags: {} },
  file: `${key.replaceAll("/", "__")}~${variant + 1}.png`,
  variant,
  source: "pack",
});

describe("picture block of a playtest note", () => {
  it("is empty on the mannequin", () => {
    setOnScreen(null);
    expect(picNote()).toEqual([]);
  });
  it("names every frame, big one first, and ends with one JSON line without prompts", () => {
    setOnScreen({ where: "here", pick: "5:2", split: true, frames: [{ slot: "main", shot: shot("insert_sex/patron/any", true, 1) }, { slot: "insert", shot: shot("portrait/wife/cafe.hall", false, 0) }] });
    const lines = picNote("goth-1a2b");
    expect(lines[0]).toBe("pic main | показан: insert_sex/patron/any | просили: insert_sex/patron/any/face=happy | точный | pack insert_sex__patron__any~2.png ~1");
    expect(lines[1]).toContain("pic ins1 | показан: portrait/wife/cafe.hall");
    expect(lines[1]).toContain("| запасной |");
    expect(lines[2]!.startsWith("pics {")).toBe(true);
    const json = JSON.parse(lines[2]!.slice(5));
    expect(json).toMatchObject({ pick: "5:2", split: true, card: "goth-1a2b", frames: [{ slot: "main", variant: 1 }, { slot: "insert", exact: false }] });
    expect(lines[2]).not.toContain("positive");
    expect(getOnScreen()?.frames.length).toBe(2);
  });
  it("leaves the note text readable to tools/replay.ts", () => {
    setOnScreen({ where: "away", pick: "5:1", split: false, frames: [{ slot: "main", shot: shot("sex/husband+wife/home.bedroom", true, 0) }] });
    const note = `[21] день 1, 11:00 | seed 5, ход 3, запись 7\n${picNote().map((l) => `  ${l}\n`).join("")}  мой текст`;
    const marks = [...note.matchAll(/запись (\d+)\n(?: {2}pics? [^\n]*\n)* {2}(.*)/g)].map((m) => [m[1], m[2]]);
    expect(marks).toEqual([["7", "мой текст"]]);
    expect(note).toContain("| away");
  });
});

import { declineName, declineRu } from "@tc/base";
describe("Russian: a guest's name takes its case after a preposition", () => {
  it("declines by the ending, with the two names that lose a vowel", () => {
    expect(declineName("Феликс", "dat")).toBe("Феликсу");
    expect(declineName("Павел", "gen")).toBe("Павла");
    expect(declineName("Пётр", "ins")).toBe("Петром");
    expect(declineName("Николай", "gen")).toBe("Николая");
    expect(declineName("Дмитрий", "prep")).toBe("Дмитрии");
    expect(declineName("Игорь", "dat")).toBe("Игорю");
    expect(declineName("Никита", "acc")).toBe("Никиту");
    expect(declineName("Лука", "gen")).toBe("Луки");
    expect(declineName("Бруно", "dat")).toBe("Бруно");
  });
  it("reads the finished line: only a known name right after a word that asks for a case", () => {
    expect(declineRu("Она поднимается к Феликс с заказом.")).toBe("Она поднимается к Феликсу с заказом.");
    expect(declineRu("У Павел звонит телефон.")).toBe("У Павла звонит телефон.");
    expect(declineRu("Сегодня с Адам было...")).toBe("Сегодня с Адамом было...");
    expect(declineRu("Наклоняясь к столу Даниил, она смотрит.")).toBe("Наклоняясь к столу Даниила, она смотрит.");
    expect(declineRu("Феликс уходит к себе. Она смотрит на Борис.")).toBe("Феликс уходит к себе. Она смотрит на Бориса.");
    expect(declineRu("Она идёт к Номер 2.")).toBe("Она идёт к Номер 2."); // not a name
  });
});
