import { z } from "zod";

/**
 * Image constraints for listing photos. Mirrors features/posts/media.ts --
 * see that file for why these are duplicated across three layers rather than
 * trusted to one.
 */

export const MAX_IMAGE_BYTES = 8 * 1024 * 1024; // 8 MB
export const MAX_IMAGES_PER_LISTING = 6;
export const MAX_ALT_TEXT = 300;

export const ALLOWED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
] as const;

export type AllowedImageType = (typeof ALLOWED_IMAGE_TYPES)[number];

const EXTENSION_BY_TYPE: Record<AllowedImageType, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/avif": "avif",
};

export function isAllowedImageType(type: string): type is AllowedImageType {
  return (ALLOWED_IMAGE_TYPES as readonly string[]).includes(type);
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export interface ImageRejection {
  reason: string;
}

export function rejectImage(file: File): ImageRejection | null {
  if (!isAllowedImageType(file.type)) {
    return {
      reason: `${file.name}: only JPEG, PNG, WebP and AVIF images can be added.`,
    };
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return {
      reason: `${file.name} is ${formatBytes(file.size)}. The limit is ${formatBytes(MAX_IMAGE_BYTES)}.`,
    };
  }
  if (file.size === 0) {
    return { reason: `${file.name} is empty.` };
  }
  return null;
}

/**
 * '<listing_id>/<uuid>.<ext>'. The leading segment is what
 * storage_path_listing_id() reads to decide who may fetch the bytes.
 */
export function buildStoragePath(
  listingId: string,
  mimeType: AllowedImageType,
): string {
  const extension = EXTENSION_BY_TYPE[mimeType];
  return `${listingId}/${crypto.randomUUID()}.${extension}`;
}

export const attachMediaSchema = z.object({
  listingId: z.uuid(),
  storagePath: z
    .string()
    .min(1)
    .regex(
      /^[0-9a-f-]{36}\/[0-9a-f-]{36}\.(jpg|png|webp|avif)$/i,
      "That file path is not valid",
    ),
  mimeType: z.enum(ALLOWED_IMAGE_TYPES),
  byteSize: z.number().int().positive().max(MAX_IMAGE_BYTES),
  width: z.number().int().positive().nullable().optional(),
  height: z.number().int().positive().nullable().optional(),
  altText: z
    .union([z.literal(""), z.string().trim().max(MAX_ALT_TEXT)])
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .optional(),
});

export const detachMediaSchema = z.object({
  mediaId: z.uuid(),
  listingId: z.uuid(),
});
