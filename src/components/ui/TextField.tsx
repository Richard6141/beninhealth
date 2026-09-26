"use client";

import { useId } from "react";
import type { InputHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export interface TextFieldProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "id"> {
  label: string;
  required?: boolean;
  /** Aide contextuelle, reliée au champ par aria-describedby. */
  hint?: string;
  /** Message d'erreur, annoncé via role="alert". */
  error?: string;
  /** Unité affichée en incrustation à droite (ex. km, %, FCFA). */
  unit?: string;
  id?: string;
}

export function TextField({
  label,
  required = false,
  hint,
  error,
  unit,
  id,
  className,
  type = "text",
  ...props
}: TextFieldProps) {
  const generatedId = useId();
  const fieldId = id ?? generatedId;
  const hintId = hint ? `${fieldId}-hint` : undefined;
  const errorId = error ? `${fieldId}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;

  return (
    <div className="flex flex-col gap-1.5">
      <label
        htmlFor={fieldId}
        className="flex flex-wrap items-baseline gap-1.5 text-[18px] font-semibold text-encre"
      >
        {label}
        {required ? (
          <span className="text-critique" aria-hidden="true">
            *
          </span>
        ) : (
          <span className="text-[13px] font-normal text-encre-attenuee">
            (facultatif)
          </span>
        )}
      </label>
      {hint ? (
        <p id={hintId} className="text-[13px] text-encre-secondaire">
          {hint}
        </p>
      ) : null}
      <div className="relative">
        <input
          id={fieldId}
          type={type}
          required={required}
          aria-describedby={describedBy}
          aria-invalid={Boolean(error) || undefined}
          className={cn(
            "h-11 w-full rounded-champ border bg-surface px-3 text-[16px] text-encre transition-colors motion-reduce:transition-none placeholder:text-encre-attenuee",
            "focus-visible:outline-2 focus-visible:outline-marine focus-visible:outline-offset-2",
            unit ? "pr-12" : undefined,
            error ? "border-critique" : "border-bordure-forte",
            className
          )}
          {...props}
        />
        {unit ? (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-[13px] text-encre-attenuee"
          >
            {unit}
          </span>
        ) : null}
      </div>
      {error ? (
        <p id={errorId} role="alert" className="text-[13px] text-critique">
          {error}
        </p>
      ) : null}
    </div>
  );
}
