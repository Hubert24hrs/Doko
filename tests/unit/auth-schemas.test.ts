import { describe, expect, it } from "vitest";

import {
  emailSchema,
  loginSchema,
  passwordSchema,
  phoneSchema,
  registerSchema,
  usernameSchema,
} from "@/features/auth/schemas";

/** Minimal valid registration payload, spread-and-overridden per case. */
function validRegistration(overrides: Record<string, unknown> = {}) {
  return {
    fullName: "Chidera Eze",
    username: "chidera_eze",
    email: "chidera@example.com",
    phone: "",
    password: "Ezike0ba2026",
    confirmPassword: "Ezike0ba2026",
    villageId: "",
    acceptTerms: true,
    isRealPerson: true,
    ...overrides,
  };
}

describe("usernameSchema", () => {
  it("accepts lowercase, digits and underscores", () => {
    expect(usernameSchema.parse("chidera_eze_1")).toBe("chidera_eze_1");
  });

  it("normalises case and surrounding whitespace", () => {
    expect(usernameSchema.parse("  ChideraEze  ")).toBe("chideraeze");
  });

  it("rejects punctuation and spaces", () => {
    expect(usernameSchema.safeParse("chidera.eze").success).toBe(false);
    expect(usernameSchema.safeParse("chidera eze").success).toBe(false);
    expect(usernameSchema.safeParse("chidera-eze").success).toBe(false);
  });

  it("enforces length bounds", () => {
    expect(usernameSchema.safeParse("ab").success).toBe(false);
    expect(usernameSchema.safeParse("a".repeat(31)).success).toBe(false);
    expect(usernameSchema.safeParse("a".repeat(30)).success).toBe(true);
  });

  it("rejects reserved names, case-insensitively", () => {
    expect(usernameSchema.safeParse("admin").success).toBe(false);
    expect(usernameSchema.safeParse("ADMIN").success).toBe(false);
    expect(usernameSchema.safeParse("obaai").success).toBe(false);
  });
});

describe("emailSchema", () => {
  it("trims and lowercases", () => {
    expect(emailSchema.parse("  Person@Example.COM ")).toBe(
      "person@example.com",
    );
  });

  it("rejects malformed addresses", () => {
    expect(emailSchema.safeParse("not-an-email").success).toBe(false);
    expect(emailSchema.safeParse("a@b").success).toBe(false);
  });
});

describe("phoneSchema", () => {
  it("normalises Nigerian numbers to E.164", () => {
    expect(phoneSchema.parse("08031234567")).toBe("+2348031234567");
    expect(phoneSchema.parse("+2348031234567")).toBe("+2348031234567");
    expect(phoneSchema.parse("2348031234567")).toBe("+2348031234567");
  });

  it("accepts 070, 080, 081, 090 style prefixes", () => {
    expect(phoneSchema.parse("07031234567")).toBe("+2347031234567");
    expect(phoneSchema.parse("09031234567")).toBe("+2349031234567");
  });

  it("rejects numbers of the wrong length or prefix", () => {
    expect(phoneSchema.safeParse("0803123456").success).toBe(false);
    expect(phoneSchema.safeParse("06031234567").success).toBe(false);
    expect(phoneSchema.safeParse("not a phone").success).toBe(false);
  });
});

describe("passwordSchema", () => {
  it("accepts a password meeting every rule", () => {
    expect(passwordSchema.safeParse("Ezike0ba2026").success).toBe(true);
  });

  it("requires length, upper, lower and a digit", () => {
    expect(passwordSchema.safeParse("Short1a").success).toBe(false);
    expect(passwordSchema.safeParse("alllowercase1").success).toBe(false);
    expect(passwordSchema.safeParse("ALLUPPERCASE1").success).toBe(false);
    expect(passwordSchema.safeParse("NoDigitsHere").success).toBe(false);
  });

  it("rejects input beyond the bcrypt limit", () => {
    expect(passwordSchema.safeParse(`Aa1${"x".repeat(70)}`).success).toBe(false);
  });
});

describe("registerSchema", () => {
  it("accepts a complete valid registration", () => {
    const result = registerSchema.safeParse(validRegistration());
    expect(result.success).toBe(true);
  });

  it("treats village as optional", () => {
    const result = registerSchema.safeParse(validRegistration());
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.villageId).toBeUndefined();
  });

  it("accepts a supplied village id", () => {
    const id = "2f1c2e3a-4b5c-4d6e-8f90-1a2b3c4d5e6f";
    const result = registerSchema.safeParse(
      validRegistration({ villageId: id }),
    );
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.villageId).toBe(id);
  });

  it("rejects a non-uuid village id", () => {
    const result = registerSchema.safeParse(
      validRegistration({ villageId: "enugu-ezike" }),
    );
    expect(result.success).toBe(false);
  });

  it("treats phone as optional but validates it when present", () => {
    expect(registerSchema.safeParse(validRegistration()).success).toBe(true);
    expect(
      registerSchema.safeParse(validRegistration({ phone: "08031234567" }))
        .success,
    ).toBe(true);
    expect(
      registerSchema.safeParse(validRegistration({ phone: "123" })).success,
    ).toBe(false);
  });

  it("rejects mismatched passwords and reports on confirmPassword", () => {
    const result = registerSchema.safeParse(
      validRegistration({ confirmPassword: "Different1234" }),
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path[0] === "confirmPassword")).toBe(
        true,
      );
    }
  });

  it("requires both the real-person and guidelines confirmations", () => {
    expect(
      registerSchema.safeParse(validRegistration({ isRealPerson: false }))
        .success,
    ).toBe(false);
    expect(
      registerSchema.safeParse(validRegistration({ acceptTerms: false }))
        .success,
    ).toBe(false);
  });
});

describe("loginSchema", () => {
  it("accepts valid credentials and normalises the email", () => {
    const result = loginSchema.safeParse({
      email: " Person@Example.com ",
      password: "anything",
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.email).toBe("person@example.com");
  });

  it("requires a non-empty password", () => {
    expect(
      loginSchema.safeParse({ email: "a@b.com", password: "" }).success,
    ).toBe(false);
  });
});
