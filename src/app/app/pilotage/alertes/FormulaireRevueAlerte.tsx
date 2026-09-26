"use client";

import { useActionState, useId, useState } from "react";
import { revueAlerteAction, type RevueAlerteActionState } from "@/modules/pilotage/alertes";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";

const etatInitial: RevueAlerteActionState = { error: null, success: false };

/**
 * Revue d'une alerte epidemiologique (F-PIL-06) : marquer comme vue (simple
 * accuse de lecture) ou fermer avec un motif (commentaire obligatoire, au
 * moins 10 caracteres). Disparait une fois fermee.
 */
export function FormulaireRevueAlerte({ alerteId, dejaVue }: { alerteId: string; dejaVue: boolean }) {
  const [state, formAction, pending] = useActionState(revueAlerteAction, etatInitial);
  const [afficherFermeture, setAfficherFermeture] = useState(false);
  const commentaireId = useId();

  if (state.success) {
    return <p className="text-[13px] font-semibold text-bon">Enregistré.</p>;
  }

  return (
    <div className="flex flex-col gap-3 rounded-champ border border-bordure bg-surface p-3">
      {state.error ? (
        <Alert level="critical" title="Action impossible">
          {state.error}
        </Alert>
      ) : null}

      {!afficherFermeture ? (
        <div className="flex flex-wrap gap-2">
          {!dejaVue ? (
            <form action={formAction}>
              <input type="hidden" name="alerteId" value={alerteId} />
              <input type="hidden" name="decision" value="vue" />
              <Button type="submit" variant="secondary" size="sm" disabled={pending}>
                {pending ? "Enregistrement..." : "Marquer comme vue"}
              </Button>
            </form>
          ) : null}
          <Button type="button" variant="secondary" size="sm" onClick={() => setAfficherFermeture(true)}>
            Fermer l&apos;alerte
          </Button>
        </div>
      ) : (
        <form action={formAction} aria-busy={pending} className="flex flex-col gap-3">
          <input type="hidden" name="alerteId" value={alerteId} />
          <input type="hidden" name="decision" value="fermee" />

          <div className="flex flex-col gap-1.5">
            <label htmlFor={commentaireId} className="text-[13px] font-semibold text-encre">
              Motif de fermeture <span className="text-critique" aria-hidden="true">*</span>
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

          <div className="flex gap-2">
            <Button type="submit" variant="secondary" size="sm" disabled={pending}>
              {pending ? "Enregistrement..." : "Fermer l'alerte"}
            </Button>
            <Button type="button" variant="secondary" size="sm" onClick={() => setAfficherFermeture(false)}>
              Annuler
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
