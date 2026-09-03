import { describe, expect, it } from "vitest";

import { typingLabel, type PresentMember } from "@/features/messages/use-presence";

const member = (name: string, userId = name.toLowerCase()): PresentMember => ({
  userId,
  name,
});

describe("typingLabel", () => {
  it("says nothing when nobody is typing", () => {
    // Null, not an empty string: the caller renders a reserved-height row and
    // an empty string would be indistinguishable from a label that failed.
    expect(typingLabel([])).toBeNull();
  });

  it("names one person", () => {
    expect(typingLabel([member("Ada")])).toBe("Ada is typing…");
  });

  it("names two, because a group of two is still worth naming", () => {
    expect(typingLabel([member("Ada"), member("Obi")])).toBe(
      "Ada and Obi are typing…",
    );
  });

  it("counts three or more rather than listing them", () => {
    expect(
      typingLabel([member("Ada"), member("Obi"), member("Ngozi")]),
    ).toBe("3 people are typing…");
  });

  it("agrees with itself on plurals", () => {
    expect(typingLabel([member("Ada")])).toContain(" is typing");
    expect(typingLabel([member("Ada"), member("Obi")])).toContain(" are typing");
    expect(
      typingLabel([member("A"), member("B"), member("C"), member("D")]),
    ).toBe("4 people are typing…");
  });
});
