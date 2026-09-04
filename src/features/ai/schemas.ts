import { z } from "zod";

export const aiQuerySchema = z.object({
  prompt: z
    .string()
    .trim()
    .min(2, "Please ask a question with at least 2 characters")
    .max(500, "Question is too long (max 500 characters)"),
  village_context: z.string().optional(),
  include_platform_search: z.boolean().default(true),
});

export const aiResponseSchema = z.object({
  reply: z.string(),
  sources: z.array(z.string()).optional(),
  suggestions: z.array(z.string()).optional(),
});

export type AiQueryInput = z.infer<typeof aiQuerySchema>;
export type AiResponse = z.infer<typeof aiResponseSchema>;