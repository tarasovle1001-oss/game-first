// Example of a mod loaded from a file: Menu -> "Add a mod (.js)".
// Everything the built-in systems use is available: TestCity.core and TestCity.base.
// This one adds a switch for loud music in the cafe: guests get bolder, and she hears less of what her husband says.
const { bs } = TestCity.base;
const ID = "loud_music";

TestCity.defineMod({
  mod: {
    id: ID,
    version: 1,
    requires: ["base"],
    initState: () => ({ on: false }),
    register(api) {
      // an action for the preparation phase
      api.actions.register({
        id: `${ID}/toggle`,
        labelKey: "loud_music.toggle",
        enumerate: (state) => (state.time.phase === "prep" ? [{ type: `${ID}/toggle` }] : []),
        apply(ctx) {
          const mine = ctx.state.mods[ID];
          mine.on = !mine.on;
          ctx.log(mine.on ? "loud_music.log.on" : "loud_music.log.off");
        },
      });
      // one more named row in the consent formula
      api.formulas.addFactor("base/consent", {
        id: "loud_music.cover",
        labelKey: "loud_music.factor",
        order: 45,
        eval: (state, input) => (state.mods[ID].on && input.loc === "cafe.hall" && input.partner !== "husband" ? 6 : null),
      });
      // react to something the base game does
      api.events.on("patron:arrived", (ctx, e) => {
        if (!ctx.state.mods[ID].on) return;
        const patron = bs(ctx.state).patrons[e.payload.id];
        if (patron) patron.memory.interest = Math.min(100, patron.memory.interest + 3);
      });
      // and a check the bots will run
      api.invariants.add("flag", (state) => (typeof state.mods[ID].on === "boolean" ? null : "music switch is broken"));
    },
  },
  locales: {
    en: {
      "loud_music.toggle": "Music: louder / quieter",
      "loud_music.log.on": "You turn the music up.",
      "loud_music.log.off": "You turn the music down.",
      "loud_music.factor": "Loud music covers it",
    },
    ru: {
      "loud_music.toggle": "Музыка: громче / тише",
      "loud_music.log.on": "Ты делаешь музыку громче.",
      "loud_music.log.off": "Ты делаешь музыку тише.",
      "loud_music.factor": "Громкая музыка всё заглушает",
    },
  },
});
