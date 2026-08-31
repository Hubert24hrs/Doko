"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { CheckCircle2 } from "lucide-react";

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
import type { ProfileRow } from "@/types/database";

import { updateProfileAction, type ProfileActionState } from "../actions";

const INITIAL: ProfileActionState = { ok: false };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" isLoading={pending} loadingLabel="Saving">
      Save changes
    </Button>
  );
}

export function ProfileForm({
  profile,
  villages,
}: {
  profile: ProfileRow;
  villages: VillageOption[];
}) {
  const [state, formAction] = useActionState(updateProfileAction, INITIAL);
  const errors = state.fieldErrors ?? {};

  return (
    <form action={formAction} className="space-y-5" noValidate>
      {state.ok && state.message ? (
        <p
          role="status"
          className="flex items-center gap-2 rounded-lg border border-primary/30 bg-eo-green-50 px-4 py-3 text-sm text-primary"
        >
          <CheckCircle2 className="size-4 shrink-0" aria-hidden="true" />
          {state.message}
        </p>
      ) : null}

      {state.formError ? (
        <div
          role="alert"
          className="rounded-lg border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger"
        >
          {state.formError}
        </div>
      ) : null}

      <Field error={errors.fullName}>
        <FieldLabel required>Full name</FieldLabel>
        <FieldInput
          name="fullName"
          defaultValue={profile.full_name}
          autoComplete="name"
          required
        />
      </Field>

      <Field error={errors.username}>
        <FieldLabel required>Username</FieldLabel>
        <FieldInput
          name="username"
          defaultValue={profile.username}
          autoComplete="username"
          required
        />
        <FieldDescription>
          Lowercase letters, numbers and underscores. This is how people find
          you.
        </FieldDescription>
      </Field>

      <Field error={errors.bio}>
        <FieldLabel>About you</FieldLabel>
        <FieldTextarea
          name="bio"
          defaultValue={profile.bio ?? ""}
          maxLength={500}
          rows={4}
        />
        <FieldDescription>Up to 500 characters.</FieldDescription>
      </Field>

      <Field error={errors.occupation}>
        <FieldLabel>Occupation</FieldLabel>
        <FieldInput
          name="occupation"
          defaultValue={profile.occupation ?? ""}
          placeholder="Teacher, trader, farmer…"
        />
      </Field>

      <Field error={errors.website}>
        <FieldLabel>Website</FieldLabel>
        <FieldInput
          name="website"
          type="url"
          defaultValue={profile.website ?? ""}
          placeholder="https://example.com"
          inputMode="url"
        />
      </Field>

      <Field error={errors.phone}>
        <FieldLabel>Phone number</FieldLabel>
        <FieldInput
          name="phone"
          type="tel"
          defaultValue={profile.phone ?? ""}
          autoComplete="tel"
          inputMode="tel"
          placeholder="08031234567"
        />
      </Field>

      <Field error={errors.villageId}>
        <FieldLabel>Your village</FieldLabel>
        <FieldSelect name="villageId" defaultValue={profile.village_id ?? ""}>
          <option value="">Prefer not to say</option>
          {villages.map((village) => (
            <option key={village.id} value={village.id}>
              {village.name}
              {village.districtName ? ` — ${village.districtName}` : ""}
            </option>
          ))}
        </FieldSelect>
        <FieldDescription>
          Always optional. You can explore every community either way, and
          change or clear this at any time.
        </FieldDescription>
      </Field>

      <Field error={errors.visibility}>
        <FieldLabel required>Who can see your profile</FieldLabel>
        <FieldSelect name="visibility" defaultValue={profile.visibility}>
          <option value="public">Everyone, including visitors</option>
          <option value="community">Only people in my community</option>
          <option value="private">Only me</option>
        </FieldSelect>
        <FieldDescription>
          This is enforced by the database, not just hidden in the interface.
        </FieldDescription>
      </Field>

      <SubmitButton />
    </form>
  );
}
