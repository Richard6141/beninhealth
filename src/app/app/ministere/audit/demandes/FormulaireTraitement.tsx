"use client";

import { useActionState, useId } from "react";
import {
  traiterDemandePersonneAction,
  type TraitementDemandeActionState,
} from "@/modules/audit/demandes";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";

const etatInitial: TraitementDemandeActionState = { error: null, success: false };

/** Formulaire de reponse a une demande de personne (F-AUD-04), disparait une fois traitee. */
export function FormulaireTraitement({ journalAuditId }: { journalAuditId: string }) {
  const [state, formAction, pending] = useActionState(traiterDemandePersonneAction, etatInitial);
  const reponseId = useId();

  if (state.success) {
    return <p className="text-[13px] font-semibold text-bon">Réponse enregistrée.</p>;
  }

  return (
    <form action={formAction} aria-busy={pending} className="flex flex-col gap-3 rounded-champ border border-bordure bg-surface p-3">
      <input type="hidden" name="journalAuditId" value={journalAuditId} />

      {state.error ? (
        <Alert level="critical" title="Réponse impossible">
          {state.error}
        </Alert>
      ) : null}

      <div className="flex flex-col gap-1.5">
        <label htmlFor={reponseId} className="text-[13px] font-semibold text-encre">
          Réponse <span className="text-critique" aria-hidden="true">*</span>
        </label>
        <textarea
          id={reponseId}
          name="reponse"
          required
          minLength={10}
          rows={3}
          placeholder="Au moins 10 caractères..."
          className="w-full resize-y rounded-champ border border-bordure-forte bg-surface px-3 py-2 text-[14px] text-encre transition-colors motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2"
        />
      </div>

      <Button type="submit" variant="primary" size="sm" className="w-fit" disabled={pending}>
        {pending ? "Enregistrement..." : "Enregistrer la réponse"}
      </Button>
    </form>
  );
}
