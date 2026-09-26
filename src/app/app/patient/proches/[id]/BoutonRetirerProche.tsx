"use client";

import { useActionState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { retirerProcheAction, type ProcheActionState } from "@/modules/proches/actions";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Modal, type ModalHandle } from "@/components/ui/Modal";

const etatInitial: ProcheActionState = { error: null, success: false };

export function BoutonRetirerProche({ procheId, prenom }: { procheId: string; prenom: string }) {
  const [state, formAction, pending] = useActionState(retirerProcheAction, etatInitial);
  const modalRef = useRef<ModalHandle>(null);
  const router = useRouter();

  useEffect(() => {
    if (state.success) {
      modalRef.current?.close();
      router.push("/app/patient/proches");
      router.refresh();
    }
  }, [state.success, router]);

  return (
    <>
      <Button type="button" variant="danger" size="sm" onClick={() => modalRef.current?.showModal()}>
        Fin de gestion
      </Button>
      <Modal
        ref={modalRef}
        title="Mettre fin à la gestion de ce dossier ?"
        description={`Vous ne pourrez plus consulter le dossier de ${prenom} ni prendre de rendez-vous en son nom. Le dossier lui-même n'est jamais supprimé.`}
      >
        <form action={formAction} className="flex flex-col gap-4">
          <input type="hidden" name="procheId" value={procheId} />
          {state.error ? (
            <Alert level="critical" title="Action impossible">
              {state.error}
            </Alert>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => modalRef.current?.close()}>
              Annuler
            </Button>
            <Button type="submit" variant="danger" disabled={pending}>
              {pending ? "Confirmation en cours..." : "Confirmer"}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
