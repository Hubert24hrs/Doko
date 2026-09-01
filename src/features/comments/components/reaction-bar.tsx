"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { ThumbsUp, PartyPopper, HeartHandshake, Frown } from "lucide-react";

import { cn } from "@/lib/utils/cn";
import type { ReactionKind } from "@/types/database";

import { setReactionAction, type CommentActionState } from "../actions";

const INITIAL: CommentActionState = { ok: false };

/**
 * The four reactions, chosen for this community rather than copied.
 *
 * Funerals and festivals are both major events in Igbo-Eze North, so "sad"
 * belongs beside "celebrate", and "support" carries the condolence and
 * solidarity cases that a bare thumbs-up handles badly.
 */
const REACTIONS: {
  kind: ReactionKind;
  label: string;
  icon: typeof ThumbsUp;
}[] = [
  { kind: "like", label: "Like", icon: ThumbsUp },
  { kind: "celebrate", label: "Celebrate", icon: PartyPopper },
  { kind: "support", label: "Support", icon: HeartHandshake },
  { kind: "sad", label: "Sad news", icon: Frown },
];

function ReactionButton({
  kind,
  label,
  Icon,
  active,
}: {
  kind: ReactionKind;
  label: string;
  Icon: typeof ThumbsUp;
  active: boolean;
}) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      name="kind"
      value={kind}
      disabled={pending}
      // aria-pressed makes this a toggle to a screen reader, which is exactly
      // what it is: pressing your current reaction takes it back.
      aria-pressed={active}
      title={active ? `${label} — press again to undo` : label}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium",
        "transition-colors disabled:opacity-60",
        active
          ? "border-primary/40 bg-eo-green-50 text-primary"
          : "border-border bg-surface text-muted-foreground hover:border-border-strong hover:text-foreground",
      )}
    >
      <Icon className="size-3.5" aria-hidden="true" />
      {label}
    </button>
  );
}

export function ReactionBar({
  postId,
  count,
  viewerReaction,
}: {
  postId: string;
  count: number;
  viewerReaction: ReactionKind | null;
}) {
  const [state, formAction] = useActionState(setReactionAction, INITIAL);

  return (
    <div className="space-y-2">
      {state.formError ? (
        <p role="alert" className="text-xs text-danger">
          {state.formError}
        </p>
      ) : null}

      <form action={formAction} className="flex flex-wrap items-center gap-1.5">
        <input type="hidden" name="postId" value={postId} />

        {REACTIONS.map(({ kind, label, icon: Icon }) => (
          <ReactionButton
            key={kind}
            kind={kind}
            label={label}
            Icon={Icon}
            active={viewerReaction === kind}
          />
        ))}

        {count > 0 ? (
          <span className="ml-1 text-xs tabular-nums text-muted-foreground">
            {count.toLocaleString("en-NG")}
            <span className="sr-only"> reactions</span>
          </span>
        ) : null}
      </form>
    </div>
  );
}
