"use client";

import { useActionState, useRef, useState } from "react";
import {
  libererExamenAction,
  type ExamenResume,
  type LaboratoireActionState,
} from "@/modules/laboratoire/actions";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Modal, type ModalHandle } from "@/components/ui/Modal";
import { TextField } from "@/components/ui/TextField";

const etatInitial: LaboratoireActionState = { error: null, success: false };

function ContenuLiberation({ examen, onFermer }: { examen: ExamenResume; onFermer: () => void }) {
  const [state, formAction, pending] = useActionState(libererExamenAction, etatInitial);

  if (state.success) {
    return (
      <div className="flex flex-col gap-4">
        <Alert level="success" title="Demande libérée">
          Le patient et le médecin demandeur ont été prévenus qu&apos;une nouvelle demande, auprès
          d&apos;un autre laboratoire, est nécessaire.
        </Alert>
        <Button type="button" variant="secondary" className="w-fit" onClick={onFermer}>
          Fermer
        </Button>
      </div>
    );
  }

  return (
    <form action={formAction} aria-busy={pending} className="flex flex-col gap-5">
      <input type="hidden" name="examenId" value={examen.id} />

      {state.error ? (
        <Alert level="critical" title="Libération impossible">
          {state.error}
        </Alert>
      ) : null}

      <p className="text-[13px] text-encre-secondaire">
        À utiliser seulement si cette demande a été prise par erreur : le patient devra la refaire
        auprès d&apos;un autre laboratoire.
      </p>

      <TextField
        label="Motif de la libération"
        name="motif"
        required
        minLength={5}
        maxLength={300}
        hint="Le patient et le médecin demandeur en sont prévenus."
      />

      <Button type="submit" variant="danger" className="w-fit" disabled={pending}>
        {pending ? "Libération..." : "Libérer cette demande"}
      </Button>
    </form>
  );
}

/**
 * Bouton "Libérer cette demande" (F-LAB-06 du pack, second volet), réservé
 * au laboratoire, disponible seulement tant qu'aucun prélèvement n'a eu
 * lieu (statut "demande" strictement) : voir la docstring de
 * libererExamenAction (src/modules/laboratoire/actions.ts) pour la limite
 * assumée (pas de réassignation à un autre laboratoire dans ce dépôt).
 * Même patron que FormulairePrelevement (bouton + modale) plutôt que le
 * confirm-en-place de BoutonAnnulerExamen (médecin) : ce bouton partage déjà
 * la cellule d'actions d'un tableau dense, une modale évite un clic
 * accidentel.
 */
export function BoutonLibererExamen({ examen }: { examen: ExamenResume }) {
  const modalRef = useRef<ModalHandle>(null);
  const [cle, setCle] = useState(0);

  if (examen.statut !== "demande") {
    return null;
  }

  return (
    <>
      <Button
        type="button"
        variant="danger"
        className="w-fit"
        onClick={() => modalRef.current?.showModal()}
      >
        Libérer cette demande
      </Button>
      <Modal
        ref={modalRef}
        title="Libérer cette demande"
        description={examen.typeExamen}
        onClose={() => setCle((valeur) => valeur + 1)}
      >
        <ContenuLiberation key={cle} examen={examen} onFermer={() => modalRef.current?.close()} />
      </Modal>
    </>
  );
}
