"use client";

import { useActionState, useState } from "react";
import { Pencil } from "lucide-react";

import { Button } from "@/components/ui/button";
import { updateCommunityAction, type GeoActionState } from "../actions";
import type { GeoEntityRow } from "@/types/database";

const initial: GeoActionState = { ok: false };

/**
 * Shown only to somebody the database will actually let write — see
 * canEditCommunity(). Offering it more widely would produce a button that
 * silently does nothing, which is the failure mode migration 029 was written
 * for: RLS refuses by filtering, so a refused UPDATE looks like success.
 *
 * Structural fields are absent on purpose. A community admin may say what a
 * place is called, never where it sits; migration 037's guard restores
 * parent_id, kind, slug and merged_into_id for anyone who is not a platform
 * admin, so a field for them here would be a control that lies.
 */
export function EditCommunityForm({ place }: { place: GeoEntityRow }) {
  const [open, setOpen] = useState(false);
  // Whether the confirmation belongs to the save that just happened, so a
  // Cancel after an earlier save does not bring the old one back.
  const [justSaved, setJustSaved] = useState(false);

  // Close on success, so the confirmation is actually seen. Found on the live
  // walkthrough: after saving, the form stayed open with no sign anything had
  // happened, because the confirmation only renders once the form is closed
  // and nothing closed it. Done inside the action rather than in an effect --
  // the save completing is the event, so this is where to respond to it.
  const [state, action, pending] = useActionState(
    async (prev: GeoActionState, formData: FormData) => {
      const result = await updateCommunityAction(prev, formData);
      if (result.ok) {
        setOpen(false);
        setJustSaved(true);
      }
      return result;
    },
    initial,
  );

  if (!open) {
    return (
      <div className="mt-6">
        <Button variant="secondary" onClick={() => { setJustSaved(false); setOpen(true); }}>
          <Pencil className="size-4" aria-hidden="true" />
          Correct these details
        </Button>
        {justSaved ? (
          <p role="status" className="mt-2 text-sm text-primary">
            Saved. Thank you for keeping the directory accurate.
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <form
      action={action}
      className="mt-6 rounded-xl border border-border bg-surface p-5"
    >
      <h2 className="text-lg font-semibold tracking-tight text-foreground">
        Correct these details
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Sources disagree about spellings and boundaries across Igbo Eze North.
        If you know this place, correct it — every change is recorded against
        your name.
      </p>

      <input type="hidden" name="id" value={place.id} />

      <div className="mt-4 grid gap-4">
        <Field label="Name" htmlFor="name">
          <input
            id="name"
            name="name"
            defaultValue={place.name}
            required
            maxLength={120}
            className={inputClass}
          />
        </Field>

        <Field
          label="Also called"
          htmlFor="aliases"
          hint="Separate alternative spellings with commas."
        >
          <input
            id="aliases"
            name="aliases"
            defaultValue={place.aliases.join(", ")}
            maxLength={500}
            className={inputClass}
          />
        </Field>

        <Field label="Description" htmlFor="description">
          <textarea
            id="description"
            name="description"
            defaultValue={place.description ?? ""}
            rows={3}
            maxLength={2000}
            className={inputClass}
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Latitude"
            htmlFor="latitude"
            hint="Optional. Give both or neither."
          >
            <input
              id="latitude"
              name="latitude"
              inputMode="decimal"
              defaultValue={place.latitude ?? ""}
              className={inputClass}
            />
          </Field>
          <Field label="Longitude" htmlFor="longitude">
            <input
              id="longitude"
              name="longitude"
              inputMode="decimal"
              defaultValue={place.longitude ?? ""}
              className={inputClass}
            />
          </Field>
        </div>

        <Field
          label="Order among its neighbours"
          htmlFor="sortOrder"
          hint="Lower numbers appear first."
        >
          <input
            id="sortOrder"
            name="sortOrder"
            inputMode="numeric"
            defaultValue={place.sort_order}
            className={`${inputClass} max-w-24`}
          />
        </Field>
      </div>

      {state.formError ? (
        <p role="alert" className="mt-4 text-sm text-danger">
          {state.formError}
        </p>
      ) : null}

      <div className="mt-5 flex flex-wrap gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save corrections"}
        </Button>
        <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

const inputClass =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";

function Field({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label
        htmlFor={htmlFor}
        className="block text-sm font-medium text-foreground"
      >
        {label}
      </label>
      {hint ? (
        <p className="mb-1 text-xs text-muted-foreground">{hint}</p>
      ) : (
        <div className="h-1" />
      )}
      {children}
    </div>
  );
}
