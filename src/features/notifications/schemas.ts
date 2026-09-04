import { z } from "zod";

export const markReadSchema = z.object({
  notificationId: z.uuid("Invalid notification id"),
});
