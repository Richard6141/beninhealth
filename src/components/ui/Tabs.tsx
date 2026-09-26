"use client";

import { useId, useRef, useState } from "react";
import type { KeyboardEvent, ReactNode } from "react";
import { cn } from "@/lib/cn";

export interface TabItem {
  id: string;
  label: string;
  content: ReactNode;
}

export interface TabsProps {
  items: TabItem[];
  defaultActiveId?: string;
  /** Nom accessible de la piste d'onglets (aria-label du rôle tablist). */
  label?: string;
  className?: string;
}

export function Tabs({ items, defaultActiveId, label, className }: TabsProps) {
  const baseId = useId();
  const [activeId, setActiveId] = useState(defaultActiveId ?? items[0]?.id);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const activeItem = items.find((item) => item.id === activeId) ?? items[0];

  function focusTabAt(index: number) {
    const count = items.length;
    const nextIndex = (index + count) % count;
    const nextItem = items[nextIndex];
    setActiveId(nextItem.id);
    tabRefs.current[nextIndex]?.focus();
  }

  function handleKeyDown(
    event: KeyboardEvent<HTMLButtonElement>,
    index: number
  ) {
    if (event.key === "ArrowRight") {
      event.preventDefault();
      focusTabAt(index + 1);
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      focusTabAt(index - 1);
    } else if (event.key === "Home") {
      event.preventDefault();
      focusTabAt(0);
    } else if (event.key === "End") {
      event.preventDefault();
      focusTabAt(items.length - 1);
    }
  }

  return (
    <div className={className}>
      <div
        role="tablist"
        aria-label={label}
        className="flex items-center gap-6 border-b border-bordure"
      >
        {items.map((item, index) => {
          const selected = item.id === activeItem?.id;
          return (
            <button
              key={item.id}
              ref={(node) => {
                tabRefs.current[index] = node;
              }}
              id={`${baseId}-tab-${item.id}`}
              role="tab"
              type="button"
              aria-selected={selected}
              aria-controls={`${baseId}-panel-${item.id}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => setActiveId(item.id)}
              onKeyDown={(event) => handleKeyDown(event, index)}
              className={cn(
                "-mb-px border-b-2 px-1 py-2.5 text-[12px] font-semibold uppercase tracking-[0.06em] transition-colors motion-reduce:transition-none",
                "focus-visible:outline-2 focus-visible:outline-marine focus-visible:outline-offset-2",
                selected
                  ? "border-marine text-marine"
                  : "border-transparent text-encre-attenuee hover:text-encre"
              )}
            >
              {item.label}
            </button>
          );
        })}
      </div>
      {items.map((item) => (
        <div
          key={item.id}
          id={`${baseId}-panel-${item.id}`}
          role="tabpanel"
          aria-labelledby={`${baseId}-tab-${item.id}`}
          hidden={item.id !== activeItem?.id}
          tabIndex={0}
          className="mt-4"
        >
          {item.content}
        </div>
      ))}
    </div>
  );
}
