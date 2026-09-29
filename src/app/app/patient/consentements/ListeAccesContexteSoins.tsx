"use client";

import { useActionState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  terminerAccesContexteSoinsAction,
  type AccesContexteSoins,
  type PatientActionState,
} from "@/modules/patient/actions";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Modal, type ModalHandle } from "@/components/ui/Modal";

const etatInitial: PatientActionState = { error: null, success: false };

function formaterDateHeure(date: string): string {
  try {
    return new Date(date).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" });
  } catch {
    return date;
  }
}

function LigneAcces({ acces }: { acces: AccesContexteSoins }) {
  const [state, formAction, pending] = useActionState(terminerAccesContexteSoinsAction, etatInitial);
  const modalRef = useRef<ModalHandle>(null);
  const router = useRouter();

  useEffect(() => {
    if (state.success) {
      modalRef.current?.close();
      router.refresh();
    }
  }, [state.success, router]);

  return (
    <div className="flex flex-col gap-2 rounded-champ border border-bordure bg-plan p-3">
      <p className="text-[13px] text-encre">
        L&apos;équipe de <span className="font-semibold">{acces.etablissementNom}</span> peut voir
        votre résumé jusqu&apos;au {formaterDateHeure(acces.expireLe)} (lié à votre visite).
      </p>

      {state.error ? (
        <Alert level="critical" title="Impossible de mettre fin à cet accès">
          {state.error}
        </Alert>
      ) : null}

      <Button
        type="button"
        variant="secondary"
        size="sm"
        className="w-fit"
        onClick={() => modalRef.current?.showModal()}
      >
        Mettre fin
      </Button>
      <Modal
        ref={modalRef}
        title="Mettre fin à cet accès ?"
        description={`L'équipe de ${acces.etablissementNom} ne pourra plus consulter votre résumé au titre de cette visite.`}
      >
        <form action={formAction} className="flex flex-col gap-4">
          <input type="hidden" name="rendezVousId" value={acces.rendezVousId} />
          <p className="text-[14px] text-encre-secondaire">
            Cette action est définitive pour cette visite. Un médecin déjà en train de vous examiner
            peut toujours terminer la consultation en cours.
          </p>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => modalRef.current?.close()}>
              Annuler
            </Button>
            <Button type="submit" variant="danger" disabled={pending}>
              {pending ? "En cours..." : "Confirmer"}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

/**
 * RG-CIT-81 du pack : les accès "contexte de soins" (base B4, ouverts par
 * l'arrivée du patient dans un établissement, fenêtre de 72h,
 * clinical/actions.ts) DOIVENT être affichés au patient, distincts des
 * consentements explicites (ListeConsentements.tsx), avec un bouton
 * "Mettre fin". Rien n'est affiché si aucun accès de ce type n'est ouvert.
 */
export function ListeAccesContexteSoins({ acces }: { acces: AccesContexteSoins[] }) {
  if (acces.length === 0) {
    return null;
  }

  return (
    <Card
      title="Accès liés à votre visite"
      description="Ouverts automatiquement pendant 72 heures après votre arrivée dans un établissement, pour que l'équipe qui vous reçoit puisse consulter votre résumé."
    >
      <div className="flex flex-col gap-3">
        {acces.map((item) => (
          <LigneAcces key={item.rendezVousId} acces={item} />
        ))}
      </div>
    </Card>
  );
}
