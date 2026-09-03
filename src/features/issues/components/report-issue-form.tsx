"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LocateFixed } from "lucide-react";

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

import { createIssueAction, type IssueState } from "../actions";
import {
  ISSUE_CATEGORY_LABEL,
  ISSUE_DESCRIPTION_MAX,
  ISSUE_TITLE_MAX,
  issueCategories,
} from "../schemas";
import {
  ImageUploader,
  UploadProgress,
  uploadPending,
  type PendingImage,
} from "./image-uploader";

const INITIAL: IssueState = { ok: false };

export function ReportIssueForm({ villages }: { villages: VillageOption[] }) {
  const router = useRouter();
  const [state, setState] = useState<IssueState>(INITIAL);
  const [images, setImages] = useState<PendingImage[]>([]);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(0);

  const [coords, setCoords] = useState<{ lat: string; lng: string } | null>(null);
  const [locating, setLocating] = useState(false);
  const [locateError, setLocateError] = useState<string | null>(null);

  const errors = state.fieldErrors ?? {};

  /**
   * Reads the browser's position, if the person offers it.
   *
   * Entirely optional and entirely client-side: no geocoding service is
   * called, nothing is sent anywhere until the form is submitted, and a
   * refusal is not an error -- most reports are filed from home rather than
   * standing next to the problem, and refusing those would cost the community
   * the report.
   */
  function useMyLocation() {
    if (!("geolocation" in navigator)) {
      setLocateError("This device cannot share a location.");
      return;
    }
    setLocating(true);
    setLocateError(null);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setCoords({
          lat: position.coords.latitude.toFixed(6),
          lng: position.coords.longitude.toFixed(6),
        });
        setLocating(false);
      },
      () => {
        // Not an error state worth shouting about: the report is fine without
        // a pin, and it simply will not appear on the map.
        setLocateError(
          "No location was shared. The report still works; it just will not appear on the map.",
        );
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;

    const form = event.currentTarget;
    const formData = new FormData(form);
    setBusy(true);
    setState(INITIAL);

    try {
      const result = await createIssueAction(INITIAL, formData);

      if (!result.ok || !result.issueId) {
        setState(result);
        setBusy(false);
        return;
      }

      if (images.length > 0) {
        setUploading(images.length);
        const { failed } = await uploadPending(result.issueId, images);
        setUploading(0);
        if (failed.length > 0) {
          console.error("[report-issue-form] photos failed", failed);
        }
      }

      router.push(`/issues/${result.issueId}`);
    } catch (cause) {
      console.error("[report-issue-form] unexpected failure", cause);
      setState({ ok: false, formError: "That report could not be saved." });
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
        <FieldLabel required>What is the problem</FieldLabel>
        <FieldInput
          name="title"
          required
          maxLength={ISSUE_TITLE_MAX}
          placeholder="The borehole at Umuida market has stopped working"
        />
      </Field>

      <Field error={errors.category}>
        <FieldLabel required>What kind of problem</FieldLabel>
        <FieldSelect name="category" defaultValue="other">
          {issueCategories.map((c) => (
            <option key={c} value={c}>
              {ISSUE_CATEGORY_LABEL[c]}
            </option>
          ))}
        </FieldSelect>
      </Field>

      <Field error={errors.description}>
        <FieldLabel required>Describe it</FieldLabel>
        <FieldTextarea
          name="description"
          rows={5}
          required
          maxLength={ISSUE_DESCRIPTION_MAX}
          placeholder="How long it has been like this, who it affects, anything that has already been tried."
        />
      </Field>

      <Field>
        <FieldLabel>Photos</FieldLabel>
        <ImageUploader images={images} onChange={setImages} disabled={busy} />
      </Field>

      <Field error={errors.geoId}>
        {/* Required, unlike every other community picker in this app: a
            problem that is nowhere cannot be fixed, and the column is NOT
            NULL to match. */}
        <FieldLabel required>Which community</FieldLabel>
        <FieldSelect name="geoId" defaultValue="" required>
          <option value="">Choose a community</option>
          {villages.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name}
            </option>
          ))}
        </FieldSelect>
      </Field>

      <Field error={errors.locationText}>
        <FieldLabel>Where exactly</FieldLabel>
        <FieldInput
          name="locationText"
          placeholder="Behind the primary school, by the second junction"
        />
        <FieldDescription>
          However you would direct somebody walking there.
        </FieldDescription>
      </Field>

      <Field error={errors.latitude}>
        <FieldLabel>Put it on the map</FieldLabel>
        <input type="hidden" name="latitude" value={coords?.lat ?? ""} />
        <input type="hidden" name="longitude" value={coords?.lng ?? ""} />

        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={useMyLocation}
            isLoading={locating}
            loadingLabel="Finding you"
          >
            {locating ? null : <LocateFixed aria-hidden="true" />}
            {coords ? "Update to where I am" : "Use my current location"}
          </Button>

          {coords ? (
            <span className="text-xs text-muted-foreground">
              Pinned at {coords.lat}, {coords.lng}
              <button
                type="button"
                onClick={() => setCoords(null)}
                className="ml-2 underline underline-offset-2 hover:text-danger"
              >
                remove
              </button>
            </span>
          ) : null}
        </div>

        <FieldDescription>
          Optional, and only useful if you are standing near the problem. Without
          it the report still works — it simply will not appear on the map.
        </FieldDescription>

        {locateError ? (
          <p role="status" className="mt-1 text-xs text-muted-foreground">
            {locateError}
          </p>
        ) : null}
      </Field>

      <div className="flex items-center gap-3">
        <Button type="submit" size="lg" isLoading={busy} loadingLabel="Sending">
          Report this
        </Button>
        <UploadProgress count={uploading} />
      </div>
    </form>
  );
}
