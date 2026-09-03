import { describe, expect, it } from "vitest";

import {
  LISTING_TITLE_MAX,
  categoryHasCondition,
  createListingSchema,
  priceLabel,
} from "@/features/marketplace/schemas";

const base = {
  title: "Standing fan, barely used",
  description: "Selling because I am moving. Works perfectly, two speeds.",
  category: "appliances" as const,
  condition: "good" as const,
  price: "",
  priceIsNegotiable: "" as const,
  canDeliver: "" as const,
  locationText: "",
  geoId: "",
  visibility: "public" as const,
  contactName: "",
  contactPhone: "",
  contactEmail: "",
  externalUrl: "",
  instructions: "",
};

describe("createListingSchema", () => {
  it("accepts a listing with no price and no contact details", () => {
    // Unlike a job posting, neither is required: an empty price means "ask",
    // and an empty contact block means the seller is relying on in-app
    // messaging, which needs nothing filled in here.
    expect(createListingSchema.safeParse(base).success).toBe(true);
  });

  it("turns unchosen optionals into null rather than empty strings", () => {
    const parsed = createListingSchema.parse(base);
    expect(parsed.price).toBeNull();
    expect(parsed.geoId).toBeNull();
    expect(parsed.locationText).toBeNull();
  });

  it("reads a price written with commas or spaces", () => {
    expect(createListingSchema.parse({ ...base, price: "45,000" }).price).toBe(
      45000,
    );
    expect(createListingSchema.parse({ ...base, price: "45 000" }).price).toBe(
      45000,
    );
  });

  it("refuses a price that is not figures", () => {
    for (const price of ["forty five thousand", "45k", "₦45000", "-500"]) {
      expect(createListingSchema.safeParse({ ...base, price }).success).toBe(
        false,
      );
    }
  });

  it("refuses a price of zero", () => {
    // The database's CHECK requires price > 0. A free item belongs in the
    // title and description, not a price field that claims to be a number.
    expect(createListingSchema.safeParse({ ...base, price: "0" }).success).toBe(
      false,
    );
  });

  it("insists on a real description, not a couple of words", () => {
    expect(
      createListingSchema.safeParse({ ...base, description: "For sale" })
        .success,
    ).toBe(false);
  });

  it("applies the same title bound as the CHECK constraint", () => {
    expect(
      createListingSchema.safeParse({
        ...base,
        title: "a".repeat(LISTING_TITLE_MAX),
      }).success,
    ).toBe(true);
    expect(
      createListingSchema.safeParse({
        ...base,
        title: "a".repeat(LISTING_TITLE_MAX + 1),
      }).success,
    ).toBe(false);
  });

  it("refuses a javascript: web address, as the database also does", () => {
    expect(
      createListingSchema.safeParse({
        ...base,
        externalUrl: "javascript:alert(1)",
      }).success,
    ).toBe(false);
  });

  it("accepts an empty condition, for a category that genuinely has none", () => {
    expect(
      createListingSchema.safeParse({ ...base, condition: "" }).success,
    ).toBe(true);
  });

  it("has no 'followers' visibility, reusing the same reasoning as events and jobs", () => {
    expect(
      createListingSchema.safeParse({ ...base, visibility: "followers" })
        .success,
    ).toBe(false);
  });
});

describe("categoryHasCondition", () => {
  it("is true for a physical item", () => {
    expect(categoryHasCondition("furniture")).toBe(true);
    expect(categoryHasCondition("electronics")).toBe(true);
  });

  it("is false for a service or fresh produce", () => {
    // A service is not secretly "new" or "used", and forcing a choice here
    // would mean every service listing lying about its condition.
    expect(categoryHasCondition("services")).toBe(false);
    expect(categoryHasCondition("food_produce")).toBe(false);
  });
});

describe("priceLabel", () => {
  it("renders a plain price", () => {
    expect(priceLabel(45000, false)).toBe("₦45,000");
  });

  it("marks a negotiable price", () => {
    expect(priceLabel(45000, true)).toBe("₦45,000, negotiable");
  });

  it("says 'Ask' when negotiable with no figure given", () => {
    expect(priceLabel(null, true)).toBe("Ask");
  });

  it("says 'Price on request' when nothing was given at all", () => {
    expect(priceLabel(null, false)).toBe("Price on request");
  });
});
