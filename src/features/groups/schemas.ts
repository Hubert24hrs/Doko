import { z } from "zod";

/** Mirrors the CHECK constraints on public.groups. */
export const GROUP_NAME_MAX = 120;
export const GROUP_DESCRIPTION_MAX = 2000;

export const groupKinds = [
  "community",
  "village",
  "interest",
  "youth",
  "professional",
  "organization",
  "other",
] as const;

export const groupVisibilities = ["public", "private"] as const;

/** Labels people would actually use, rather than the enum values. */
export const GROUP_KIND_LABEL: Record<(typeof groupKinds)[number], string> = {
  community: "Community",
  village: "Village",
  interest: "Interest",
  youth: "Youth",
  professional: "Professional",
  organization: "Organisation",
  other: "Other",
};

const optionalUuid = z
  .union([z.literal(""), z.uuid("Choose a valid community")])
  .transform((v) => (v === "" ? null : v));

/**
 * A slug is derived from the name rather than asked for.
 *
 * Asking a member to invent a URL fragment is asking them to solve a problem
 * they do not have. Uniqueness is enforced by a partial unique index, and the
 * action retries with a suffix rather than rejecting the name.
 */
export function slugifyGroupName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    // Strip diacritics so "Ndị Ọzọ" becomes "ndi-ozo" rather than losing them.
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

export const createGroupSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Give the group a name")
    .max(GROUP_NAME_MAX, `A name can be at most ${GROUP_NAME_MAX} characters`),

  description: z
    .union([
      z.literal(""),
      z.string().trim().max(GROUP_DESCRIPTION_MAX, "That description is too long"),
    ])
    .transform((v) => (v === "" ? null : v)),

  kind: z.enum(groupKinds),
  geoId: optionalUuid,
  visibility: z.enum(groupVisibilities),
});

export const groupMembershipSchema = z.object({
  groupId: z.uuid(),
  slug: z.string().min(1),
  intent: z.enum(["join", "leave"]),
});
