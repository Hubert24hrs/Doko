import { describe, expect, it } from "vitest";

import {
  GROUP_DESCRIPTION_MAX,
  GROUP_NAME_MAX,
  createGroupSchema,
  groupMembershipSchema,
  slugifyGroupName,
} from "@/features/groups/schemas";

const base = {
  name: "Ogrute Youth Association",
  description: "",
  kind: "youth" as const,
  geoId: "",
  visibility: "public" as const,
};

describe("slugifyGroupName", () => {
  it("lowercases and joins words with hyphens", () => {
    expect(slugifyGroupName("Ogrute Youth Association")).toBe(
      "ogrute-youth-association",
    );
  });

  it("strips diacritics rather than dropping the letters that carry them", () => {
    // "Ndị Ọzọ" must not become "nd-z" -- an Igbo name is the normal case
    // here, not the exotic one.
    expect(slugifyGroupName("Ndị Ọzọ")).toBe("ndi-ozo");
  });

  it("collapses runs of punctuation into a single separator", () => {
    expect(slugifyGroupName("Traders --- & Artisans!!!")).toBe(
      "traders-artisans",
    );
  });

  it("leaves no leading or trailing hyphen", () => {
    const slug = slugifyGroupName("  ...Umuozzi Farmers...  ");
    expect(slug).toBe("umuozzi-farmers");
    expect(slug.startsWith("-")).toBe(false);
    expect(slug.endsWith("-")).toBe(false);
  });

  it("caps the slug so a 120-character name cannot produce a 120-character URL", () => {
    const slug = slugifyGroupName("a".repeat(GROUP_NAME_MAX));
    expect(slug.length).toBeLessThanOrEqual(60);
  });

  it("returns an empty string when nothing survives, so the caller supplies a fallback", () => {
    // createGroupAction relies on this: `slugifyGroupName(name) || "group"`.
    // If this ever returned something non-empty the fallback would be dead
    // code, and a name of pure punctuation would produce a nonsense slug.
    expect(slugifyGroupName("###")).toBe("");
    expect(slugifyGroupName("   ")).toBe("");
  });
});

describe("createGroupSchema", () => {
  it("accepts a group with no description and no community chosen", () => {
    const result = createGroupSchema.safeParse(base);
    expect(result.success).toBe(true);
  });

  it("turns an unchosen community into null, not an empty string", () => {
    // geo_id is a uuid column: "" would be rejected by Postgres, and a group
    // that spans the whole LGA is a normal group, not a mistake.
    const result = createGroupSchema.parse(base);
    expect(result.geoId).toBeNull();
  });

  it("turns an empty description into null", () => {
    expect(createGroupSchema.parse(base).description).toBeNull();
  });

  it("keeps a real community id", () => {
    const geoId = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";
    expect(createGroupSchema.parse({ ...base, geoId }).geoId).toBe(geoId);
  });

  it("rejects a community id that is not a uuid", () => {
    expect(
      createGroupSchema.safeParse({ ...base, geoId: "ogrute" }).success,
    ).toBe(false);
  });

  it("rejects a name too short to mean anything", () => {
    for (const name of ["", " ", "a"]) {
      expect(createGroupSchema.safeParse({ ...base, name }).success).toBe(false);
    }
  });

  it("trims the name rather than storing the padding", () => {
    expect(createGroupSchema.parse({ ...base, name: "  Umuida  " }).name).toBe(
      "Umuida",
    );
  });

  it("accepts a name of exactly the maximum length and rejects one longer", () => {
    // The bounds mirror the CHECK constraints on public.groups, so a value the
    // form accepts can never be refused by the database.
    expect(
      createGroupSchema.safeParse({ ...base, name: "a".repeat(GROUP_NAME_MAX) })
        .success,
    ).toBe(true);
    expect(
      createGroupSchema.safeParse({
        ...base,
        name: "a".repeat(GROUP_NAME_MAX + 1),
      }).success,
    ).toBe(false);
  });

  it("accepts a description of exactly the maximum length and rejects one longer", () => {
    expect(
      createGroupSchema.safeParse({
        ...base,
        description: "a".repeat(GROUP_DESCRIPTION_MAX),
      }).success,
    ).toBe(true);
    expect(
      createGroupSchema.safeParse({
        ...base,
        description: "a".repeat(GROUP_DESCRIPTION_MAX + 1),
      }).success,
    ).toBe(false);
  });

  it("rejects a kind or visibility outside the database enums", () => {
    expect(
      createGroupSchema.safeParse({ ...base, kind: "secret-society" }).success,
    ).toBe(false);
    expect(
      createGroupSchema.safeParse({ ...base, visibility: "followers" }).success,
    ).toBe(false);
  });

  it("has no third visibility, because a join-request tier does not exist yet", () => {
    // There is no "request to join". Adding one means a join_requests table,
    // not a third enum value -- so a form that offered one here would promise
    // a flow the policies cannot deliver.
    expect(
      createGroupSchema.safeParse({ ...base, visibility: "restricted" }).success,
    ).toBe(false);
  });
});

describe("groupMembershipSchema", () => {
  const membership = {
    groupId: "3f2504e0-4f89-41d3-9a0c-0305e82c3301",
    slug: "ogrute-youth-association",
    intent: "join" as const,
  };

  it("accepts both end states", () => {
    expect(groupMembershipSchema.safeParse(membership).success).toBe(true);
    expect(
      groupMembershipSchema.safeParse({ ...membership, intent: "leave" })
        .success,
    ).toBe(true);
  });

  it("rejects a toggle, because the client sends an end state", () => {
    // A toggle read from stale UI does the opposite of what the member meant:
    // a double click would join and immediately leave.
    expect(
      groupMembershipSchema.safeParse({ ...membership, intent: "toggle" })
        .success,
    ).toBe(false);
  });

  it("rejects a missing or malformed group id", () => {
    expect(
      groupMembershipSchema.safeParse({ ...membership, groupId: "" }).success,
    ).toBe(false);
    expect(
      groupMembershipSchema.safeParse({ ...membership, groupId: "abc" }).success,
    ).toBe(false);
  });

  it("requires the slug the redirect will revalidate", () => {
    expect(
      groupMembershipSchema.safeParse({ ...membership, slug: "" }).success,
    ).toBe(false);
  });
});
