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

import { createJobAction, type JobState } from "../actions";
import {
  JOB_CATEGORY_LABEL,
  JOB_DESCRIPTION_MAX,
  JOB_KIND_LABEL,
  JOB_ORG_MAX,
  JOB_TITLE_MAX,
  PAY_PERIOD_LABEL,
  jobCategories,
  jobKinds,
  payPeriods,
} from "../schemas";

const INITIAL: JobState = { ok: false };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" isLoading={pending} loadingLabel="Posting">
      Post this job
    </Button>
  );
}

export function CreateJobForm({ villages }: { villages: VillageOption[] }) {
  const [state, formAction] = useActionState(createJobAction, INITIAL);
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
        <FieldLabel required>What is the job</FieldLabel>
        <FieldInput
          name="title"
          required
          maxLength={JOB_TITLE_MAX}
          placeholder="Mathematics teacher, SS1 to SS3"
        />
      </Field>

      <Field error={errors.organizationName}>
        <FieldLabel>Who is hiring</FieldLabel>
        <FieldInput
          name="organizationName"
          maxLength={JOB_ORG_MAX}
          placeholder="Community Secondary School, Umuida"
        />
        <FieldDescription>
          The name of the school, clinic, shop or business. Leave it empty if
          you are hiring for yourself.
        </FieldDescription>
      </Field>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field error={errors.category}>
          <FieldLabel required>Kind of work</FieldLabel>
          <FieldSelect name="category" defaultValue="other">
            {jobCategories.map((c) => (
              <option key={c} value={c}>
                {JOB_CATEGORY_LABEL[c]}
              </option>
            ))}
          </FieldSelect>
        </Field>

        <Field error={errors.kind}>
          <FieldLabel required>Arrangement</FieldLabel>
          <FieldSelect name="kind" defaultValue="full_time">
            {jobKinds.map((k) => (
              <option key={k} value={k}>
                {JOB_KIND_LABEL[k]}
              </option>
            ))}
          </FieldSelect>
        </Field>
      </div>

      <Field error={errors.description}>
        <FieldLabel required>What the work involves</FieldLabel>
        <FieldTextarea
          name="description"
          rows={6}
          required
          maxLength={JOB_DESCRIPTION_MAX}
          placeholder="What the person will do, what experience is needed, when they would start."
        />
      </Field>

      <Field error={errors.locationText}>
        <FieldLabel>Where the work is</FieldLabel>
        <FieldInput name="locationText" placeholder="Ogrute, near the market" />
      </Field>

      <Field error={errors.geoId}>
        <FieldLabel>Community</FieldLabel>
        <FieldSelect name="geoId" defaultValue="">
          <option value="">Anywhere in Igbo Eze North</option>
          {villages.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name}
            </option>
          ))}
        </FieldSelect>
      </Field>

      <Field>
        <label className="flex items-center gap-2 text-sm text-foreground">
          <input
            type="checkbox"
            name="isRemote"
            className="size-4 rounded border-border-strong"
          />
          This work can be done from anywhere
        </label>
      </Field>

      <fieldset className="space-y-4 rounded-lg border border-border p-4">
        <legend className="px-1 text-sm font-semibold text-foreground">
          Pay
        </legend>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field error={errors.payMin}>
            <FieldLabel>From (₦)</FieldLabel>
            <FieldInput name="payMin" inputMode="numeric" placeholder="50000" />
          </Field>
          <Field error={errors.payMax}>
            <FieldLabel>To (₦)</FieldLabel>
            <FieldInput name="payMax" inputMode="numeric" placeholder="80000" />
          </Field>
          <Field error={errors.payPeriod}>
            <FieldLabel>Per</FieldLabel>
            <FieldSelect name="payPeriod" defaultValue="">
              <option value="">—</option>
              {payPeriods.map((p) => (
                <option key={p} value={p}>
                  {PAY_PERIOD_LABEL[p]}
                </option>
              ))}
            </FieldSelect>
          </Field>
        </div>

        <FieldDescription>
          {/* The database refuses a figure with no period, and so does the
              form. "50,000" could be a day or a month, and the difference is
              somebody's livelihood. */}
          If you give a figure you must say what it is per. Leave all three
          empty to say nothing about pay.
        </FieldDescription>

        <label className="flex items-center gap-2 text-sm text-foreground">
          <input
            type="checkbox"
            name="payIsNegotiable"
            className="size-4 rounded border-border-strong"
          />
          Negotiable
        </label>
      </fieldset>

      <fieldset className="space-y-4 rounded-lg border border-border p-4">
        <legend className="px-1 text-sm font-semibold text-foreground">
          How people should reach you
        </legend>

        <FieldDescription>
          {/* The reason for the separate table, said plainly to the person
              typing their number in. */}
          These are shown only to signed-in members, never on the public page
          and never to search engines.
        </FieldDescription>

        <Field error={errors.contactName}>
          <FieldLabel>Name to ask for</FieldLabel>
          <FieldInput name="contactName" placeholder="Mr Eze" />
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
          <FieldLabel>A web page to apply on</FieldLabel>
          <FieldInput name="externalUrl" placeholder="https://…" />
        </Field>

        <Field error={errors.instructions}>
          <FieldLabel>Anything else about applying</FieldLabel>
          <FieldTextarea
            name="instructions"
            rows={3}
            placeholder="Bring your certificates. Come between 9am and 2pm."
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
          Without one it still reaches everybody in Igbo Eze North.
        </FieldDescription>
      </Field>

      <SubmitButton />
    </form>
  );
}
