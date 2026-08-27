import { z } from "zod";

/**
 * Auth validation (zod v4).
 *
 * These schemas are the single source of truth: the client uses them for
 * inline feedback, and the Server Action re-parses the same schema before
 * touching Supabase. Client-side validation is a convenience, never a control.
 */

export const RESERVED_USERNAMES = [
  "admin",
  "administrator",
  "root",
  "support",
  "help",
  "moderator",
  "ezikeoba",
  "ezike",
  "oba",
  "obaai",
  "api",
  "auth",
  "login",
  "register",
  "settings",
  "explore",
  "about",
] as const;

const reserved = new Set<string>(RESERVED_USERNAMES);

export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, "Username must be at least 3 characters")
  .max(30, "Username must be 30 characters or fewer")
  .regex(
    /^[a-z0-9_]+$/,
    "Username can only contain lowercase letters, numbers and underscores",
  )
  .refine((value) => !reserved.has(value), "That username is reserved");

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email("Enter a valid email address"));

/**
 * Nigerian mobile numbers, accepted as 0803…, +234803… or 234803….
 * Normalised to E.164 on the way through.
 */
export const phoneSchema = z
  .string()
  .trim()
  .regex(
    /^(?:\+?234|0)[789]\d{9}$/,
    "Enter a valid Nigerian phone number, e.g. 08031234567",
  )
  .transform((value) => {
    const digits = value.replace(/\D/g, "");
    const national = digits.startsWith("234") ? digits.slice(3) : digits;
    return `+234${national.replace(/^0/, "")}`;
  });

export const passwordSchema = z
  .string()
  .min(10, "Password must be at least 10 characters")
  .max(72, "Password must be 72 characters or fewer") // bcrypt input limit
  .regex(/[a-z]/, "Password must contain a lowercase letter")
  .regex(/[A-Z]/, "Password must contain an uppercase letter")
  .regex(/\d/, "Password must contain a number");

/** Empty string from an untouched optional input means "not provided". */
const optionalText = <T extends z.ZodType>(schema: T) =>
  z.union([z.literal(""), schema]).transform((v) => (v === "" ? undefined : v));

const mustBeTrue = (message: string) =>
  z.boolean().refine((value) => value === true, message);

export const registerSchema = z
  .object({
    fullName: z
      .string()
      .trim()
      .min(2, "Enter your full name")
      .max(120, "Name is too long"),
    username: usernameSchema,
    email: emailSchema,
    phone: optionalText(phoneSchema),
    password: passwordSchema,
    confirmPassword: z.string(),
    // Community affiliation is optional by product rule: a member may not know
    // their village, or may not wish to say.
    villageId: optionalText(z.uuid("Select a valid village")),
    acceptTerms: mustBeTrue("You must accept the community guidelines"),
    isRealPerson: mustBeTrue(
      "Ezike Oba accounts must represent real people",
    ),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export type RegisterInput = z.input<typeof registerSchema>;
export type RegisterParsed = z.output<typeof registerSchema>;

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Enter your password"),
});

export type LoginInput = z.input<typeof loginSchema>;
