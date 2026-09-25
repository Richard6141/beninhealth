"use client";

import { useActionState, useState } from "react";
import { retirerVaccinationAction, type VaccinationActionState } from "@/modules/vaccination/actions";
import { LONGUEUR_MIN_MOTIF_RETRAIT } from "@/modules/vaccination/referentiel";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/TextField";

const etatInitial: VaccinationActionState = { error: null, success: false };

/**
 * Retrait d'une vaccination saisie par erreur (RG-CLI-100 du pack) : jamais
 * une modification ni une suppression, seulement un marquage motive. La
 * vaccination reste visible, barree a l'ecran (voir ListeVaccinations).
 */
export function FormulaireRetraitVaccination({ vaccinationId }: { vaccinationId: string }) {
  const [ouvert, setOuvert] = useState(false);
  const [state, formAction, pending] = useActionState(retirerVaccinationAction, etatInitial);

  if (state.success) {
    return (
      <p className="text-[13px] font-semibold text-critique">
        Vaccination retiree (saisie par erreur).
      </p>
    );
  }

  if (!ouvert) {
    return (
      <Button type="button" variant="danger" size="sm" className="w-fit" onClick={() => setOuvert(true)}>
        Signaler une erreur de saisie
      </Button>
    );
  }

  return (
    <form
      action={formAction}
      aria-busy={pending}
      className="flex flex-col gap-3 rounded-champ border border-critique bg-critique-clair p-3"
    >
      <input type="hidden" name="vaccinationId" value={vaccinationId} />

      <Alert level="critical" title="Retrait pour saisie par erreur">
        Reserve a une erreur de saisie (ex. mauvais patient, mauvaise dose).
        La vaccination restera visible, barree, jamais modifiee ni supprimee
        (RG-CLI-100).
      </Alert>

      {state.error ? (
        <Alert level="critical" title="Retrait impossible">
          {state.error}
        </Alert>
      ) : null}

      <TextField
        label="Motif du retrait"
        name="motif"
        required
        hint={`Au moins ${LONGUEUR_MIN_MOTIF_RETRAIT} caracteres.`}
      />

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
