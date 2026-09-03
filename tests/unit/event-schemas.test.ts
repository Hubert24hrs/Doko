import { describe, expect, it } from "vitest";

import {
  EVENT_DESCRIPTION_MAX,
  EVENT_TITLE_MAX,
  cancelEventSchema,
  createEventSchema,
  rsvpSchema,
} from "@/features/events/schemas";

const EVENT_ID = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";

const base = {
  title: "New Yam Festival, Umuida",
  description: "",
  venue: "",
  kind: "festival" as const,
  geoId: "",
  visibility: "public" as const,
  startsAtLocal: "2026-09-12T16:00",
  endsAtLocal: "",
  isAllDay: "" as const,
};

describe("createEventSchema", () => {
  it("accepts an event with only a name and a start", () => {
    expect(createEventSchema.safeParse(base).success).toBe(true);
  });

  it("turns unchosen optionals into null rather than empty strings", () => {
    // geo_id is a uuid column and venue/description are nullable text: an
    // empty string would either be refused by Postgres or stored as a blank
    // that renders as an empty line.
    const parsed = createEventSchema.parse(base);
    expect(parsed.geoId).toBeNull();
    expect(parsed.venue).toBeNull();
    expect(parsed.description).toBeNull();
  });

  it("leaves the end empty rather than guessing one", () => {
    // The database fills a missing end with the end of that day. Guessing here
    // would be a second copy of that rule, and the copy outside the source of
    // truth is the one that drifts.
    expect(createEventSchema.parse(base).endsAtLocal).toBe("");
  });

  it("rejects a name too short to mean anything", () => {
    for (const title of ["", " ", "ab"]) {
      expect(createEventSchema.safeParse({ ...base, title }).success).toBe(false);
    }
  });

  it("applies the same bounds as the CHECK constraints", () => {
    expect(
      createEventSchema.safeParse({ ...base, title: "a".repeat(EVENT_TITLE_MAX) })
        .success,
    ).toBe(true);
    expect(
      createEventSchema.safeParse({
        ...base,
        title: "a".repeat(EVENT_TITLE_MAX + 1),
      }).success,
    ).toBe(false);
    expect(
      createEventSchema.safeParse({
        ...base,
        description: "a".repeat(EVENT_DESCRIPTION_MAX + 1),
      }).success,
    ).toBe(false);
  });

  it("requires a start that is a date AND a time", () => {
    for (const startsAtLocal of ["", "2026-09-12", "tomorrow", "2026-09-12T16"]) {
      expect(
        createEventSchema.safeParse({ ...base, startsAtLocal }).success,
      ).toBe(false);
    }
  });

  it("refuses an end before the start", () => {
    expect(
      createEventSchema.safeParse({
        ...base,
        startsAtLocal: "2026-09-12T16:00",
        endsAtLocal: "2026-09-12T15:00",
      }).success,
    ).toBe(false);
  });

  it("accepts an end that runs past midnight", () => {
    // A funeral wake or a festival night genuinely ends the next morning, and
    // a naive "end must be later in the day" rule would refuse it.
    expect(
      createEventSchema.safeParse({
        ...base,
        startsAtLocal: "2026-09-12T21:00",
        endsAtLocal: "2026-09-13T03:00",
      }).success,
    ).toBe(true);
  });

  it("reads the all-day checkbox, which is absent when unticked", () => {
    // An unchecked checkbox sends nothing at all, so undefined must mean false
    // rather than failing to parse.
    expect(createEventSchema.parse({ ...base, isAllDay: "on" }).isAllDay).toBe(
      true,
    );
    expect(createEventSchema.parse({ ...base, isAllDay: "" }).isAllDay).toBe(
      false,
    );
    expect(
      createEventSchema.parse({ ...base, isAllDay: undefined }).isAllDay,
    ).toBe(false);
  });

  it("has no 'followers' visibility, because an event cannot have one", () => {
    // An event is an invitation to a place at a time. "Only my followers may
    // know" is not something anybody organising a village meeting means, and a
    // tier nobody can satisfy is a trap this schema has already been bitten by.
    expect(
      createEventSchema.safeParse({ ...base, visibility: "followers" }).success,
    ).toBe(false);
  });

  it("rejects a kind outside the database enum", () => {
    expect(
      createEventSchema.safeParse({ ...base, kind: "coronation" }).success,
    ).toBe(false);
  });
});

describe("rsvpSchema", () => {
  it("accepts each answer and the withdrawal", () => {
    for (const status of ["going", "interested", "not_going", "withdraw"]) {
      expect(rsvpSchema.safeParse({ eventId: EVENT_ID, status }).success).toBe(
        true,
      );
    }
  });

  it("rejects a toggle, because the client sends an end state", () => {
    expect(
      rsvpSchema.safeParse({ eventId: EVENT_ID, status: "toggle" }).success,
    ).toBe(false);
  });

  it("treats withdrawal as its own answer, not the absence of one", () => {
    // 'withdraw' deletes the row. It is deliberately a value the client sends
    // rather than something inferred from a missing field, so a dropped form
    // value can never be read as "they are not coming".
    expect(rsvpSchema.safeParse({ eventId: EVENT_ID, status: "" }).success).toBe(
      false,
    );
  });
});

describe("cancelEventSchema", () => {
  it("accepts a cancellation with no reason given", () => {
    const parsed = cancelEventSchema.parse({ eventId: EVENT_ID, reason: "" });
    expect(parsed.reason).toBeNull();
  });

  it("keeps a reason when one is given", () => {
    expect(
      cancelEventSchema.parse({
        eventId: EVENT_ID,
        reason: "Postponed until after the rains",
      }).reason,
    ).toBe("Postponed until after the rains");
  });
});
