"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldInput,
  FieldLabel,
  FieldSelect,
  FieldTextarea,
} from "@/components/ui/field";
import type { VillageOption } from "@/features/geo/queries";

import { createListingAction, type ListingState } from "../actions";
import {
  LISTING_CATEGORY_LABEL,
  LISTING_CONDITION_LABEL,
  LISTING_DESCRIPTION_MAX,
  LISTING_TITLE_MAX,
  categoryHasCondition,
  listingCategories,
  listingConditions,
} from "../schemas";
import {
  ImageUploader,
  UploadProgress,
  uploadPending,
  type PendingImage,
} from "./image-uploader";

const INITIAL: ListingState = { ok: false };

/**
 * Posting a listing.
 *
 * A two-step submission run by hand, like the post composer: the row is
 * created first, and photos are uploaded second because the storage policy
 * authorises against the listing's SELLER, so there is nothing to authorise
 * against until the listing has an id. createListingAction therefore returns
 * that id rather than redirecting -- unlike createEventAction and
 * createJobAction, which have no upload step waiting on them and can send
 * the member straight to the new page.
 *
 * The listing is saved before its photos for the same reason a post is saved
 * before its images: if an upload fails, the seller keeps their listing
 * rather than losing the whole thing because one photo did not transfer.
 */
