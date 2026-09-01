"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Field, FieldLabel, FieldTextarea } from "@/components/ui/field";
import { POST_MAX_LENGTH } from "@/features/posts/schemas";
import {
  ImageUploader,
  UploadProgress,
  uploadPending,
  type PendingImage,
} from "@/features/posts/components/image-uploader";

import { createGroupPostAction, type GroupPostState } from "../post-actions";

/**
 * Posting into a group.
 *
 * Same two-step submission as the main composer, and for the same reason:
 * images cannot be uploaded until the post exists, because the storage policy
 * authorises against the post at the path's first segment.
 *
 * No visibility selector. Inside a group, the group IS the audience — offering
 * "Everyone" or "My community" here would imply a post could escape the group,
 * which the policies do not permit and which would be a lie.
 */
export function GroupComposer({
  groupId,
  slug,
}: {
  groupId: string;
  slug: string;
}) {
  const router = useRouter();
  const [state, setState] = useState<GroupPostState>({ ok: false });
  const [images, setImages] = useState<PendingImage[]>([]);
  const [length, setLength] = useState(0);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(0);

  const remaining = POST_MAX_LENGTH - length;
  const overLimit = remaining < 0;

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;

    const form = event.currentTarget;
    const formData = new FormData(form);

    setBusy(true);
    setState({ ok: false });

    try {
      const result = await createGroupPostAction({ ok: false }, formData);

      if (!result.ok || !result.postId) {
        setState(result);
        setBusy(false);
        return;
      }

      if (images.length > 0) {
        setUploading(images.length);
        const { failed } = await uploadPending(result.postId, images);
        setUploading(0);
        if (failed.length > 0) {
          setState({
            ok: true,
            formError: `Your post was shared, but ${failed.length} image${
              failed.length === 1 ? "" : "s"
            } could not be uploaded: ${failed.join(", ")}.`,
          });
        }
      }

      form.reset();
      setImages([]);
      setLength(0);
      router.refresh();
    } catch (cause) {
      console.error("[group-composer] unexpected failure", cause);
      setState({ ok: false, formError: "Your post could not be shared." });
    } finally {
      setBusy(false);
      setUploading(0);
    }
  }

  return (
    <Card>
      <CardContent className="pt-5">
        <form onSubmit={handleSubmit} className="space-y-3" noValidate>
          <input type="hidden" name="groupId" value={groupId} />
          <input type="hidden" name="slug" value={slug} />

          {state.formError ? (
            <div
              role="alert"
              className={
                state.ok
                  ? "rounded-lg border border-warning/40 bg-eo-gold-100 px-4 py-3 text-sm text-[color:var(--eo-gold-700)]"
                  : "rounded-lg border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger"
              }
            >
              {state.formError}
            </div>
          ) : null}

          <Field error={state.fieldErrors?.body}>
            <FieldLabel className="sr-only">Write a post for this group</FieldLabel>
            <FieldTextarea
              name="body"
              rows={3}
              maxLength={POST_MAX_LENGTH + 100}
              placeholder="Share something with this group…"
              onChange={(e) => setLength(e.target.value.length)}
            />
          </Field>

          <ImageUploader images={images} onChange={setImages} disabled={busy} />

          <div className="flex items-center justify-end gap-3">
            <UploadProgress count={uploading} />
            {length > POST_MAX_LENGTH - 500 ? (
              <span
                aria-live="polite"
                className={
                  overLimit
                    ? "text-xs font-medium tabular-nums text-danger"
                    : "text-xs tabular-nums text-muted-foreground"
                }
              >
                {remaining.toLocaleString("en-NG")}
              </span>
            ) : null}
            <Button
              type="submit"
              isLoading={busy}
              loadingLabel={uploading > 0 ? "Uploading" : "Posting"}
              disabled={length === 0 || overLimit}
            >
              Post to group
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
