"use client";

import * as React from "react";
import { ImagePlus, Loader2, X } from "lucide-react";

import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils/cn";

import {
  MAX_ALT_TEXT,
  MAX_IMAGES_PER_POST,
  MAX_IMAGE_BYTES,
  buildStoragePath,
  formatBytes,
  isAllowedImageType,
  rejectImage,
} from "../media";
import { attachMediaAction } from "../media-actions";

export interface PendingImage {
  localId: string;
  file: File;
  previewUrl: string;
  width: number | null;
  height: number | null;
  altText: string;
}

/**
 * Reads an image's natural dimensions in the browser.
 *
 * Worth the round trip: storing width and height lets the feed reserve the
 * right space before the image arrives, so text does not jump on a slow
 * connection. Failure is not fatal — the columns are nullable.
 */
function readDimensions(
  file: File,
  objectUrl: string,
): Promise<{ width: number | null; height: number | null }> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () =>
      resolve({ width: img.naturalWidth || null, height: img.naturalHeight || null });
    img.onerror = () => resolve({ width: null, height: null });
    img.src = objectUrl;
  });
}

/**
 * Picks images and holds them until the post exists.
 *
 * Uploads cannot happen before the post does: the storage policy asks whether
 * the caller owns the post at the path's first segment, so there is nothing to
 * authorise against until a post id exists. Files are therefore staged in the
 * browser and uploaded by `uploadPending` once the post has been created.
 */
export function ImageUploader({
  images,
  onChange,
  disabled,
}: {
  images: PendingImage[];
  onChange: (next: PendingImage[]) => void;
  disabled?: boolean;
}) {
  const [errors, setErrors] = React.useState<string[]>([]);
  const inputId = React.useId();

  async function handleFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;

    const incoming = Array.from(fileList);
    const rejected: string[] = [];
    const accepted: PendingImage[] = [];

    for (const file of incoming) {
      if (images.length + accepted.length >= MAX_IMAGES_PER_POST) {
        rejected.push(
          `A post can carry at most ${MAX_IMAGES_PER_POST} images — ${file.name} was not added.`,
        );
        continue;
      }

      const rejection = rejectImage(file);
      if (rejection) {
        rejected.push(rejection.reason);
        continue;
      }

      const previewUrl = URL.createObjectURL(file);
      const { width, height } = await readDimensions(file, previewUrl);
      accepted.push({
        localId: crypto.randomUUID(),
        file,
        previewUrl,
        width,
        height,
        altText: "",
      });
    }

    setErrors(rejected);
    if (accepted.length > 0) onChange([...images, ...accepted]);
  }

  function remove(localId: string) {
    const target = images.find((i) => i.localId === localId);
    // Release the object URL, or the bytes stay held for the page's lifetime.
    if (target) URL.revokeObjectURL(target.previewUrl);
    onChange(images.filter((i) => i.localId !== localId));
  }

  function setAlt(localId: string, altText: string) {
    onChange(images.map((i) => (i.localId === localId ? { ...i, altText } : i)));
  }

  const atLimit = images.length >= MAX_IMAGES_PER_POST;

  return (
    <div className="space-y-3">
      {errors.length > 0 ? (
        <ul role="alert" className="space-y-1">
          {errors.map((e) => (
            <li key={e} className="text-xs text-danger">
              {e}
            </li>
          ))}
        </ul>
      ) : null}

      {images.length > 0 ? (
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {images.map((image) => (
            <li key={image.localId} className="space-y-1.5">
              <div className="relative overflow-hidden rounded-lg border border-border">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={image.previewUrl}
                  alt=""
                  className="aspect-square w-full object-cover"
                />
                <button
                  type="button"
                  onClick={() => remove(image.localId)}
                  aria-label={`Remove ${image.file.name}`}
                  className="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white transition-colors hover:bg-black/80"
                >
                  <X className="size-3.5" aria-hidden="true" />
                </button>
              </div>

              {/*
                Asked for every image, never required. Refusing the upload
                without it would cost the community the photograph rather than
                gain it a description.
              */}
              <input
                type="text"
                value={image.altText}
                onChange={(e) => setAlt(image.localId, e.target.value)}
                maxLength={MAX_ALT_TEXT}
                placeholder="Describe this image"
                aria-label={`Description for ${image.file.name}`}
                className="w-full rounded-md border border-border bg-surface px-2 py-1 text-xs text-foreground placeholder:text-muted-foreground"
              />
            </li>
          ))}
        </ul>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <input
          id={inputId}
          type="file"
          accept={["image/jpeg", "image/png", "image/webp", "image/avif"].join(",")}
          multiple
          disabled={disabled || atLimit}
          onChange={(e) => {
            void handleFiles(e.target.files);
            // Reset, so picking the same file twice in a row still fires.
            e.target.value = "";
          }}
          className="sr-only"
        />
        <label
          htmlFor={inputId}
          className={cn(
            "inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-lg border px-3 text-xs font-medium transition-colors",
            disabled || atLimit
              ? "cursor-not-allowed border-border text-muted-foreground opacity-60"
              : "border-border-strong text-foreground hover:bg-surface-sunken",
          )}
        >
          <ImagePlus className="size-4" aria-hidden="true" />
          {atLimit ? `Limit of ${MAX_IMAGES_PER_POST} reached` : "Add photos"}
        </label>

        <span className="text-xs text-muted-foreground">
          Up to {MAX_IMAGES_PER_POST}, {formatBytes(MAX_IMAGE_BYTES)} each
        </span>
      </div>
    </div>
  );
}

/**
 * Uploads staged images to storage and records them against the post.
 *
 * Runs after the post is created, because the storage policy authorises
 * against the post's author. Each file is attempted independently: one
 * failure loses one image, not the post and not the rest.
 */
export async function uploadPending(
  postId: string,
  images: PendingImage[],
): Promise<{ failed: string[] }> {
  const failed: string[] = [];
  const supabase = createClient();

  for (const image of images) {
    try {
      if (!isAllowedImageType(image.file.type)) {
        failed.push(image.file.name);
        continue;
      }

      const path = buildStoragePath(postId, image.file.type);

      const { error: uploadError } = await supabase.storage
        .from("post-media")
        .upload(path, image.file, {
          contentType: image.file.type,
          upsert: false,
        });

      if (uploadError) {
        console.error("[media.upload] failed", image.file.name, uploadError.message);
        failed.push(image.file.name);
        continue;
      }

      const result = await attachMediaAction({
        postId,
        storagePath: path,
        mimeType: image.file.type,
        byteSize: image.file.size,
        width: image.width,
        height: image.height,
        altText: image.altText.trim() || null,
      });

      if (!result.ok) {
        // attachMediaAction removes the uploaded object when the row fails,
        // so there is nothing to clean up here.
        failed.push(image.file.name);
      }
    } catch (cause) {
      console.error("[media.upload] unexpected", image.file.name, cause);
      failed.push(image.file.name);
    } finally {
      URL.revokeObjectURL(image.previewUrl);
    }
  }

  return { failed };
}

/** Spinner for the composer while uploads are in flight. */
export function UploadProgress({ count }: { count: number }) {
  if (count === 0) return null;
  return (
    <p
      role="status"
      className="flex items-center gap-2 text-xs text-muted-foreground"
    >
      <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
      Uploading {count} image{count === 1 ? "" : "s"}…
    </p>
  );
}