export function CreateListingForm({ villages }: { villages: VillageOption[] }) {
  const router = useRouter();
  const [state, setState] = useState<ListingState>(INITIAL);
  const [images, setImages] = useState<PendingImage[]>([]);
  const [category, setCategory] = useState<string>("other");
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(0);

  const errors = state.fieldErrors ?? {};
  const showCondition = categoryHasCondition(category);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;

    const form = event.currentTarget;
    const formData = new FormData(form);

    setBusy(true);
    setState(INITIAL);

    try {
      const result = await createListingAction(INITIAL, formData);

      if (!result.ok || !result.listingId) {
        setState(result);
        setBusy(false);
        return;
      }

      if (images.length > 0) {
        setUploading(images.length);
        const { failed } = await uploadPending(result.listingId, images);
        setUploading(0);

        if (failed.length > 0) {
          // The listing itself is saved; only navigation waits on the photos,
          // so a failed upload here is worth reporting precisely rather than
          // silently dropping to a listing with fewer photos than intended.
          console.error("[create-listing-form] photos failed", failed);
        }
      }

      router.push(`/marketplace/${result.listingId}`);
    } catch (cause) {
      console.error("[create-listing-form] unexpected failure", cause);
      setState({ ok: false, formError: "That listing could not be posted." });
      setBusy(false);
    } finally {
      setUploading(0);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5" noValidate>
      {state.formError ? (
        <div
          role="alert"
          className="rounded-lg border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger"
        >
          {state.formError}
        </div>
      ) : null}

      <Field error={errors.title}>
        <FieldLabel required>What are you selling</FieldLabel>
        <FieldInput
          name="title"
          required
          maxLength={LISTING_TITLE_MAX}
          placeholder="Standing fan, barely used"
        />
      </Field>

      <Field>
        <FieldLabel>Photos</FieldLabel>
        <ImageUploader images={images} onChange={setImages} disabled={busy} />
      </Field>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field error={errors.category}>
          <FieldLabel required>Category</FieldLabel>
          <FieldSelect
            name="category"
            defaultValue="other"
            onChange={(e) => setCategory(e.target.value)}
          >
            {listingCategories.map((c) => (
              <option key={c} value={c}>
                {LISTING_CATEGORY_LABEL[c]}
              </option>
            ))}
          </FieldSelect>
        </Field>

        {showCondition ? (
          <Field error={errors.condition}>
            <FieldLabel>Condition</FieldLabel>
            <FieldSelect name="condition" defaultValue="">
              <option value="">Not stated</option>
              {listingConditions.map((c) => (
                <option key={c} value={c}>
                  {LISTING_CONDITION_LABEL[c]}
                </option>
              ))}
            </FieldSelect>
          </Field>
        ) : null}
      </div>

      <Field error={errors.description}>
        <FieldLabel required>Describe it</FieldLabel>
        <FieldTextarea
          name="description"
          rows={5}
          required
          maxLength={LISTING_DESCRIPTION_MAX}
          placeholder="Why you are selling, how old it is, anything a buyer would want to know."
        />
      </Field>

      <fieldset className="space-y-4 rounded-lg border border-border p-4">
        <legend className="px-1 text-sm font-semibold text-foreground">
          Price
        </legend>

        <Field error={errors.price}>
          <FieldLabel>Amount (₦)</FieldLabel>
          <FieldInput name="price" inputMode="numeric" placeholder="45000" />
          <FieldDescription>
            Leave it empty to say &ldquo;price on request&rdquo; instead.
          </FieldDescription>
        </Field>

        <label className="flex items-center gap-2 text-sm text-foreground">
          <input
            type="checkbox"
            name="priceIsNegotiable"
            className="size-4 rounded border-border-strong"
          />
          Negotiable
        </label>

        <label className="flex items-center gap-2 text-sm text-foreground">
          <input
            type="checkbox"
            name="canDeliver"
            className="size-4 rounded border-border-strong"
          />
          I can deliver this
        </label>
      </fieldset>

      <Field error={errors.locationText}>
        <FieldLabel>Where to collect it</FieldLabel>
        <FieldInput name="locationText" placeholder="Ogrute, near the market" />
      </Field>

      <Field error={errors.geoId}>
        <FieldLabel>Community</FieldLabel>
        <FieldSelect name="geoId" defaultValue="">
          <option value="">Anywhere in Igbo-Eze North</option>
          {villages.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name}
            </option>
          ))}
        </FieldSelect>
      </Field>

      <fieldset className="space-y-4 rounded-lg border border-border p-4">
        <legend className="px-1 text-sm font-semibold text-foreground">
          How buyers can reach you
        </legend>

        <FieldDescription>
          {/* Optional here, unlike a job posting: "Message the seller" works
              with nothing filled in below. */}
          Optional. Buyers can always message you through Ezike Oba; add these
          only if you would rather they called or wrote directly. Shown to
          signed-in members only, never on the public page.
        </FieldDescription>

        <Field error={errors.contactName}>
          <FieldLabel>Name to ask for</FieldLabel>
          <FieldInput name="contactName" placeholder="Mrs Okoro" />
        </Field>

        <Field error={errors.contactPhone}>
          <FieldLabel>Phone</FieldLabel>
          <FieldInput name="contactPhone" placeholder="0803 000 0000" />
        </Field>

        <Field error={errors.contactEmail}>
          <FieldLabel>Email</FieldLabel>
          <FieldInput name="contactEmail" type="email" />
        </Field>

        <Field error={errors.externalUrl}>
          <FieldLabel>A web page about it</FieldLabel>
          <FieldInput name="externalUrl" placeholder="https://…" />
        </Field>

        <Field error={errors.instructions}>
          <FieldLabel>Anything else about buying it</FieldLabel>
          <FieldTextarea
            name="instructions"
            rows={3}
            placeholder="Cash on collection. Available after 4pm on weekdays."
          />
        </Field>
      </fieldset>

      <Field error={errors.visibility}>
        <FieldLabel required>Who can see it</FieldLabel>
        <FieldSelect name="visibility" defaultValue="public">
          <option value="public">Everyone</option>
          <option value="community">Only my community</option>
        </FieldSelect>
        <FieldDescription>
          &ldquo;Only my community&rdquo; needs a community chosen above.
          Without one it still reaches everybody in Igbo-Eze North.
        </FieldDescription>
      </Field>

      <div className="flex items-center gap-3">
        <Button type="submit" size="lg" isLoading={busy} loadingLabel="Posting">
          Post this listing
        </Button>
        <UploadProgress count={uploading} />
      </div>
    </form>
  );
}
