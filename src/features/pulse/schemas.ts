import { z } from "zod";

export const pulseQuerySchema = z.object({
  limit: z.number().int().min(1).max(100).optional().default(60),
});

export type PulseQueryInput = z.infer<typeof pulseQuerySchema>;
