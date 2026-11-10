import type { EngineView, GameState, Mod } from "./types";

export const SAVE_FORMAT = 1;

export interface SaveFile {
  format: number;
  mods: Record<string, number>; // mod id -> version at save time
  state: GameState;
}

/** Core state migrations: index i upgrades format i+1 -> i+2. */
const coreMigrations: ((save: SaveFile) => SaveFile)[] = [];

export function saveGame(state: GameState, engine: EngineView): string {
  const file: SaveFile = {
    format: SAVE_FORMAT,
    mods: Object.fromEntries(engine.mods.map((m) => [m.id, m.version])),
    state,
  };
  return JSON.stringify(file);
}

export interface LoadResult {
  state: GameState;
  warnings: string[];
}

export function loadGame(json: string, mods: Mod[]): LoadResult {
  let file = JSON.parse(json) as SaveFile;
  const warnings: string[] = [];
  if (typeof file.format !== "number" || !file.state) throw new Error("not a save file");
  if (file.format > SAVE_FORMAT) throw new Error(`save format ${file.format} is newer than the game (${SAVE_FORMAT})`);
  while (file.format < SAVE_FORMAT) {
    file = coreMigrations[file.format - 1]!(file);
    file.format += 1;
  }
  const state = structuredClone(file.state);
  for (const mod of mods) {
    const saved = file.mods[mod.id];
    if (saved === undefined) {
      // mod added after the save was made
      state.mods[mod.id] = mod.initState ? mod.initState() : {};
      warnings.push(`mod "${mod.id}" is new for this save`);
    } else if (saved < mod.version) {
      if (!mod.migrate) throw new Error(`mod "${mod.id}" v${saved} -> v${mod.version}: no migration`);
      state.mods[mod.id] = mod.migrate(state.mods[mod.id], saved);
    } else if (saved > mod.version) {
      throw new Error(`save uses mod "${mod.id}" v${saved}, installed v${mod.version}`);
    }
  }
  for (const id of Object.keys(file.mods)) {
    if (id !== "core" && !mods.some((m) => m.id === id)) warnings.push(`mod "${id}" is missing, its data is kept untouched`);
  }
  return { state, warnings };
}
