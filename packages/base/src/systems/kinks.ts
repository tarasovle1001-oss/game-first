// Kink switches (27.11, a must for the alpha): the player turns off a whole direction or single items of it (content/kinks.yaml).
// What is off is gone from the game, not just hidden: the systems ask here before they offer, pick or picture something.
// Off ids (directions or items) live in the save (b.kinks); the screen also keeps them as the player's profile for new games.
import type { Ctx, GameState, ModApi } from "@tc/core";
import { content } from "../content";
import type { KinkItem } from "../content/schema";
import { bs } from "../state";

export const SET_KINKS = "base/kinks";
const K = content.kinks;
const DIR_ITEMS = new Map(K.directions.map((d) => [d.id, d.items]));
const ALL_IDS = new Set(K.directions.flatMap((d) => [d.id, ...d.items.map((i) => i.id)]));

/** The items that are off: listed themselves, or their whole direction is. */
export function offItems(state: GameState): KinkItem[] {
  const off = bs(state).kinks;
  if (!off?.length) return [];
  const ids = new Set(off);
  return K.directions.flatMap((d) => (ids.has(d.id) ? d.items : d.items.filter((i) => ids.has(i.id))));
}
const anyOff = (state: GameState, pick: (i: KinkItem) => readonly string[] | undefined, id: string) => offItems(state).some((i) => pick(i)?.includes(id));

/** An act the player turned off: nobody offers it, nobody does it. */
export const actOff = (state: GameState, act: string) => anyOff(state, (i) => i.acts, act);
/** Where a man finishes, turned off: he finishes somewhere else. */
export const finishOff = (state: GameState, place: string) => anyOff(state, (i) => i.finish, place);
/** How she ends it in bed (ruined, snowball, lick_clean), turned off. */
export const endingOff = (state: GameState, how: string) => anyOff(state, (i) => i.ending, how);
/** A floor dare, turned off. */
export const dareOff = (state: GameState, dare: string) => anyOff(state, (i) => i.dare, dare);
/** A close-up picture type (detail_*), turned off. */
export const detailOff = (state: GameState, type: string) => anyOff(state, (i) => i.detail, type);
/** A whole system: crowd_join, cage, toy_buy. */
export const flagOff = (state: GameState, flag: "crowd_join" | "cage" | "toy_buy") => anyOff(state, (i) => i.flags, flag);

/** Finishing places with the switched-off ones taken out; if that leaves nothing, the plainest place still allowed (or "body"). */
export function allowedPlaces(state: GameState, places: string[]): string[] {
  const left = places.filter((p) => !finishOff(state, p));
  if (left.length) return left;
  const plain = ["on_her", "body", "belly", "chest", "thighs", "hands"].find((p) => !finishOff(state, p));
  return [plain ?? "body"];
}

/** Only known ids, each once; a direction that is off makes its items redundant. */
export function cleanKinks(ids: unknown): string[] {
  if (!Array.isArray(ids)) return [];
  const set = new Set(ids.filter((x): x is string => typeof x === "string" && ALL_IDS.has(x)));
  for (const [dir, items] of DIR_ITEMS) if (set.has(dir)) for (const i of items) set.delete(i.id);
  return [...set].sort();
}

export function applyKinks(ctx: Ctx, ids: unknown) {
  const b = bs(ctx.state);
  b.kinks = cleanKinks(ids);
  // the cage turned off: he is let out at once
  if (flagOff(ctx.state, "cage") && b.husband.caged) delete b.husband.caged;
}

export function registerKinks(api: ModApi) {
  // the switches are not a move of the story: never listed, always accepted (the screen sends it; the journal replays it)
  api.actions.register({
    id: SET_KINKS,
    labelKey: "ui.kinks.menu",
    enumerate: () => [],
    accepts: () => true,
    apply: (ctx, a) => applyKinks(ctx, a.payload?.off),
  });
}
