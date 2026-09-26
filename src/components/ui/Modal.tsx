"use client";

import {
  forwardRef,
  useEffect,
  useId,
  useImperativeHandle,
  useRef,
} from "react";
import type { MouseEvent, ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";

export type ModalVariant = "dialog" | "drawer-right" | "drawer-bottom";
export type ModalWidth = "narrow" | "wide";

export interface ModalHandle {
  showModal: () => void;
  close: () => void;
}

export interface ModalProps {
  variant?: ModalVariant;
  /** Ignoré pour les variantes tiroir. */
  width?: ModalWidth;
  /** Icône optionnelle affichée à côté du titre, dans l'en-tête. */
  icon?: LucideIcon;
  title: string;
  description?: string;
  children?: ReactNode;
  onClose?: () => void;
}

/**
 * Fenêtre modale basée sur l'élément natif <dialog> + showModal() : piégeage
 * du focus, touche Échap et fond assombri fournis par le navigateur, jamais
 * réimplémentés à la main. Le clic sur le fond ferme aussi la modale.
 */
export const Modal = forwardRef<ModalHandle, ModalProps>(function Modal(
  { variant = "dialog", width = "narrow", icon: Icon, title, description, children, onClose },
  ref
) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useImperativeHandle(ref, () => ({
    showModal: () => dialogRef.current?.showModal(),
    close: () => dialogRef.current?.close(),
  }));

  useEffect(() => {
    const node = dialogRef.current;
    if (!node || !onClose) return;
    node.addEventListener("close", onClose);
    return () => node.removeEventListener("close", onClose);
  }, [onClose]);

  function handleBackdropClick(event: MouseEvent<HTMLDialogElement>) {
    if (event.target === dialogRef.current) {
      dialogRef.current?.close();
    }
  }

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      onClick={handleBackdropClick}
      className={cn(
        "m-auto overflow-hidden rounded-flottant border border-bordure bg-surface p-0 text-encre shadow-[var(--ombre-carte)] backdrop:bg-encre/40",
        width === "narrow" ? "w-full max-w-sm" : "w-full max-w-2xl",
        variant === "drawer-right" &&
          "anim-tiroir-droite m-0 ml-auto h-dvh max-h-dvh w-full max-w-sm rounded-none rounded-l-flottant",
        variant === "drawer-bottom" &&
          "anim-tiroir-bas m-0 mt-auto h-auto max-h-[80dvh] w-full max-w-none rounded-none rounded-t-flottant"
      )}
    >
      <div className="flex items-center justify-between gap-4 bg-marine p-4 sm:p-6">
        <div className="flex flex-col gap-1">
          <h2 id={titleId} className="flex items-center gap-2.5 text-[18px] font-bold text-white">
            {Icon ? <Icon size={20} className="shrink-0" aria-hidden="true" /> : null}
            {title}
          </h2>
          {description ? (
            <p className="text-[13px] text-white/70">{description}</p>
          ) : null}
        </div>
        <button
          type="button"
          title="Fermer"
          aria-label="Fermer"
          onClick={() => dialogRef.current?.close()}
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-carte bg-white/10 text-white transition-colors motion-reduce:transition-none hover:bg-white/20",
            "focus-visible:outline-2 focus-visible:outline-white focus-visible:outline-offset-2"
          )}
        >
          <X size={18} aria-hidden="true" />
        </button>
      </div>
      <div className="p-4 sm:p-6">{children}</div>
    </dialog>
  );
});
