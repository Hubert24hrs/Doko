"use client";

import { useActionState, useState } from "react";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { createCommunityAction, type GeoActionState } from "../actions";
import { geoKinds } from "../schemas";

const initial: GeoActionState = { ok: false };

const KIND_LABEL: Record<(typeof geoKinds)[number], string> = {
  lga: "Local Government Area",
  town: "Town",
  autonomous_community: "Autonomous community",
  district: "District",
  village: "Village",
  area: "INEC council ward",
};

export interface ParentOption {
  id: string;
  label: string;
}

/**
 * Adding a community decides where it sits, which is a structural act — so
 * this is platform admins only, and lives in /admin rather than on the
 * community page where a community_admin would find it.
 *
 * There is no `slug` field. The address is derived from the name by
 * geo_free_slug() (migration 036), which returns one that is not already
 * taken, the same way handle_new_user de-duplicates usernames. Letting somebody
 * type a slug invites collisions the unique index would then refuse with a
 * constraint error.
 */
export function CreateCommunityForm({ parents }: { parents: ParentOption[] }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(createCommunityAction, initial);

  if (!open) {
    return (
      <div className="mt-6">
        <Button onClick={() => setOpen(true)}>
          <Plus className="size-4" aria-hidden="true" />
          Add a community
        </Button>
        {state.ok ? (
          <p role="status" className="mt-2 text-sm text-primary">
            Added, at /communities/{state.slug}.
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <form action={action} className="mt-6 rounded-xl border border-border bg-surface p-5">
      <h2 className="text-lg font-semibold tracking-tight text-foreground">
        Add a community
      </h2>
      <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
        The seed lists 31 villages while describing 33, and secondary sources
        cite 38 autonomous communities without naming them. This is how the gap
        gets closed.
      </p>

      <div className="mt-4 grid gap-4">
        <Field label="Name" htmlFor="name">
          <input id="name" name="name" required maxLength={120} className={inputClass} />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Kind" htmlFor="kind">
            <select id="kind" name="kind" defaultValue="village" className={inputClass}>
              {geoKinds
                .filter((k) => k !== "lga")
                .map((k) => (
                  <option key={k} value={k}>
                    {KIND_LABEL[k]}
                  </option>
                ))}
            </select>
          </Field>

          <Field label="Sits inside" htmlFor="parentId">
            <select id="parentId" name="parentId" required className={inputClass}>
              {parents.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <Field
          label="Also called"
          htmlFor="aliases"
          hint="Separate alternative spellings with commas."
        >
          <input id="aliases" name="aliases" maxLength={500} className={inputClass} />
        </Field>

        <Field label="Description" htmlFor="description">
          <textarea
            id="description"
            name="description"
            rows={3}
            maxLength={2000}
            className={inputClass}
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Latitude" htmlFor="latitude" hint="Optional. Give both or neither.">
            <input id="latitude" name="latitude" inputMode="decimal" className={inputClass} />
          </Field>
          <Field label="Longitude" htmlFor="longitude">
            <input id="longitude" name="longitude" inputMode="decimal" className={inputClass} />
          </Field>
        </div>
      </div>

      {state.formError ? (
        <p role="alert" className="mt-4 text-sm text-danger">
          {state.formError}
        </p>
      ) : null}

      <div className="mt-5 flex flex-wrap gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Adding…" : "Add community"}
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
      <label htmlFor={htmlFor} className="block text-sm font-medium text-foreground">
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
