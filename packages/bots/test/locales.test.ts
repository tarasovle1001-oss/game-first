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
