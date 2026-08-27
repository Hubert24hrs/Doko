"use client";

import * as React from "react";

import { cn } from "@/lib/utils/cn";

/**
 * Accessible form field primitives.
 *
 * `Field` wires the label, description, and error message to the control via
 * generated ids, so the control always carries a correct `aria-describedby`
 * and `aria-invalid` without each form having to remember.
 */

interface FieldContextValue {
  id: string;
  descriptionId: string;
  errorId: string;
  hasError: boolean;
}

const FieldContext = React.createContext<FieldContextValue | null>(null);

function useFieldContext(component: string): FieldContextValue {
  const ctx = React.useContext(FieldContext);
  if (!ctx) {
    throw new Error(`<${component}> must be rendered inside a <Field>`);
  }
  return ctx;
}

export function Field({
  children,
  error,
  className,
}: {
  children: React.ReactNode;
  error?: string;
  className?: string;
}) {
  const reactId = React.useId();
  const value = React.useMemo<FieldContextValue>(
    () => ({
      id: `${reactId}-control`,
      descriptionId: `${reactId}-description`,
      errorId: `${reactId}-error`,
      hasError: Boolean(error),
    }),
    [reactId, error],
  );

  return (
    <FieldContext.Provider value={value}>
      <div className={cn("flex flex-col gap-1.5", className)}>
        {children}
        {error ? (
          <p
            id={value.errorId}
            role="alert"
            className="text-sm font-medium text-danger"
          >
            {error}
          </p>
        ) : null}
      </div>
    </FieldContext.Provider>
  );
}

export function FieldLabel({
  children,
  required,
  className,
}: {
  children: React.ReactNode;
  required?: boolean;
  className?: string;
}) {
  const { id } = useFieldContext("FieldLabel");
  return (
    <label
      htmlFor={id}
      className={cn("text-sm font-medium text-foreground", className)}
    >
      {children}
      {required ? (
        <>
          <span aria-hidden="true" className="ml-0.5 text-danger">
            *
          </span>
          <span className="sr-only"> (required)</span>
        </>
      ) : null}
    </label>
  );
}

export function FieldDescription({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const { descriptionId } = useFieldContext("FieldDescription");
  return (
    <p
      id={descriptionId}
      className={cn("text-xs text-muted-foreground", className)}
    >
      {children}
    </p>
  );
}

const controlClasses = [
  "w-full rounded-lg border border-border bg-surface px-3 py-2",
  "text-sm text-foreground placeholder:text-muted-foreground",
  "transition-colors",
  "hover:border-border-strong",
  "disabled:cursor-not-allowed disabled:opacity-60",
  "aria-[invalid=true]:border-danger",
].join(" ");

export const FieldInput = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(function FieldInput({ className, ...props }, ref) {
  const { id, descriptionId, errorId, hasError } =
    useFieldContext("FieldInput");
  return (
    <input
      ref={ref}
      id={id}
      className={cn(controlClasses, "h-10", className)}
      aria-invalid={hasError || undefined}
      aria-describedby={cn(descriptionId, hasError && errorId)}
      {...props}
    />
  );
});

export const FieldTextarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(function FieldTextarea({ className, ...props }, ref) {
  const { id, descriptionId, errorId, hasError } =
    useFieldContext("FieldTextarea");
  return (
    <textarea
      ref={ref}
      id={id}
      className={cn(controlClasses, "min-h-24 resize-y", className)}
      aria-invalid={hasError || undefined}
      aria-describedby={cn(descriptionId, hasError && errorId)}
      {...props}
    />
  );
});

export const FieldSelect = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(function FieldSelect({ className, children, ...props }, ref) {
  const { id, descriptionId, errorId, hasError } =
    useFieldContext("FieldSelect");
  return (
    <select
      ref={ref}
      id={id}
      className={cn(controlClasses, "h-10", className)}
      aria-invalid={hasError || undefined}
      aria-describedby={cn(descriptionId, hasError && errorId)}
      {...props}
    >
      {children}
    </select>
  );
});
