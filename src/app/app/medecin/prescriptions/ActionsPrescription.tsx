"use client";

import { useActionState, useState } from "react";
import {
  annulerPrescriptionAction,
  arreterPrescriptionAction,
  type PrescriptionActionState,
} from "@/modules/prescription/actions";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/TextField";

const etatInitial: PrescriptionActionState = { error: null, success: false };

/** Formulaire "motif obligatoire" partage par annuler/arreter (F-PRE-05), meme patron que FormulaireRetraitDocument.tsx. */
function FormulaireMotif({
  prescriptionId,
  action,
  libelleConfirmation,
  libelleEnCours,
  texteAlerte,
  onAnnulerSaisie,
}: {
  prescriptionId: string;
  action: (prevState: PrescriptionActionState, formData: FormData) => Promise<PrescriptionActionState>;
  libelleConfirmation: string;
  libelleEnCours: string;
  texteAlerte: string;
  onAnnulerSaisie: () => void;
}) {
  const [state, formAction, pending] = useActionState(action, etatInitial);

  if (state.success) {
    return <p className="text-[13px] font-semibold text-bon">{libelleConfirmation}</p>;
  }

  return (
    <form
      action={formAction}
      aria-busy={pending}
      className="flex w-full flex-col gap-3 rounded-champ border border-critique bg-critique-clair p-3"
    >
      <input type="hidden" name="prescriptionId" value={prescriptionId} />

      <Alert level="critical" title="Action irreversible">
        {texteAlerte}
      </Alert>

      {state.error ? (
        <Alert level="critical" title="Action impossible">
          {state.error}
        </Alert>
      ) : null}

      <TextField label="Motif" name="motif" required hint="Au moins 10 caracteres." />

      <div className="flex flex-wrap gap-2">
        <Button type="submit" variant="danger" size="sm" disabled={pending}>
          {pending ? libelleEnCours : "Confirmer"}
        </Button>
        <Button type="button" variant="secondary" size="sm" onClick={onAnnulerSaisie} disabled={pending}>
          Annuler la saisie
        </Button>
      </div>
    </form>
  );
}

export interface ActionsPrescriptionProps {
  prescriptionId: string;
  peutEtreAnnulee: boolean;
  peutEtreArretee: boolean;
}

/**
 * Boutons "Annuler"/"Arreter" d'une prescription (F-PRE-05 du pack), reserves
 * au medecin auteur : n'apparaissent que si peutEtreAnnulee/peutEtreArretee
 * le permettent (calcules cote serveur, voir getPrescriptionsDuProfessionnel,
 * jamais decides ici cote client). Les deux partagent le meme formulaire
 * "motif obligatoire", jamais affiches en meme temps.
 */
export function ActionsPrescription({
  prescriptionId,
  peutEtreAnnulee,
  peutEtreArretee,
}: ActionsPrescriptionProps) {
  const [modeOuvert, setModeOuvert] = useState<"annuler" | "arreter" | null>(null);

  if (!peutEtreAnnulee && !peutEtreArretee) {
    return null;
  }

  if (modeOuvert === "annuler") {
    return (
      <FormulaireMotif
        prescriptionId={prescriptionId}
        action={annulerPrescriptionAction}
        libelleConfirmation="Prescription annulée."
        libelleEnCours="Annulation..."
        texteAlerte="Annule entierement cette prescription : le patient ne pourra plus la faire delivrer en pharmacie."
        onAnnulerSaisie={() => setModeOuvert(null)}
      />
    );
  }

  if (modeOuvert === "arreter") {
    return (
      <FormulaireMotif
        prescriptionId={prescriptionId}
        action={arreterPrescriptionAction}
        libelleConfirmation="Délivrance arrêtée."
        libelleEnCours="Arret..."
        texteAlerte="Arrete la delivrance des medicaments restants de cette prescription deja delivree en partie."
        onAnnulerSaisie={() => setModeOuvert(null)}
      />
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      {peutEtreAnnulee ? (
        <Button type="button" variant="ghost" size="sm" onClick={() => setModeOuvert("annuler")}>
          Annuler
        </Button>
      ) : null}
      {peutEtreArretee ? (
        <Button type="button" variant="ghost" size="sm" onClick={() => setModeOuvert("arreter")}>
          Arrêter la délivrance
        </Button>
      ) : null}
    </div>
  );
}
