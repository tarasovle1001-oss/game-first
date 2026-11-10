// Shape of the YAML content. The build tool validates files against these schemas,
// the game imports only the inferred types.
import { z } from "zod";

const id = z.string().regex(/^[a-z][a-z0-9_.]*$/, "lowercase id: letters, digits, _ and .");
const range = z.tuple([z.number(), z.number()]).refine(([a, b]) => a <= b, "range must be [min, max]");

export const roomSchema = z
  .object({
    id,
    links: z.array(id),
    tags: z.array(z.string()).default([]),
    map: z.object({ x: z.number().int(), y: z.number().int(), w: z.number().int().min(1), h: z.number().int().min(1) }),
  })
  .strict();

export const zoneFileSchema = z.object({ zone: id, rooms: z.array(roomSchema).min(1) }).strict();

export const patronTypeSchema = z
  .object({
    id,
    weight: z.number().positive(), // how often this type walks in
    age: range.refine(([min]) => min >= 18, "all characters are adults: age must start at 18+"),
    builds: z.array(z.enum(["slim", "average", "athletic", "heavy"])).min(1),
    size: range, // cm
    stamina: range, // rounds in a row
    traits: z
      .object({ persistence: range, charm: range, honesty: range, jealousy: range, generosity: range })
      .strict(),
    // how he pursues: relative weights
    approach: z.object({ court: z.number().min(0), drink: z.number().min(0), pay: z.number().min(0), push: z.number().min(0) }).strict(),
    onRefusal: z.enum(["backs_off", "insists", "sulks", "leaves"]),
    spend: range, // money per order
  })
  .strict();

export const nameSchema = z.object({ en: z.string().min(1), ru: z.string().min(1) }).strict();

export const balanceSchema = z
  .object({
    start: z.object({ money: z.number(), debt: z.number().min(0), reputation: z.number().min(0).max(100), stock: z.number().int().min(0) }).strict(),
    rentPerDay: z.number().min(0),
    debtInterestPerDay: z.number().min(0), // fraction, 0.01 = 1%
    supplies: z.object({ packCost: z.number().positive(), packServings: z.number().int().positive() }).strict(),
    shift: z
      .object({
        ticks: z.number().int().positive(),
        seats: z.number().int().positive(),
        arrivalsBase: z.number().min(0), // expected new patrons per tick at reputation 50
        stayTicks: range,
        energyPerServe: z.number().min(0),
        regularAfterVisits: z.number().int().positive(),
        returnChance: z.number().min(0).max(1), // chance a known regular shows up on a given evening
      })
      .strict(),
  })
  .strict();

export type Room = z.infer<typeof roomSchema> & { zone: string };
export type PatronType = z.infer<typeof patronTypeSchema>;
export type Balance = z.infer<typeof balanceSchema>;
export type NameEntry = z.infer<typeof nameSchema>;

export interface Content {
  rooms: Room[];
  patronTypes: PatronType[];
  names: NameEntry[];
  balance: Balance;
  locales: Record<string, Record<string, string>>;
}
