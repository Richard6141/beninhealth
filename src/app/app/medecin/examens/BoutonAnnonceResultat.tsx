"use client";

import { useActionState } from "react";
import { annoncerResultatExamenAction, type LaboratoireActionState } from "@/modules/laboratoire/actions";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";

const etatInitial: LaboratoireActionState = { error: null, success: false };

/**
 * Bouton "Marquer comme annonce au patient" (F-LAB-05 du pack) : le resultat
 * d'un examen sensible reste masque au patient (voir getMesExamens) tant que
 * le medecin demandeur n'a pas explicitement confirme l'avoir communique de
 * vive voix. Une fois annonce, l'action est irreversible a l'ecran (pas de
 * bouton "annuler l'annonce"), a l'image du reste du dossier clinique.
 */
export function BoutonAnnonceResultat({ examenId }: { examenId: string }) {
  const [state, formAction, pending] = useActionState(annoncerResultatExamenAction, etatInitial);

  if (state.success) {
    return (
      <p className="text-[13px] font-semibold text-bon">Resultat annonce au patient.</p>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="examenId" value={examenId} />
      {state.error ? <Alert level="critical" title="Annonce impossible">{state.error}</Alert> : null}
      <Button type="submit" variant="secondary" className="w-fit" disabled={pending}>
        {pending ? "Enregistrement..." : "Marquer comme annonce au patient"}
      </Button>
    </form>
  );
}
