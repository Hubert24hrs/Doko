import { z } from "zod";

/** Mirrors the CHECK constraints on public.marketplace_listings. */
export const LISTING_TITLE_MAX = 160;
export const LISTING_DESCRIPTION_MAX = 4000;
export const LISTING_LOCATION_MAX = 200;

export const listingCategories = [
  "electronics",
  "furniture",
  "clothing_fashion",
  "vehicles",
  "phones_computers",
  "appliances",
  "tools_equipment",
  "books_stationery",
  "baby_kids",
  "sports_hobbies",
  "agriculture",
  "building_materials",
  "food_produce",
  "services",
  "other",
] as const;

export const listingConditions = [
  "new",
  "like_new",
  "good",
  "fair",
  "for_parts",
] as const;

export const listingStatuses = ["available", "reserved", "sold"] as const;

export const LISTING_CATEGORY_LABEL: Record<
  (typeof listingCategories)[number],
  string
> = {
  electronics: "Electronics",
  furniture: "Furniture",
  clothing_fashion: "Clothing & fashion",
  vehicles: "Vehicles",
  phones_computers: "Phones & computers",
  appliances: "Appliances",
  tools_equipment: "Tools & equipment",
  books_stationery: "Books & stationery",
  baby_kids: "Baby & kids",
  sports_hobbies: "Sports & hobbies",
  agriculture: "Farming",
  building_materials: "Building materials",
  food_produce: "Food & produce",
  services: "Services",
  other: "Other",
};

export const LISTING_CONDITION_LABEL: Record<
  (typeof listingConditions)[number],
  string
> = {
  new: "New",
  like_new: "Like new",
  good: "Good",
  fair: "Fair",
  for_parts: "For parts, not working",
};

export const LISTING_STATUS_LABEL: Record<
  (typeof listingStatuses)[number],
  string
> = {
  available: "Available",
  reserved: "Reserved",
  sold: "Sold",
};

/** Categories with genuinely no condition to state -- a service or produce is not "new" or "used". */
const CATEGORIES_WITHOUT_CONDITION: readonly string[] = [
  "services",
  "food_produce",
];

export function categoryHasCondition(category: string): boolean {
  return !CATEGORIES_WITHOUT_CONDITION.includes(category);
}

const optionalUuid = z
  .union([z.literal(""), z.uuid("Choose a valid community")])
  .transform((v) => (v === "" ? null : v));

const optionalText = (max: number, message: string) =>
  z
    .union([z.literal(""), z.string().trim().max(max, message)])
    .transform((v) => (v === "" ? null : v));

/** A whole-naira amount from a text field, or null meaning "ask". */
const optionalNaira = z
  .union([z.literal(""), z.string()])
  .transform((v) => (v === "" ? null : v))
  .refine(
    (v) => v === null || /^\d{1,12}$/.test(v.replace(/[\s,]/g, "")),
    "Write the price in figures, like 45000",
  )
  .transform((v) => (v === null ? null : Number(v.replace(/[\s,]/g, ""))))
  .refine((v) => v === null || v > 0, "The price must be more than zero");

export const createListingSchema = z.object({
  title: z
    .string()
    .trim()
    .min(3, "Say what you are selling")
    .max(LISTING_TITLE_MAX, `A title can be at most ${LISTING_TITLE_MAX} characters`),

  description: z
    .string()
    .trim()
    .min(10, "Describe it in a sentence or two")
    .max(
      LISTING_DESCRIPTION_MAX,
      `A description can be at most ${LISTING_DESCRIPTION_MAX} characters`,
    ),

  category: z.enum(listingCategories),
  // Empty string means "not stated", which the server turns into NULL rather
  // than a database enum value -- a service is not secretly 'new'.
  condition: z.union([z.literal(""), z.enum(listingConditions)]),

  price: optionalNaira,
  priceIsNegotiable: z
    .union([z.literal("on"), z.literal(""), z.undefined()])
    .transform((v) => v === "on"),
  canDeliver: z
    .union([z.literal("on"), z.literal(""), z.undefined()])
    .transform((v) => v === "on"),

  locationText: optionalText(LISTING_LOCATION_MAX, "That location is too long"),
  geoId: optionalUuid,
  visibility: z.enum(["public", "community"] as const),

  contactName: optionalText(160, "That name is too long"),
  contactPhone: optionalText(40, "That phone number is too long"),
  contactEmail: z
    .union([z.literal(""), z.email("Write a valid email address")])
    .transform((v) => (v === "" ? null : v)),
  externalUrl: z
    .union([
      z.literal(""),
      z
        .url("Write a full web address")
        .refine(
          (u) => /^https?:\/\//i.test(u),
          "Only http and https addresses are allowed",
        ),
    ])
    .transform((v) => (v === "" ? null : v)),
  instructions: optionalText(2000, "Those instructions are too long"),
});

export const listingStatusSchema = z.object({
  listingId: z.uuid(),
  status: z.enum(listingStatuses),
});

export const removeListingSchema = z.object({
  listingId: z.uuid(),
});

/**
 * "₦45,000", "₦45,000, negotiable", "Price on request".
 *
 * price is never 0: the CHECK constraint and this schema both require it
 * strictly positive, so a free item is described in the title, not the price.
 */
export function priceLabel(
  price: number | null,
  negotiable: boolean,
): string {
  if (price === null) return negotiable ? "Ask" : "Price on request";
  const naira = `₦${price.toLocaleString("en-NG")}`;
  return negotiable ? `${naira}, negotiable` : naira;
}
