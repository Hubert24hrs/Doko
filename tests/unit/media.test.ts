import { describe, expect, it } from "vitest";

import {
  ALLOWED_IMAGE_TYPES,
  MAX_ALT_TEXT,
  MAX_IMAGES_PER_POST,
  MAX_IMAGE_BYTES,
  attachMediaSchema,
  buildStoragePath,
  formatBytes,
  isAllowedImageType,
  updateAltTextSchema,
} from "@/features/posts/media";

const POST_ID = "0f8fad5b-d9cb-469f-a165-70867728950e";

describe("image type allow-list", () => {
  it("accepts the four formats the bucket accepts", () => {
    for (const t of ALLOWED_IMAGE_TYPES) expect(isAllowedImageType(t)).toBe(true);
  });

  it("rejects everything else, including the dangerous ones", () => {
    // SVG is excluded on purpose: it is a document that can carry script, not
    // merely a picture. GIF is excluded because an animation is a video by
    // another name and belongs in the video work, not here.
    for (const t of [
      "image/svg+xml",
      "image/gif",
      "text/html",
      "application/pdf",
      "image/jpeg;charset=utf-8",
      "",
    ]) {
      expect(isAllowedImageType(t), t).toBe(false);
    }
  });
});

describe("buildStoragePath", () => {
  it("puts the post id first, which is what the storage policy reads", () => {
    const path = buildStoragePath(POST_ID, "image/jpeg");
    expect(path.startsWith(`${POST_ID}/`)).toBe(true);
  });

  it("uses a fresh filename rather than anything the member supplied", () => {
    const a = buildStoragePath(POST_ID, "image/png");
    const b = buildStoragePath(POST_ID, "image/png");
    // Uploaded filenames carry paths, unicode tricks and personal detail; none
    // of that should reach a URL.
    expect(a).not.toBe(b);
  });

  it("maps each mime type to its own extension", () => {
    expect(buildStoragePath(POST_ID, "image/jpeg").endsWith(".jpg")).toBe(true);
    expect(buildStoragePath(POST_ID, "image/png").endsWith(".png")).toBe(true);
    expect(buildStoragePath(POST_ID, "image/webp").endsWith(".webp")).toBe(true);
    expect(buildStoragePath(POST_ID, "image/avif").endsWith(".avif")).toBe(true);
  });

  it("produces a path the server-side schema accepts", () => {
    // The two must agree, or every upload would be rejected on attach.
    const path = buildStoragePath(POST_ID, "image/webp");
    const result = attachMediaSchema.safeParse({
      postId: POST_ID,
      storagePath: path,
      mimeType: "image/webp",
      byteSize: 1024,
    });
    expect(result.success).toBe(true);
  });
});

describe("attachMediaSchema", () => {
  const valid = {
    postId: POST_ID,
    storagePath: `${POST_ID}/3f2504e0-4f89-41d3-9a0c-0305e82c3301.jpg`,
    mimeType: "image/jpeg",
    byteSize: 2048,
  };

  it("accepts a well-formed attachment", () => {
    expect(attachMediaSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects a path that does not carry a post id first", () => {
    // Such a path would be unreadable by anyone: the storage policy extracts
    // the first segment to find the owning post, and storage RLS denies by
    // default when nothing matches.
    for (const storagePath of [
      "just-a-file.jpg",
      "../../etc/passwd",
      "not-a-uuid/abc.jpg",
      `${POST_ID}/abc.jpg`,
      `${POST_ID}/3f2504e0-4f89-41d3-9a0c-0305e82c3301.svg`,
    ]) {
      expect(
        attachMediaSchema.safeParse({ ...valid, storagePath }).success,
        storagePath,
      ).toBe(false);
    }
  });

  it("rejects a file larger than the bucket would accept", () => {
    expect(
      attachMediaSchema.safeParse({ ...valid, byteSize: MAX_IMAGE_BYTES + 1 })
        .success,
    ).toBe(false);
  });

  it("rejects a zero or negative size", () => {
    expect(attachMediaSchema.safeParse({ ...valid, byteSize: 0 }).success).toBe(false);
    expect(attachMediaSchema.safeParse({ ...valid, byteSize: -1 }).success).toBe(false);
  });

  it("rejects a mime type outside the allow-list", () => {
    expect(
      attachMediaSchema.safeParse({ ...valid, mimeType: "image/svg+xml" }).success,
    ).toBe(false);
  });

  it("treats empty alt text as absent rather than as an empty string", () => {
    const result = attachMediaSchema.parse({ ...valid, altText: "" });
    expect(result.altText).toBeNull();
  });
});

describe("updateAltTextSchema", () => {
  it("accepts a description within the limit", () => {
    expect(
      updateAltTextSchema.safeParse({
        mediaId: POST_ID,
        postId: POST_ID,
        altText: "Elders gathered at the village square for the new yam festival",
      }).success,
    ).toBe(true);
  });

  it("rejects one over the limit", () => {
    expect(
      updateAltTextSchema.safeParse({
        mediaId: POST_ID,
        postId: POST_ID,
        altText: "a".repeat(MAX_ALT_TEXT + 1),
      }).success,
    ).toBe(false);
  });

  it("allows clearing a description", () => {
    const result = updateAltTextSchema.parse({
      mediaId: POST_ID,
      postId: POST_ID,
      altText: "",
    });
    expect(result.altText).toBeNull();
  });
});

describe("formatBytes", () => {
  it("reads naturally at each scale", () => {
    // Mobile data is metered here; the number has to mean something.
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(2048)).toBe("2 KB");
    expect(formatBytes(MAX_IMAGE_BYTES)).toBe("8.0 MB");
  });
});

describe("limits agree with the database", () => {
  it("caps images per post at the number the trigger enforces", () => {
    expect(MAX_IMAGES_PER_POST).toBe(4);
  });

  it("caps file size at the bucket's own limit", () => {
    expect(MAX_IMAGE_BYTES).toBe(8388608);
  });
});
