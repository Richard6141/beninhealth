"use client";

import { useActionState, useState } from "react";
import {
  retirerConsultationAction,
  type ClinicalActionState,
} from "@/modules/clinical/actions";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/TextField";

const etatInitial: ClinicalActionState = { error: null, success: false };

/**
 * Retrait d'une consultation saisie par erreur (F-CLI-08 du pack) : reserve
 * au cas d'une consultation enregistree sur le mauvais patient. Jamais une
 * suppression : la consultation reste visible, barree a l'ecran. Exige le
 * mot de passe du compte (RG-AUTH-53, re-authentification), jamais
 * pre-rempli ni mémorisé.
 */
export function FormulaireRetrait({ consultationId }: { consultationId: string }) {
  const [ouvert, setOuvert] = useState(false);
  const [state, formAction, pending] = useActionState(retirerConsultationAction, etatInitial);

  if (state.success) {
    return <p className="text-[13px] font-semibold text-critique">Consultation retirée (saisie par erreur).</p>;
  }

  if (!ouvert) {
    return (
      <Button type="button" variant="danger" className="w-fit" onClick={() => setOuvert(true)}>
        Marquer comme saisie par erreur
      </Button>
    );
  }

  return (
    <form
      action={formAction}
      aria-busy={pending}
      className="flex flex-col gap-3 rounded-champ border border-critique bg-critique-clair p-3"
    >
      <input type="hidden" name="consultationId" value={consultationId} />

      <Alert level="critical" title="Retrait pour saisie sur le mauvais patient">
        Réservé au cas où cette consultation a été enregistrée par erreur pour
        ce patient. Elle restera visible, barrée, et sera exclue des
        statistiques. Cette action nécessite votre mot de passe.
      </Alert>

      {state.error ? (
        <Alert level="critical" title="Retrait impossible">
          {state.error}
        </Alert>
      ) : null}

      <TextField label="Motif du retrait" name="motif" required />
      <TextField label="Votre mot de passe" name="motDePasse" type="password" required />

      <div className="flex flex-wrap gap-2">
        <Button type="submit" variant="primary" disabled={pending}>
          {pending ? "Retrait en cours..." : "Confirmer le retrait"}
        </Button>
        <Button type="button" variant="secondary" onClick={() => setOuvert(false)}>
          Annuler
        </Button>
      </div>
    </form>
  );
}
