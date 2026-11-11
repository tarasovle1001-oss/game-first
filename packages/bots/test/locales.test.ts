import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import { missingKeys } from "@tc/core";
import { baseLocales } from "@tc/base";
import { exampleLocales } from "@tc/mod-example";

it("ru and en have the same keys", () => {
  for (const pack of [baseLocales, exampleLocales]) {
    expect(missingKeys(pack.en!, pack.ru!)).toEqual([]);
    expect(missingKeys(pack.ru!, pack.en!)).toEqual([]);
  }
});

it("every text key written in the code exists", () => {
  const root = join(__dirname, "../..");
  const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap((f) => {
      const p = join(dir, f);
      return statSync(p).isDirectory() ? (f === "generated" || f === "node_modules" ? [] : walk(p)) : /\.tsx?$/.test(f) ? [p] : [];
    });
  const known = { ...baseLocales.en, ...exampleLocales.en };
  // whole string literals that look like keys; keys built from parts are covered by the content build
  const pattern = /"((?:log|sms|action|factor|ui|scene|act|stat|trait|zone|mode|verdict|role|patron|husband)\.[a-z0-9_.]+)"/g;
  const missing: string[] = [];
  for (const file of [...walk(join(root, "base/src")), ...walk(join(root, "ui/src")), ...walk(join(root, "core/src"))]) {
    const src = readFileSync(file, "utf8");
    for (const m of src.matchAll(pattern)) {
      const key = m[1]!;
      if (key.endsWith(".")) continue; // a prefix for a built key
      if (!(key in known)) missing.push(`${key} (${file.replace(root, "")})`);
    }
  }
  expect(missing).toEqual([]);
});
