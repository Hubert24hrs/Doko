"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

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

import { createGroupAction, type GroupActionState } from "../actions";
import {
  GROUP_DESCRIPTION_MAX,
  GROUP_KIND_LABEL,
  GROUP_NAME_MAX,
  groupKinds,
} from "../schemas";

const INITIAL: GroupActionState = { ok: false };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" isLoading={pending} loadingLabel="Creating">
      Create group
    </Button>
  );
}

export function CreateGroupForm({ villages }: { villages: VillageOption[] }) {
  const [state, formAction] = useActionState(createGroupAction, INITIAL);
  const errors = state.fieldErrors ?? {};

  return (
    <form action={formAction} className="space-y-5" noValidate>
      {state.formError ? (
        <div
          role="alert"
          className="rounded-lg border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger"
        >
          {state.formError}
        </div>
      ) : null}

      <Field error={errors.name}>
        <FieldLabel required>Group name</FieldLabel>
        <FieldInput
          name="name"
          required
          maxLength={GROUP_NAME_MAX}
          placeholder="Umuida Youth Association"
        />
        <FieldDescription>
          The web address is made from the name; you do not need to choose one.
        </FieldDescription>
      </Field>

      <Field error={errors.description}>
        <FieldLabel>What is this group for?</FieldLabel>
        <FieldTextarea
          name="description"
          rows={3}
          maxLength={GROUP_DESCRIPTION_MAX}
          placeholder="Who it is for, and what it is used for."
        />
      </Field>

      <Field error={errors.kind}>
        <FieldLabel required>Kind of group</FieldLabel>
        <FieldSelect name="kind" defaultValue="interest">
          {groupKinds.map((k) => (
            <option key={k} value={k}>
              {GROUP_KIND_LABEL[k]}
            </option>
          ))}
        </FieldSelect>
      </Field>

      <Field error={errors.geoId}>
        <FieldLabel>Community</FieldLabel>
        <FieldSelect name="geoId" defaultValue="">
          <option value="">Not tied to one place</option>
          {villages.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name}
              {v.districtName ? ` — ${v.districtName}` : ""}
            </option>
          ))}
        </FieldSelect>
        <FieldDescription>
          Optional. A village meeting belongs somewhere; a trade association
          may not.
        </FieldDescription>
      </Field>

      <Field error={errors.visibility}>
        <FieldLabel required>Who can see this group</FieldLabel>
        <FieldSelect name="visibility" defaultValue="public">
          <option value="public">Anyone — and anyone may join</option>
          <option value="private">Members only</option>
        </FieldSelect>
        <FieldDescription>
          A private group and everything posted in it are visible only to its
          members. This is enforced by the database, not hidden in the
          interface.
        </FieldDescription>
      </Field>

      <SubmitButton />
    </form>
  );
}
