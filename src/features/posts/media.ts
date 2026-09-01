import { z } from "zod";

/**
 * Image constraints, in one place.
 *
 * Duplicated deliberately in three layers, because each catches a different
 * attacker or accident:
 *
 *   - here, so the member gets a useful message before uploading anything;
 *   - on the bucket (`file_size_limit`, `allowed_mime_types`), which a crafted
 *     request cannot talk its way past;
 *   - as CHECK constraints on post_media, so a row can never describe a file
 *     the bucket would have refused.
 */

export const MAX_IMAGE_BYTES = 8 * 1024 * 1024; // 8 MB
export const MAX_IMAGES_PER_POST = 4;
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

/**
 * Human-readable size, for error messages. Nigerian mobile data is metered,
 * so "8 MB" means something concrete to the person being told.
 */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export interface ImageRejection {
  reason: string;
}

/** Client-side pre-flight. The bucket and the CHECK constraints are the real gate. */
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
 * Object path for an upload: '<post_id>/<uuid>.<ext>'.
 *
 * The leading segment is not decoration — the storage policies read it with
 * `split_part(name, '/', 1)` to find the owning post and ask the ordinary
 * posts policies who may see it. A path built any other way is unreadable by
 * anyone, because storage RLS denies by default.
 *
 * The filename is a fresh UUID rather than the member's own: uploaded names
 * carry paths, unicode tricks and personal information, and none of that
 * should reach a URL.
 */
export function buildStoragePath(postId: string, mimeType: AllowedImageType): string {
  const extension = EXTENSION_BY_TYPE[mimeType];
  return `${postId}/${crypto.randomUUID()}.${extension}`;
}

/** Server-side validation of what the client claims it uploaded. */
export const attachMediaSchema = z.object({
  postId: z.uuid(),
  storagePath: z
    .string()
    .min(1)
    // Must match the layout the storage policies depend on.
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
  postId: z.uuid(),
});

export const updateAltTextSchema = z.object({
  mediaId: z.uuid(),
  postId: z.uuid(),
  altText: z
    .union([z.literal(""), z.string().trim().max(MAX_ALT_TEXT)])
    .transform((v) => (v === "" ? null : v)),
});
