// day 21.11, Alexey 12:54: a little body hair (not pubic) and a slightly toned body are allowed if they help - two more values per age test
import { readFileSync, writeFileSync } from "node:fs";
const f = "tools/prompt-lab/synth.yaml";
let s = readFileSync(f, "utf8");
if (s.includes("(toned male:1.1)")) { console.log("already patched"); process.exit(0); }
const add = (after, lines) => { const i = s.indexOf(after); if (i < 0) throw new Error("no anchor: " + after); const e = s.indexOf("\n", i) + 1; s = s.slice(0, e) + lines + s.slice(e); };
add('manly, masculine, thick neck, large hands, tall male, adult proportions, average build"',
`            - "(mature male:1.3), adult, 30s, (stubble:1.2), facial hair, very short hair, tired eyes, (toned male:1.1), lean, broad shoulders, tall male"
            - "(mature male:1.3), adult, 30s, (stubble:1.2), facial hair, very short hair, tired eyes, (toned male:1.1), broad shoulders, tall male, sparse chest hair, leg hair, arm hair"
`);
add('masculine, manly, large hands, big feet, adult male body, average build, soft body"',
`            - "(mature male:1.3), adult, (toned male:1.1), lean, thick thighs, tall male"
            - "(mature male:1.3), adult, (toned male:1.1), thick thighs, tall male, leg hair, sparse body hair"
`);
s = s.replace('title: "Тест возраста мужа: в полный рост с лицом, раком (худший случай)"\n        count: 96', 'title: "Тест возраста мужа: в полный рост с лицом, раком (худший случай)"\n        count: 144')
     .replace('title: "Тест возраста мужа: крупно без лица, лёжа"\n        count: 96', 'title: "Тест возраста мужа: крупно без лица, лёжа"\n        count: 144');
writeFileSync(f, s);
console.log("patched");
