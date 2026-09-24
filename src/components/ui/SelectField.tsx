"use client";

import { useId } from "react";
import type { SelectHTMLAttributes } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/cn";

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectFieldProps
  extends Omit<SelectHTMLAttributes<HTMLSelectElement>, "id"> {
  label: string;
  required?: boolean;
  hint?: string;
  error?: string;
  options: SelectOption[];
  placeholder?: string;
  id?: string;
}

export function SelectField({
  label,
  required = false,
  hint,
  error,
  options,
  placeholder,
  id,
  className,
  defaultValue,
  ...props
}: SelectFieldProps) {
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
        <select
          id={fieldId}
          required={required}
          aria-describedby={describedBy}
          aria-invalid={Boolean(error) || undefined}
          defaultValue={defaultValue ?? (placeholder ? "" : undefined)}
          className={cn(
            "h-11 w-full appearance-none rounded-champ border bg-surface px-3 pr-10 text-[16px] text-encre transition-colors motion-reduce:transition-none",
            "focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2",
            error ? "border-critique" : "border-bordure-forte",
            className
          )}
          {...props}
        >
          {placeholder ? (
            <option value="" disabled hidden>
              {placeholder}
            </option>
          ) : null}
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <ChevronDown
          aria-hidden="true"
          size={16}
          className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-encre-attenuee"
        />
      </div>
      {error ? (
        <p id={errorId} role="alert" className="text-[13px] text-critique">
          {error}
        </p>
      ) : null}
    </div>
  );
}
