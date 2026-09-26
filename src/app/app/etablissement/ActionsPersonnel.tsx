"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import {
  suspendrePersonnelAction,
  reactiverPersonnelAction,
  terminerAffiliationAction,
  type GestionPersonnelActionState,
} from "@/modules/facility/gestion-personnel";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";

const etatInitial: GestionPersonnelActionState = { error: null, success: false };

/** Formulaire avec motif obligatoire (suspendre / terminer), replie par defaut. */
function ActionAvecMotif({
  userId,
  action,
  libelleBouton,
  libelleConfirmation,
  variant,
}: {
  userId: string;
  action: (prevState: GestionPersonnelActionState, formData: FormData) => Promise<GestionPersonnelActionState>;
  libelleBouton: string;
  libelleConfirmation: string;
  variant: "secondary" | "danger";
}) {
  const [state, formAction, pending] = useActionState(action, etatInitial);
  const [ouvert, setOuvert] = useState(false);
  const router = useRouter();

  useEffect(() => {
    if (state.success) {
      router.refresh();
    }
  }, [state.success, router]);

  if (state.success) {
    return <span className="text-[12px] font-semibold text-bon">Effectué.</span>;
  }

  if (!ouvert) {
    return (
      <Button type="button" variant={variant} size="sm" onClick={() => setOuvert(true)}>
        {libelleBouton}
      </Button>
    );
  }

  return (
    <form action={formAction} className="flex min-w-[220px] flex-col gap-2 rounded-champ border border-bordure bg-plan p-2">
      <input type="hidden" name="userId" value={userId} />
      {state.error ? (
        <Alert level="critical" title="Action impossible">
          {state.error}
        </Alert>
      ) : null}
      <p className="text-[12px] font-semibold text-encre">{libelleConfirmation}</p>
      <textarea
        name="motif"
        required
        minLength={10}
        rows={2}
        placeholder="Motif (au moins 10 caractères)..."
        className="w-full resize-y rounded-champ border border-bordure-forte bg-surface px-2 py-1.5 text-[12px] text-encre"
      />
      <div className="flex gap-2">
        <Button type="submit" variant={variant} size="sm" disabled={pending}>
          {pending ? "..." : "Confirmer"}
        </Button>
        <Button type="button" variant="secondary" size="sm" onClick={() => setOuvert(false)}>
          Annuler
        </Button>
      </div>
    </form>
  );
}

/** Actions sur un membre du personnel (F-ETA-04) : suspendre, réactiver, terminer l'affiliation, selon le statut actuel du compte. */
export function ActionsPersonnel({ userId, statutCompte }: { userId: string; statutCompte: string }) {
  const [stateReactivation, formActionReactivation, pendingReactivation] = useActionState(
    reactiverPersonnelAction,
    etatInitial
  );
  const router = useRouter();

  useEffect(() => {
    if (stateReactivation.success) {
      router.refresh();
    }
  }, [stateReactivation.success, router]);

  if (statutCompte === "termine") {
    return <span className="text-[12px] text-encre-attenuee">Affiliation terminée</span>;
  }

  if (statutCompte === "suspendu") {
    return (
      <div className="flex flex-wrap gap-2">
        {stateReactivation.success ? (
          <span className="text-[12px] font-semibold text-bon">Réactivé.</span>
        ) : (
          <form action={formActionReactivation}>
            <input type="hidden" name="userId" value={userId} />
            <Button type="submit" variant="secondary" size="sm" disabled={pendingReactivation}>
              {pendingReactivation ? "..." : "Réactiver"}
            </Button>
          </form>
        )}
        <ActionAvecMotif
          userId={userId}
          action={terminerAffiliationAction}
          libelleBouton="Terminer l'affiliation"
          libelleConfirmation="Terminer définitivement l'affiliation de ce membre ?"
          variant="danger"
        />
      </div>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      <ActionAvecMotif
        userId={userId}
        action={suspendrePersonnelAction}
        libelleBouton="Suspendre"
        libelleConfirmation="Suspendre l'accès de ce membre ?"
        variant="secondary"
      />
      <ActionAvecMotif
        userId={userId}
        action={terminerAffiliationAction}
        libelleBouton="Terminer l'affiliation"
        libelleConfirmation="Terminer définitivement l'affiliation de ce membre ?"
        variant="danger"
      />
    </div>
  );
}
