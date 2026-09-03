import { describe, expect, it } from "vitest";

import {
  JOB_TITLE_MAX,
  applySchema,
  createJobSchema,
  payLabel,
} from "@/features/jobs/schemas";
import { isJobClosed, jobClosedReason } from "@/features/jobs/format";

const JOB_ID = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";

const base = {
  title: "Mathematics teacher",
  description: "Teaching SS1 to SS3 at a community secondary school in Umuida.",
  organizationName: "",
  locationText: "",
  kind: "full_time" as const,
  category: "teaching" as const,
  geoId: "",
  visibility: "public" as const,
  isRemote: "" as const,
  payIsNegotiable: "" as const,
  payMin: "",
  payMax: "",
  payPeriod: "" as const,
  contactName: "",
  contactPhone: "0803 000 0000",
  contactEmail: "",
  externalUrl: "",
  instructions: "",
};

describe("createJobSchema", () => {
  it("accepts a job with a phone number and no pay stated", () => {
    expect(createJobSchema.safeParse(base).success).toBe(true);
  });

  it("insists on at least one way to reach the employer", () => {
    // A job advert nobody can respond to is not an advert.
    expect(
      createJobSchema.safeParse({ ...base, contactPhone: "" }).success,
    ).toBe(false);
  });

  it("accepts an email or a web address instead of a phone", () => {
    expect(
      createJobSchema.safeParse({
        ...base,
        contactPhone: "",
        contactEmail: "hiring@example.com",
      }).success,
    ).toBe(true);
    expect(
      createJobSchema.safeParse({
        ...base,
        contactPhone: "",
        externalUrl: "https://example.com/apply",
      }).success,
    ).toBe(true);
  });

  it("refuses a pay figure with no period", () => {
    // THE constraint worth having here. "50,000" could be a day or a month,
    // and the difference is somebody's livelihood. The database refuses it
    // too, so a job that got past this could never be stored anyway.
    expect(
      createJobSchema.safeParse({ ...base, payMin: "50000" }).success,
    ).toBe(false);
    expect(
      createJobSchema.safeParse({ ...base, payMin: "50000", payPeriod: "month" })
        .success,
    ).toBe(true);
  });

  it("allows saying nothing at all about pay", () => {
    expect(createJobSchema.parse(base).payMin).toBeNull();
    expect(createJobSchema.parse(base).payPeriod).toBe("");
  });

  it("reads an amount written with commas or spaces", () => {
    // People type "50,000". Refusing that would be pedantry aimed at somebody
    // filling in a form on a phone.
    expect(
      createJobSchema.parse({ ...base, payMin: "50,000", payPeriod: "month" })
        .payMin,
    ).toBe(50000);
    expect(
      createJobSchema.parse({ ...base, payMin: "50 000", payPeriod: "month" })
        .payMin,
    ).toBe(50000);
  });

  it("refuses an amount that is not figures", () => {
    for (const payMin of ["fifty thousand", "50k", "₦50000", "-500"]) {
      expect(
        createJobSchema.safeParse({ ...base, payMin, payPeriod: "month" })
          .success,
      ).toBe(false);
    }
  });

  it("refuses a range that runs backwards", () => {
    expect(
      createJobSchema.safeParse({
        ...base,
        payMin: "80000",
        payMax: "50000",
        payPeriod: "month",
      }).success,
    ).toBe(false);
  });

  it("refuses a javascript: web address", () => {
    // The database refuses it with a CHECK as well, so it cannot be stored
    // even if this were bypassed. Two layers, on purpose.
    expect(
      createJobSchema.safeParse({
        ...base,
        externalUrl: "javascript:alert(1)",
      }).success,
    ).toBe(false);
  });

  it("insists a description says something", () => {
    expect(
      createJobSchema.safeParse({ ...base, description: "Come and work" })
        .success,
    ).toBe(false);
  });

  it("applies the same title bound as the CHECK constraint", () => {
    expect(
      createJobSchema.safeParse({ ...base, title: "a".repeat(JOB_TITLE_MAX) })
        .success,
    ).toBe(true);
    expect(
      createJobSchema.safeParse({
        ...base,
        title: "a".repeat(JOB_TITLE_MAX + 1),
      }).success,
    ).toBe(false);
  });
});

describe("applySchema", () => {
  it("accepts an application with something written in it", () => {
    expect(
      applySchema.safeParse({ jobId: JOB_ID, message: "I have taught for six years." })
        .success,
    ).toBe(true);
  });

  it("refuses an empty one", () => {
    for (const message of ["", "   "]) {
      expect(applySchema.safeParse({ jobId: JOB_ID, message }).success).toBe(
        false,
      );
    }
  });
});

describe("payLabel", () => {
  it("renders a range", () => {
    expect(payLabel(50000, 80000, "month", false)).toBe(
      "₦50,000 – ₦80,000 per month",
    );
  });

  it("renders a single figure", () => {
    expect(payLabel(20000, null, "day", false)).toBe("₦20,000 per day");
  });

  it("collapses a range whose ends are equal", () => {
    expect(payLabel(20000, 20000, "day", false)).toBe("₦20,000 per day");
  });

  it("says 'Negotiable' when that is all there is to say", () => {
    expect(payLabel(null, null, null, true)).toBe("Negotiable");
  });

  it("returns null rather than an empty label when nothing was given", () => {
    // Null, so the caller can omit the row entirely. A blank where a wage
    // should be reads as "unpaid", which is a different claim.
    expect(payLabel(null, null, null, false)).toBeNull();
  });
});

describe("isJobClosed", () => {
  const hours = (n: number) => new Date(Date.now() + n * 3600_000).toISOString();

  it("is closed once filled, whatever the closing date says", () => {
    expect(isJobClosed(hours(-1), hours(48))).toBe(true);
    expect(jobClosedReason(hours(-1), hours(48))).toBe("filled");
  });

  it("is closed once the closing date has passed", () => {
    expect(isJobClosed(null, hours(-1))).toBe(true);
    expect(jobClosedReason(null, hours(-1))).toBe("closed");
  });

  it("is open with no closing date at all", () => {
    // Null means no deadline, which is the honest default here: most of these
    // close when somebody is found rather than on a date.
    expect(isJobClosed(null, null)).toBe(false);
    expect(jobClosedReason(null, null)).toBeNull();
  });

  it("is open before the closing date", () => {
    expect(isJobClosed(null, hours(48))).toBe(false);
  });
});
