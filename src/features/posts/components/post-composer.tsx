"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { Globe2, Users } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Field, FieldLabel, FieldSelect, FieldTextarea } from "@/components/ui/field";
import type { VillageOption } from "@/features/geo/queries";

import { createPostAction, type PostActionState } from "../actions";
import { POST_MAX_LENGTH } from "../schemas";

const INITIAL: PostActionState = { ok: false };

function SubmitButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      isLoading={pending}
      loadingLabel="Posting"
      disabled={disabled}
    >
      Post
    </Button>
  );
}

/**
 * The textarea and everything that depends on its length.
 *
 * Kept as its own component so the parent can clear it by changing the `key`
 * on a successful post. That remounts this subtree, resetting both the text
 * and the character count in one step -- no effect that writes state, and no
 * ref read during render. Both of those are things React now warns about, and
 * both were avoidable by letting remounting do the work.
 */
function ComposerBody({ error }: { error?: string }) {
  const [length, setLength] = useState(0);
  const remaining = POST_MAX_LENGTH - length;
  const overLimit = remaining < 0;

  return (
    <>
      <Field error={error}>
        <FieldLabel className="sr-only">Write a post</FieldLabel>
        <FieldTextarea
          name="body"
          rows={3}
          maxLength={POST_MAX_LENGTH + 100}
          placeholder="What is happening in your community?"
          onChange={(e) => setLength(e.target.value.length)}
        />
      </Field>

      <div className="flex items-center justify-end gap-3">
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
        <SubmitButton disabled={length === 0 || overLimit} />
      </div>
    </>
  );
}

export function PostComposer({
  villages,
  defaultGeoId,
}: {
  villages: VillageOption[];
  /** The member's own village, pre-selected so the common case is one click. */
  defaultGeoId?: string | null;
}) {
  const [state, formAction] = useActionState(createPostAction, INITIAL);

  return (
    <Card>
      <CardContent className="pt-5">
        <form action={formAction} className="space-y-3" noValidate>
          {state.formError ? (
            <div
              role="alert"
              className="rounded-lg border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger"
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

          {/*
            The key is what clears the composer. Each successful post carries a
            fresh timestamp, so this subtree remounts and the textarea and its
            counter both return to empty.
          */}
          <ComposerBody
            key={state.postedAt ?? "compose"}
            error={state.fieldErrors?.body}
          />
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
