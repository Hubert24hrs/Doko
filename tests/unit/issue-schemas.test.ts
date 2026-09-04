import { describe, expect, it } from "vitest";

import {
  createIssueSchema,
  confirmIssueSchema,
  issueStatusSchema,
  removeIssueSchema,
  ISSUE_TITLE_MAX,
  ISSUE_DESCRIPTION_MAX,
  ISSUE_STATUS_NOTE_MAX,
  ISSUE_CATEGORY_LABEL,
  ISSUE_STATUS_LABEL,
} from "@/features/issues/schemas";

const VALID_GEO_ID = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";
const VALID_ISSUE_ID = "8b5da2d1-7c92-4f32-bf72-8854acb32115";

const baseIssue = {
  title: "Broken borehole at Umuida marketplace",
  description: "The main solar powered borehole stopped pumping water three days ago. Over 200 households depend on it.",
  category: "water" as const,
  geoId: VALID_GEO_ID,
  locationText: "Behind the central shed, near the transformer",
  latitude: "",
  longitude: "",
};

describe("createIssueSchema", () => {
  it("accepts a valid issue report without coordinates", () => {
    const result = createIssueSchema.safeParse(baseIssue);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.latitude).toBeNull();
      expect(result.data.longitude).toBeNull();
      expect(result.data.title).toBe(baseIssue.title);
    }
  });

  it("accepts paired coordinates within valid range", () => {
    const result = createIssueSchema.safeParse({
      ...baseIssue,
      latitude: "6.9833",
      longitude: "7.4500",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.latitude).toBe(6.9833);
      expect(result.data.longitude).toBe(7.45);
    }
  });

  it("rejects unpaired coordinates (latitude only)", () => {
    const result = createIssueSchema.safeParse({
      ...baseIssue,
      latitude: "6.9833",
      longitude: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejects unpaired coordinates (longitude only)", () => {
    const result = createIssueSchema.safeParse({
      ...baseIssue,
      latitude: "",
      longitude: "7.4500",
    });
    expect(result.success).toBe(false);
  });

  it("rejects out-of-range coordinates", () => {
    const badLat = createIssueSchema.safeParse({
      ...baseIssue,
      latitude: "95.0",
      longitude: "7.45",
    });
    expect(badLat.success).toBe(false);

    const badLng = createIssueSchema.safeParse({
      ...baseIssue,
      latitude: "6.98",
      longitude: "190.0",
    });
    expect(badLng.success).toBe(false);
  });

  it("requires a title of at least 5 characters", () => {
    expect(createIssueSchema.safeParse({ ...baseIssue, title: "Bad" }).success).toBe(false);
    expect(createIssueSchema.safeParse({ ...baseIssue, title: "   " }).success).toBe(false);
  });

  it("rejects titles longer than maximum allowed length", () => {
    const longTitle = "A".repeat(ISSUE_TITLE_MAX + 1);
    expect(createIssueSchema.safeParse({ ...baseIssue, title: longTitle }).success).toBe(false);
  });

  it("requires a descriptive explanation of at least 15 characters", () => {
    expect(createIssueSchema.safeParse({ ...baseIssue, description: "Short" }).success).toBe(false);
  });

  it("rejects descriptions exceeding the maximum limit", () => {
    const longDesc = "D".repeat(ISSUE_DESCRIPTION_MAX + 1);
    expect(createIssueSchema.safeParse({ ...baseIssue, description: longDesc }).success).toBe(false);
  });

  it("requires geoId to be a valid UUID", () => {
    expect(createIssueSchema.safeParse({ ...baseIssue, geoId: "not-a-uuid" }).success).toBe(false);
    expect(createIssueSchema.safeParse({ ...baseIssue, geoId: "" }).success).toBe(false);
  });

  it("rejects unknown categories", () => {
    expect(
      createIssueSchema.safeParse({ ...baseIssue, category: "alien_invasion" as never }).success,
    ).toBe(false);
  });
});

describe("confirmIssueSchema", () => {
  it("accepts a confirm intent with valid issue UUID", () => {
    const result = confirmIssueSchema.safeParse({
      issueId: VALID_ISSUE_ID,
      intent: "confirm",
    });
    expect(result.success).toBe(true);
  });

  it("accepts a withdraw intent", () => {
    const result = confirmIssueSchema.safeParse({
      issueId: VALID_ISSUE_ID,
      intent: "withdraw",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid intent", () => {
    const result = confirmIssueSchema.safeParse({
      issueId: VALID_ISSUE_ID,
      intent: "toggle",
    });
    expect(result.success).toBe(false);
  });
});

describe("issueStatusSchema", () => {
  it("accepts valid status change with a note", () => {
    const result = issueStatusSchema.safeParse({
      issueId: VALID_ISSUE_ID,
      status: "in_progress",
      note: "Contractor has been mobilized to site.",
    });
    expect(result.success).toBe(true);
  });

  it("accepts status change with empty note", () => {
    const result = issueStatusSchema.safeParse({
      issueId: VALID_ISSUE_ID,
      status: "resolved",
      note: "",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.note).toBeNull();
    }
  });

  it("rejects notes exceeding length limit", () => {
    const longNote = "N".repeat(ISSUE_STATUS_NOTE_MAX + 1);
    const result = issueStatusSchema.safeParse({
      issueId: VALID_ISSUE_ID,
      status: "declined",
      note: longNote,
    });
    expect(result.success).toBe(false);
  });
});

describe("removeIssueSchema", () => {
  it("accepts a valid UUID", () => {
    expect(removeIssueSchema.safeParse({ issueId: VALID_ISSUE_ID }).success).toBe(true);
  });

  it("rejects invalid UUID", () => {
    expect(removeIssueSchema.safeParse({ issueId: "123" }).success).toBe(false);
  });
});

describe("labels and mappings", () => {
  it("provides labels for all issue categories", () => {
    expect(ISSUE_CATEGORY_LABEL.water).toBe("Water or borehole");
    expect(ISSUE_CATEGORY_LABEL.road).toBe("Road or bridge");
    expect(ISSUE_CATEGORY_LABEL.electricity).toBe("Electricity");
  });

  it("provides labels for all issue statuses", () => {
    expect(ISSUE_STATUS_LABEL.reported).toBe("Reported");
    expect(ISSUE_STATUS_LABEL.in_progress).toBe("Being worked on");
    expect(ISSUE_STATUS_LABEL.resolved).toBe("Fixed");
  });
});
