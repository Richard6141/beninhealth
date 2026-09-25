"use client";

import { useActionState, useState } from "react";
import { annulerExamenAction, type LaboratoireActionState } from "@/modules/laboratoire/actions";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";

const etatInitial: LaboratoireActionState = { error: null, success: false };

/**
 * Bouton "Annuler cette demande" (F-LAB-06 du pack), reserve au medecin
 * demandeur, disponible tant qu'aucun resultat n'existe encore. Confirmation
 * a deux temps (pas de Modal ici, une simple carte parmi d'autres) avant
 * l'envoi, puisque l'annulation est irreversible a l'ecran.
 */
export function BoutonAnnulerExamen({ examenId }: { examenId: string }) {
  const [state, formAction, pending] = useActionState(annulerExamenAction, etatInitial);
  const [confirmation, setConfirmation] = useState(false);

  if (state.success) {
    return <p className="text-[13px] font-semibold text-critique">Demande annulee.</p>;
  }

  if (!confirmation) {
    return (
      <Button
        type="button"
        variant="danger"
        size="sm"
        className="w-fit"
        onClick={() => setConfirmation(true)}
      >
        Annuler cette demande
      </Button>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-2 rounded-champ border border-critique bg-critique-clair p-3">
      {state.error ? (
        <Alert level="critical" title="Annulation impossible">
          {state.error}
        </Alert>
      ) : null}
      <input type="hidden" name="examenId" value={examenId} />
      <p className="text-[13px] font-semibold text-critique">
        Annuler définitivement cette demande d&apos;examen ?
      </p>
      <div className="flex gap-2">
        <Button type="submit" variant="danger" size="sm" disabled={pending}>
          {pending ? "Annulation..." : "Oui, annuler"}
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={pending}
          onClick={() => setConfirmation(false)}
        >
          Non
        </Button>
      </div>
    </form>
  );
}
