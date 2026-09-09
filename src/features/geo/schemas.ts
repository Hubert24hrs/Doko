import { z } from "zod";

/**
 * Mirrors the CHECK constraints on geo_entities. The database decides; this is
 * so a person gets a sentence back instead of a constraint violation.
 */

export const geoKinds = [
  "lga",
  "town",
  "autonomous_community",
  "district",
  "village",
  "area",
] as const;

const name = z
  .string()
  .trim()
  .min(1, "A community needs a name")
  .max(120, "That name is too long");

const description = z
  .string()
  .trim()
  .max(2000, "That description is too long")
  .optional()
  .transform((v) => (v && v.length > 0 ? v : null));

/**
 * Comma-separated in the form, because that is how somebody types "also called
 * Enugu Ezike, Enugwu-Ezike, Enugwu Ezike" without a tag widget in the way.
 */
const aliases = z
  .string()
  .trim()
  .max(500, "That list of alternative names is too long")
  .optional()
  .transform((v) =>
    (v ?? "")
      .split(",")
      .map((a) => a.trim())
      .filter((a) => a.length > 0),
  );

/**
 * Both coordinates or neither. The database enforces this too
 * (geo_entities_lat_range and the paired CHECK on issues); a single coordinate
 * puts a marker where longitude 0 meets a real latitude, which is the Gulf of
 * Guinea.
 */
const coordinate = (label: string, bound: number) =>
  z
    .string()
    .trim()
    .optional()
    .transform((v) => (v && v.length > 0 ? Number(v) : null))
    .refine((v) => v === null || Number.isFinite(v), `${label} must be a number`)
    .refine(
      (v) => v === null || (v >= -bound && v <= bound),
      `${label} must be between -${bound} and ${bound}`,
    );

const coordinatePair = {
  latitude: coordinate("Latitude", 90),
  longitude: coordinate("Longitude", 180),
};

const pairedCoordinates = <T extends { latitude: number | null; longitude: number | null }>(
  schema: z.ZodType<T>,
) =>
  schema.refine(
    (v) => (v.latitude === null) === (v.longitude === null),
    "Give both a latitude and a longitude, or neither",
  );

export const updateCommunitySchema = pairedCoordinates(
  z.object({
    id: z.uuid("Invalid community id"),
    name,
    description,
    aliases,
    sortOrder: z
      .string()
      .trim()
      .optional()
      .transform((v) => (v && v.length > 0 ? Number(v) : 0))
      .refine((v) => Number.isInteger(v), "Order must be a whole number"),
    ...coordinatePair,
  }),
);

export const createCommunitySchema = pairedCoordinates(
  z.object({
    parentId: z.uuid("Choose where this community sits"),
    kind: z.enum(geoKinds),
    name,
    description,
    aliases,
    ...coordinatePair,
  }),
);

export type UpdateCommunityInput = z.infer<typeof updateCommunitySchema>;
export type CreateCommunityInput = z.infer<typeof createCommunitySchema>;
