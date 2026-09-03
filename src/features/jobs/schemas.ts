import { z } from "zod";

/** Mirrors the CHECK constraints on public.jobs. */
export const JOB_TITLE_MAX = 160;
export const JOB_DESCRIPTION_MAX = 8000;
export const JOB_ORG_MAX = 160;
export const JOB_LOCATION_MAX = 200;
export const APPLICATION_MESSAGE_MAX = 4000;

export const jobKinds = [
  "full_time",
  "part_time",
  "contract",
  "apprenticeship",
  "casual",
  "volunteer",
  "internship",
] as const;

export const jobCategories = [
  "teaching",
  "healthcare",
  "trade",
  "agriculture",
  "transport",
  "retail",
  "security",
  "domestic",
  "admin",
  "technology",
  "construction",
  "other",
] as const;

export const payPeriods = ["hour", "day", "week", "month", "year", "once"] as const;

export const applicationStatuses = [
  "sent",
  "shortlisted",
  "rejected",
  "withdrawn",
] as const;

export const JOB_KIND_LABEL: Record<(typeof jobKinds)[number], string> = {
  full_time: "Full time",
  part_time: "Part time",
  contract: "Contract",
  apprenticeship: "Apprenticeship",
  casual: "Casual work",
  volunteer: "Volunteer",
  internship: "Internship",
};

/**
 * Categories chosen for the work people here actually do.
 *
 * "Trade" covers artisans -- carpenters, tailors, mechanics, welders -- which
 * is a large share of the local economy and would otherwise land in "Other"
 * alongside everything nobody thought about.
 */
export const JOB_CATEGORY_LABEL: Record<(typeof jobCategories)[number], string> = {
  teaching: "Teaching",
  healthcare: "Health",
  trade: "Trade or artisan",
  agriculture: "Farming",
  transport: "Transport",
  retail: "Shop or market",
  security: "Security",
  domestic: "Domestic",
  admin: "Office or admin",
  technology: "Technology",
  construction: "Building",
  other: "Other",
};

export const PAY_PERIOD_LABEL: Record<(typeof payPeriods)[number], string> = {
  hour: "per hour",
  day: "per day",
  week: "per week",
  month: "per month",
  year: "per year",
  once: "for the job",
};

export const APPLICATION_STATUS_LABEL: Record<
  (typeof applicationStatuses)[number],
  string
> = {
  sent: "Sent",
  shortlisted: "Shortlisted",
  rejected: "Not selected",
  withdrawn: "Withdrawn",
};

const optionalUuid = z
  .union([z.literal(""), z.uuid("Choose a valid community")])
  .transform((v) => (v === "" ? null : v));

const optionalText = (max: number, message: string) =>
  z
    .union([z.literal(""), z.string().trim().max(max, message)])
    .transform((v) => (v === "" ? null : v));

/** A whole-naira amount from a text field, or null. */
const optionalNaira = z
  .union([z.literal(""), z.string()])
  .transform((v) => (v === "" ? null : v))
  .refine(
    (v) => v === null || /^\d{1,12}$/.test(v.replace(/[\s,]/g, "")),
    "Write the amount in figures, like 50000",
  )
  .transform((v) => (v === null ? null : Number(v.replace(/[\s,]/g, ""))));

export const createJobSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(3, "Say what the job is")
      .max(JOB_TITLE_MAX, `A title can be at most ${JOB_TITLE_MAX} characters`),

    description: z
      .string()
      .trim()
      .min(20, "Describe the work in a sentence or two")
      .max(
        JOB_DESCRIPTION_MAX,
        `A description can be at most ${JOB_DESCRIPTION_MAX} characters`,
      ),

    organizationName: optionalText(JOB_ORG_MAX, "That name is too long"),
    locationText: optionalText(JOB_LOCATION_MAX, "That location is too long"),

    kind: z.enum(jobKinds),
    category: z.enum(jobCategories),
    geoId: optionalUuid,
    visibility: z.enum(["public", "community"] as const),

    isRemote: z
      .union([z.literal("on"), z.literal(""), z.undefined()])
      .transform((v) => v === "on"),
    payIsNegotiable: z
      .union([z.literal("on"), z.literal(""), z.undefined()])
      .transform((v) => v === "on"),

    payMin: optionalNaira,
    payMax: optionalNaira,
    payPeriod: z.union([z.literal(""), z.enum(payPeriods)]),

    contactName: optionalText(JOB_ORG_MAX, "That name is too long"),
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
  })
  .refine((v) => v.payMax === null || v.payMin === null || v.payMax >= v.payMin, {
    message: "The highest pay cannot be below the lowest",
    path: ["payMax"],
  })
  .refine((v) => (v.payMin === null && v.payMax === null) || v.payPeriod !== "", {
    // The database refuses this too. A figure with no period is not a wage:
    // "50,000" could be a day or a month, and the difference is somebody's
    // livelihood.
    message: "Say whether that is per day, per month, or something else",
    path: ["payPeriod"],
  })
  .refine(
    (v) =>
      v.contactPhone !== null ||
      v.contactEmail !== null ||
      v.externalUrl !== null,
    {
      // A job nobody can respond to is not a job advert.
      message: "Give at least one way to reach you",
      path: ["contactPhone"],
    },
  );

export const applySchema = z.object({
  jobId: z.uuid(),
  message: z
    .string()
    .trim()
    .min(1, "Say something about yourself")
    .max(
      APPLICATION_MESSAGE_MAX,
      `A message can be at most ${APPLICATION_MESSAGE_MAX.toLocaleString("en-NG")} characters`,
    ),
});

export const applicationDecisionSchema = z.object({
  applicationId: z.uuid(),
  jobId: z.uuid(),
  status: z.enum(["shortlisted", "rejected", "sent"] as const),
});

export const withdrawApplicationSchema = z.object({
  applicationId: z.uuid(),
  jobId: z.uuid(),
});

export const jobStateSchema = z.object({
  jobId: z.uuid(),
  intent: z.enum(["fill", "reopen", "remove"] as const),
});

/** "₦50,000 – ₦80,000 per month", "₦20,000 per day", "Negotiable". */
export function payLabel(
  payMin: number | null,
  payMax: number | null,
  payPeriod: string | null,
  negotiable: boolean,
): string | null {
  const naira = (n: number) => `₦${n.toLocaleString("en-NG")}`;
  const period =
    payPeriod && payPeriod in PAY_PERIOD_LABEL
      ? ` ${PAY_PERIOD_LABEL[payPeriod as (typeof payPeriods)[number]]}`
      : "";

  if (payMin !== null && payMax !== null && payMax !== payMin) {
    return `${naira(payMin)} – ${naira(payMax)}${period}${negotiable ? ", negotiable" : ""}`;
  }
  const single = payMin ?? payMax;
  if (single !== null) {
    return `${naira(single)}${period}${negotiable ? ", negotiable" : ""}`;
  }
  return negotiable ? "Negotiable" : null;
}
