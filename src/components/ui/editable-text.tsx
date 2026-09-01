"use client";

import * as React from "react";
import { useFormStatus } from "react-dom";
import { Pencil } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Field, FieldLabel, FieldTextarea } from "@/components/ui/field";
import { cn } from "@/lib/utils/cn";

/**
 * Shared inline editor for a post or a reply.
 *
 * Both need identical behaviour and both already had the database half built —
 * an UPDATE policy plus a guard trigger stamping `edited_at` — while neither
 * had a way in. One component rather than two keeps the "edited" story
 * consistent wherever text can be changed.
 *
 * The open/closed state lives in an inner component that the caller remounts
 * via `key` on a successful save. That closes the editor without an effect
 * writing state and without reading a ref during render, both of which React
 * now warns about.
 */

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" isLoading={pending} loadingLabel="Saving">
      Save
    </Button>
  );
}

export function EditableText({
  body,
  canEdit,
  formAction,
  hiddenFields,
  maxLength,
  error,
  className,
  editLabel = "Edit",
}: {
  body: string;
  canEdit: boolean;
  formAction: (formData: FormData) => void;
  /** Identifiers the action needs, e.g. postId / commentId. */
  hiddenFields: Record<string, string>;
  maxLength: number;
  error?: string;
  className?: string;
  editLabel?: string;
}) {
  const [editing, setEditing] = React.useState(false);

  if (!editing) {
    return (
      <div className={cn("group/editable", className)}>
        {/*
          Text, never HTML. React escapes it and `pre-wrap` preserves the
          author's own line breaks, so there is no path from a body to markup.
        */}
        <p className="whitespace-pre-wrap break-words">{body}</p>

        {canEdit ? (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className={cn(
              "mt-1.5 inline-flex items-center gap-1 rounded text-xs font-medium",
              "text-muted-foreground transition-colors hover:text-primary",
            )}
          >
            <Pencil className="size-3" aria-hidden="true" />
            {editLabel}
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <form action={formAction} className={cn("space-y-2", className)} noValidate>
      {Object.entries(hiddenFields).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}

      <Field error={error}>
        <FieldLabel className="sr-only">Edit your text</FieldLabel>
        <FieldTextarea
          name="body"
          defaultValue={body}
          rows={4}
          maxLength={maxLength + 100}
          autoFocus
        />
      </Field>

      <div className="flex items-center justify-end gap-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setEditing(false)}
        >
          Cancel
        </Button>
        <SaveButton />
      </div>
    </form>
  );
}
