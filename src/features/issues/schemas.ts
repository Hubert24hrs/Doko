import { z } from "zod";

/** Mirrors the CHECK constraints on public.community_issues. */
export const ISSUE_TITLE_MAX = 160;
export const ISSUE_DESCRIPTION_MAX = 4000;
export const ISSUE_LOCATION_MAX = 200;
export const ISSUE_STATUS_NOTE_MAX = 1000;

export const issueCategories = [
  "road",
  "water",
  "electricity",
  "security",
  "waste",
  "health",
  "education",
  "environment",
  "other",
] as const;

export const issueStatuses = [
  "reported",
  "acknowledged",
  "in_progress",
  "resolved",
  "declined",
] as const;

export const ISSUE_CATEGORY_LABEL: Record<
  (typeof issueCategories)[number],
  string
> = {
  road: "Road or bridge",
  water: "Water or borehole",
  electricity: "Electricity",
  security: "Security",
  waste: "Waste or drainage",
  health: "Health facility",
  education: "School",
  environment: "Environment",
  other: "Something else",
};

/**
 * Written as what a reader learns, not as a workflow state.
 *
 * "Reported" rather than "Open", because the useful thing to know is that a
 * person said this, not that a ticket is in a queue.
 */
export const ISSUE_STATUS_LABEL: Record<(typeof issueStatuses)[number], string> = {
  reported: "Reported",
  acknowledged: "Seen by the community leaders",
  in_progress: "Being worked on",
  resolved: "Fixed",
  declined: "Not being taken up",
};

const optionalText = (max: number, message: string) =>
  z
    .union([z.literal(""), z.string().trim().max(max, message)])
    .transform((v) => (v === "" ? null : v));

/**
 * A coordinate from the browser's geolocation, or nothing.
 *
 * Both or neither: half a pin puts a marker where longitude 0 meets a real
 * latitude, which is the Gulf of Guinea rather than Igbo-Eze North. The
 * database enforces the same pairing with a CHECK.
 */
const optionalCoordinate = z
  .union([z.literal(""), z.string()])
  .transform((v) => (v === "" ? null : Number(v)))
  .refine((v) => v === null || Number.isFinite(v), "That location is not valid");

export const createIssueSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(5, "Say what the problem is")
      .max(ISSUE_TITLE_MAX, `A title can be at most ${ISSUE_TITLE_MAX} characters`),

    description: z
      .string()
      .trim()
      .min(15, "Describe it so somebody who has not seen it understands")
      .max(
        ISSUE_DESCRIPTION_MAX,
        `A description can be at most ${ISSUE_DESCRIPTION_MAX} characters`,
      ),

    category: z.enum(issueCategories),

    // Required, unlike every other geo picker in this app. An issue that is
    // nowhere cannot be fixed, and the column is NOT NULL to match.
    geoId: z.uuid("Choose the community this is in"),

    locationText: optionalText(ISSUE_LOCATION_MAX, "That location is too long"),

    latitude: optionalCoordinate,
    longitude: optionalCoordinate,
  })
  .refine(
    (v) =>
      (v.latitude === null && v.longitude === null) ||
      (v.latitude !== null && v.longitude !== null),
    { message: "A pin needs both coordinates", path: ["latitude"] },
  )
  .refine(
    (v) => v.latitude === null || (v.latitude >= -90 && v.latitude <= 90),
    { message: "That latitude is not valid", path: ["latitude"] },
  )
  .refine(
    (v) => v.longitude === null || (v.longitude >= -180 && v.longitude <= 180),
    { message: "That longitude is not valid", path: ["longitude"] },
  );

export const confirmIssueSchema = z.object({
  issueId: z.uuid(),
  /** The desired END STATE, never a toggle -- as for RSVPs and follows. */
  intent: z.enum(["confirm", "withdraw"] as const),
});

export const issueStatusSchema = z.object({
  issueId: z.uuid(),
  status: z.enum(issueStatuses),
  note: optionalText(ISSUE_STATUS_NOTE_MAX, "That note is too long"),
});

export const removeIssueSchema = z.object({
  issueId: z.uuid(),
});
