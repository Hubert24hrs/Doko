"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Globe2, Users } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Field, FieldLabel, FieldSelect, FieldTextarea } from "@/components/ui/field";
import type { VillageOption } from "@/features/geo/queries";

import { createPostAction, type PostActionState } from "../actions";
import { POST_MAX_LENGTH } from "../schemas";
import {
  ImageUploader,
  UploadProgress,
  uploadPending,
  type PendingImage,
} from "./image-uploader";

/**
 * The composer runs a two-step submission rather than a plain form action.
 *
 * Images cannot be uploaded before the post exists — the storage policy
 * authorises against the post at the path's first segment — so the order has
 * to be: create the post, then upload against its id. A single `action={}`
 * cannot express that, so submission is handled here and the server action is
 * called directly.
 *
 * The post is saved first and images second, deliberately. If an upload fails,
 * the member still has their words; the alternative loses the post because a
 * photograph would not transfer, which on a patchy connection would be common.
 */
export function PostComposer({
  villages,
  defaultGeoId,
}: {
  villages: VillageOption[];
  /** The member's own village, pre-selected so the common case is one click. */
  defaultGeoId?: string | null;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);

  const [state, setState] = useState<PostActionState>({ ok: false });
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
      const result = await createPostAction({ ok: false }, formData);

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
          // The post itself is saved. Say precisely which images did not make
          // it rather than implying the whole thing failed.
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
      console.error("[composer] unexpected failure", cause);
      setState({ ok: false, formError: "Your post could not be shared. Please try again." });
    } finally {
      setBusy(false);
      setUploading(0);
    }
  }

  return (
    <Card>
      <CardContent className="pt-5">
        <form ref={formRef} onSubmit={handleSubmit} className="space-y-3" noValidate>
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

          <div className="flex flex-wrap items-center gap-2">
            <Field className="w-auto">
              <FieldLabel className="sr-only">Community</FieldLabel>
              <FieldSelect
                name="geoId"
                defaultValue={defaultGeoId ?? ""}
                className="h-9 w-auto text-xs"
              >
                <option value="">All of Igbo-Eze North</option>
                {villages.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                    {v.districtName ? ` — ${v.districtName}` : ""}
                  </option>
                ))}
              </FieldSelect>
            </Field>

            <Field className="w-auto">
              <FieldLabel className="sr-only">Who can see this</FieldLabel>
              <FieldSelect
                name="visibility"
                defaultValue="public"
                className="h-9 w-auto text-xs"
              >
                <option value="public">Everyone</option>
                <option value="community">My community only</option>
              </FieldSelect>
            </Field>
          </div>

          <Field error={state.fieldErrors?.body}>
            <FieldLabel className="sr-only">Write a post</FieldLabel>
            <FieldTextarea
              name="body"
              rows={3}
              maxLength={POST_MAX_LENGTH + 100}
              placeholder="What is happening in your community?"
              onChange={(e) => setLength(e.target.value.length)}
            />
          </Field>

          <ImageUploader images={images} onChange={setImages} disabled={busy} />

          <div className="flex items-center justify-end gap-3">
            <UploadProgress count={uploading} />

            {/* Only shown once it is worth knowing, not from character one. */}
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
              Post
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

/** Small legend so the visibility choice is understandable at a glance. */
export function VisibilityHint() {
  return (
    <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
      <span className="inline-flex items-center gap-1.5">
        <Globe2 className="size-3.5" aria-hidden="true" />
        Everyone — visible to visitors who are not signed in
      </span>
      <span className="inline-flex items-center gap-1.5">
        <Users className="size-3.5" aria-hidden="true" />
        My community — only people from that community
      </span>
    </p>
  );
}
