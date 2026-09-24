"use client";

import { useId } from "react";
import type { TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export interface ChampTextareaProps
  extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "id"> {
  label: string;
  required?: boolean;
  /** Aide contextuelle, reliee au champ par aria-describedby. */
  hint?: string;
  /** Message d'erreur, annonce via role="alert". */
  error?: string;
  id?: string;
}

/**
 * Champ multiligne visuellement aligne sur TextField (src/components/ui),
 * qui ne prend en charge que <input>. Composant local a ministere/, non
 * exporte vers src/components/ui : la creation d'etablissement est le seul
 * ecran de ce perimetre a avoir besoin d'un champ "une ligne par valeur"
 * (services disponibles).
 */
export function ChampTextarea({
  label,
  required = false,
  hint,
  error,
  id,
  className,
  rows = 4,
  ...props
}: ChampTextareaProps) {
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
      <textarea
        id={fieldId}
        rows={rows}
        required={required}
        aria-describedby={describedBy}
        aria-invalid={Boolean(error) || undefined}
        className={cn(
          "w-full resize-y rounded-champ border bg-surface px-3 py-2 text-[16px] text-encre transition-colors motion-reduce:transition-none placeholder:text-encre-attenuee",
          "focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2",
          error ? "border-critique" : "border-bordure-forte",
          className
        )}
        {...props}
      />
      {error ? (
        <p id={errorId} role="alert" className="text-[13px] text-critique">
          {error}
        </p>
      ) : null}
    </div>
  );
}
