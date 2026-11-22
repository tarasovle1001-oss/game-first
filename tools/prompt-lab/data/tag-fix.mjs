// day 22.11: caption corrections the tagger cannot know. Idempotent.
//  fd_behind: the "her POV" frames get 2boys / multiple boys from the tagger (a hand next to a man) -> removed, "female pov, pov hands" added;
//             fist frames get "anal fisting, fisting" (the tagger calls them fingering or object insertion).
//  sixty_nine: Alexey, 00:12: the husband there is dark, hairy and sturdy -> every husband frame gets those tags, so that the game can leave them out / ban them.
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
const root = "tools/prompt-lab/data/synth/_dataset";
const edit = (c, test, fn) => {
  let n = 0;
  for (const f of readdirSync(`${root}/${c}`).filter((x) => x.endsWith(".txt") && !x.endsWith(".prompt.txt") && x !== "_README.txt" && test(x))) {
    const p = `${root}/${c}/${f}`;
    const [trigger, ...tags] = readFileSync(p, "utf8").trim().split(", ");
    const out = fn([...tags]);
    if (out.join(", ") !== tags.join(", ")) { writeFileSync(p, [trigger, ...out].join(", ") + "\n"); n++; }
  }
  console.log(c, String(test).slice(0, 60), "changed", n);
};
const add = (tags, ...xs) => { for (const x of xs) if (!tags.includes(x)) tags.push(x); return tags; };
const drop = (tags, ...xs) => tags.filter((t) => !xs.includes(t));
edit("fd_behind", (f) => /_(fpov_|x_fpov)/.test(f), (t) => add(drop(t, "2boys", "multiple boys", "yaoi", "male pov"), "female pov", "pov hands", "1boy"));
edit("fd_behind", (f) => /_(fpov_fist|fisting)/.test(f), (t) => add(drop(t, "anal fingering"), "anal fisting", "fisting"));
edit("sixty_nine", (f) => /_husband69/.test(f), (t) => add(t, "dark-skinned male", "leg hair", "body hair", "muscular male"));
