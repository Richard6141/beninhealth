"use client";

import { useActionState, useId } from "react";
import {
  cloturerSignalementAction,
  type ClotureSignalementActionState,
} from "@/modules/audit/anomalies";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";

const etatInitial: ClotureSignalementActionState = { error: null, success: false };

/** Formulaire de cloture d'un signalement d'anomalie (F-AUD-03), disparait une fois ferme. */
export function FormulaireCloture({ signalementId }: { signalementId: string }) {
  const [state, formAction, pending] = useActionState(cloturerSignalementAction, etatInitial);
  const commentaireId = useId();

  if (state.success) {
    return <p className="text-[13px] font-semibold text-bon">Signalement fermé.</p>;
  }

  return (
    <form action={formAction} aria-busy={pending} className="flex flex-col gap-3 rounded-champ border border-bordure bg-surface p-3">
      <input type="hidden" name="signalementId" value={signalementId} />

      {state.error ? (
        <Alert level="critical" title="Fermeture impossible">
          {state.error}
        </Alert>
      ) : null}

      <div className="flex flex-col gap-1.5">
        <label htmlFor={commentaireId} className="text-[13px] font-semibold text-encre">
          Commentaire <span className="text-critique" aria-hidden="true">*</span>
        </label>
        <textarea
          id={commentaireId}
          name="commentaire"
          required
          minLength={10}
          rows={3}
          placeholder="Au moins 10 caractères..."
          className="w-full resize-y rounded-champ border border-bordure-forte bg-surface px-3 py-2 text-[14px] text-encre transition-colors motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2"
        />
      </div>

      <Button type="submit" variant="secondary" size="sm" className="w-fit" disabled={pending}>
        {pending ? "Enregistrement..." : "Fermer le signalement"}
      </Button>
    </form>
  );
}
