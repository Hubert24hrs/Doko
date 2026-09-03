"use client";

import { useActionState, useState } from "react";
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

import { createEventAction, type EventState } from "../actions";
import {
  EVENT_DESCRIPTION_MAX,
  EVENT_KIND_LABEL,
  EVENT_TITLE_MAX,
  EVENT_VENUE_MAX,
  eventKinds,
} from "../schemas";

const INITIAL: EventState = { ok: false };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" isLoading={pending} loadingLabel="Publishing">
      Publish event
    </Button>
  );
}

export function CreateEventForm({ villages }: { villages: VillageOption[] }) {
  const [state, formAction] = useActionState(createEventAction, INITIAL);
  const [allDay, setAllDay] = useState(false);
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

      <Field error={errors.title}>
        <FieldLabel required>What is happening</FieldLabel>
        <FieldInput
          name="title"
          required
          maxLength={EVENT_TITLE_MAX}
          placeholder="New Yam Festival, Umuida"
        />
      </Field>

      <Field error={errors.kind}>
        <FieldLabel required>Kind of event</FieldLabel>
        <FieldSelect name="kind" defaultValue="meeting">
          {eventKinds.map((kind) => (
            <option key={kind} value={kind}>
              {EVENT_KIND_LABEL[kind]}
            </option>
          ))}
        </FieldSelect>
      </Field>

      <Field error={errors.startsAtLocal}>
        <FieldLabel required>Starts</FieldLabel>
        <FieldInput name="startsAtLocal" type="datetime-local" required />
        <FieldDescription>
          {/* Stated rather than assumed. Somebody filling this in from Lagos,
              London or Houston is describing a time in Igbo-Eze North, and the
              form should say so instead of quietly using their own clock. */}
          All times are West Africa Time (Nigeria).
        </FieldDescription>
      </Field>

      <Field error={errors.endsAtLocal}>
        <FieldLabel>Ends</FieldLabel>
        <FieldInput name="endsAtLocal" type="datetime-local" />
        <FieldDescription>
          Optional. Leave it empty and the event stays listed for the whole of
          that day.
        </FieldDescription>
      </Field>

      <Field>
        <label className="flex items-center gap-2 text-sm text-foreground">
          <input
            type="checkbox"
            name="isAllDay"
            checked={allDay}
            onChange={(e) => setAllDay(e.target.checked)}
            className="size-4 rounded border-border-strong"
          />
          This runs all day
        </label>
      </Field>

      <Field error={errors.venue}>
        <FieldLabel>Where exactly</FieldLabel>
        <FieldInput
          name="venue"
          maxLength={EVENT_VENUE_MAX}
          placeholder="The village square, behind the market"
        />
        <FieldDescription>
          {/* Free text on purpose: no dropdown of venues will ever contain
              "behind the primary school". */}
          Written however people would actually give directions.
        </FieldDescription>
      </Field>

      <Field error={errors.geoId}>
        <FieldLabel>Community</FieldLabel>
        <FieldSelect name="geoId" defaultValue="">
          <option value="">Anywhere in Igbo-Eze North</option>
          {villages.map((village) => (
            <option key={village.id} value={village.id}>
              {village.name}
            </option>
          ))}
        </FieldSelect>
      </Field>

      <Field error={errors.visibility}>
        <FieldLabel required>Who can see it</FieldLabel>
        <FieldSelect name="visibility" defaultValue="public">
          <option value="public">Everyone</option>
          <option value="community">Only my community</option>
        </FieldSelect>
        <FieldDescription>
          {/* This sentence used to say the opposite, and was wrong.
              member_of_geo(null) is TRUE by design -- an event with no
              community chosen belongs to the whole LGA, not to nobody. */}
          &ldquo;Only my community&rdquo; needs a community chosen above.
          Without one it still reaches everybody in Igbo-Eze North.
        </FieldDescription>
      </Field>

      <Field error={errors.description}>
        <FieldLabel>Anything else people should know</FieldLabel>
        <FieldTextarea
          name="description"
          rows={5}
          maxLength={EVENT_DESCRIPTION_MAX}
          placeholder="Who is invited, what to bring, who to contact."
        />
      </Field>

      <SubmitButton />
    </form>
  );
}
