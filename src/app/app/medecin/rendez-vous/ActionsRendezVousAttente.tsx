"use client";

import { useActionState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  annulerRendezVousProfessionnelAction,
  confirmerRendezVousAction,
  type FacilityActionState,
} from "@/modules/facility/actions";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Modal, type ModalHandle } from "@/components/ui/Modal";

const etatInitial: FacilityActionState = { error: null, success: false };

export interface ActionsRendezVousAttenteProps {
  rendezVousId: string;
  patientNomComplet: string | null;
}

/**
 * Actions disponibles sur un rendez-vous "demande" (en attente de
 * confirmation) cote professionnel : confirmer (formulaire simple) ou
 * annuler (confirmation via Modal avant soumission, meme schema que le
 * retrait de consentement en Phase 3).
 */
export function ActionsRendezVousAttente({
  rendezVousId,
  patientNomComplet,
}: ActionsRendezVousAttenteProps) {
  const [confirmState, confirmFormAction, confirmPending] = useActionState(
    confirmerRendezVousAction,
    etatInitial
  );
  const [annulerState, annulerFormAction, annulerPending] = useActionState(
    annulerRendezVousProfessionnelAction,
    etatInitial
  );
  const modalRef = useRef<ModalHandle>(null);
  const router = useRouter();

  useEffect(() => {
    if (confirmState.success) {
      router.refresh();
    }
  }, [confirmState.success, router]);

  useEffect(() => {
    if (annulerState.success) {
      modalRef.current?.close();
      router.refresh();
    }
  }, [annulerState.success, router]);

  return (
    <div className="flex flex-col gap-3">
      {confirmState.error ? (
        <Alert level="critical" title="Confirmation impossible">
          {confirmState.error}
        </Alert>
      ) : null}
      {annulerState.error ? (
        <Alert level="critical" title="Annulation impossible">
          {annulerState.error}
        </Alert>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <form action={confirmFormAction}>
          <input type="hidden" name="rendezVousId" value={rendezVousId} />
          <Button type="submit" variant="primary" size="sm" disabled={confirmPending}>
            {confirmPending ? "Confirmation..." : "Confirmer"}
          </Button>
        </form>
        <Button
          type="button"
          variant="danger"
          size="sm"
          onClick={() => modalRef.current?.showModal()}
        >
          Annuler
        </Button>
      </div>

      <Modal
        ref={modalRef}
        title="Annuler ce rendez-vous ?"
        description={
          patientNomComplet
            ? `La demande de rendez-vous de ${patientNomComplet} sera annulee. Cette action est immediate.`
            : "Cette demande de rendez-vous sera annulee. Cette action est immediate."
        }
      >
        <form action={annulerFormAction} className="flex flex-col gap-4">
          <input type="hidden" name="rendezVousId" value={rendezVousId} />
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => modalRef.current?.close()}
            >
              Retour
            </Button>
            <Button type="submit" variant="danger" disabled={annulerPending}>
              {annulerPending ? "Annulation en cours..." : "Confirmer l'annulation"}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
