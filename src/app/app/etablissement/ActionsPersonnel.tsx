"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import {
  suspendrePersonnelAction,
  reactiverPersonnelAction,
  renseignerNumeroOrdreAction,
  terminerAffiliationAction,
  type GestionPersonnelActionState,
} from "@/modules/facility/gestion-personnel";
import { renvoyerInvitationAction, type GestionCompteActionState } from "@/modules/identity/gestion-comptes";
import { Alert } from "@/components/ui/Alert";
import { InvitationEnvoyee } from "@/components/InvitationEnvoyee";
import { Button } from "@/components/ui/Button";

const etatInitial: GestionPersonnelActionState = { error: null, success: false };
const etatInitialInvitation: GestionCompteActionState = { error: null, success: false };

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

/** Renseigner ou corriger le numero d'inscription a l'Ordre (reponse a une demande de complement du ministere, F-ADM-03). */
function ActionNumeroOrdre({ userId, numeroOrdre }: { userId: string; numeroOrdre: string | null }) {
  const [state, formAction, pending] = useActionState(renseignerNumeroOrdreAction, etatInitial);
  const [ouvert, setOuvert] = useState(false);
  const router = useRouter();

  useEffect(() => {
    if (state.success) {
      router.refresh();
    }
  }, [state.success, router]);

  if (state.success) {
    return <span className="text-[12px] font-semibold text-bon">Enregistré, à vérifier par le ministère.</span>;
  }

  if (!ouvert) {
    return (
      <Button type="button" variant="secondary" size="sm" onClick={() => setOuvert(true)}>
        {numeroOrdre ? "Corriger le n° d'Ordre" : "Renseigner le n° d'Ordre"}
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
      <label className="text-[12px] font-semibold text-encre" htmlFor={`numero-ordre-${userId}`}>
        Numéro d&apos;inscription à l&apos;Ordre
      </label>
      <input
        id={`numero-ordre-${userId}`}
        name="numeroOrdre"
        required
        maxLength={40}
        defaultValue={numeroOrdre ?? ""}
        className="w-full rounded-champ border border-bordure-forte bg-surface px-2 py-1.5 text-[12px] text-encre"
      />
      <div className="flex gap-2">
        <Button type="submit" variant="primary" size="sm" disabled={pending}>
          {pending ? "..." : "Enregistrer"}
        </Button>
        <Button type="button" variant="secondary" size="sm" onClick={() => setOuvert(false)}>
          Annuler
        </Button>
      </div>
    </form>
  );
}

/** Compte invite qui n'a pas encore active son compte (F-AUTH-05) : renvoyer l'invitation (l'ancienne est annulee). */
function ActionInvitation({ userId }: { userId: string }) {
  const [state, formAction, pending] = useActionState(renvoyerInvitationAction, etatInitialInvitation);

  if (state.success) {
    return <InvitationEnvoyee email={state.invitationEnvoyeeA ?? ""} lien={state.lienInvitation} />;
  }

  return (
    <form action={formAction} className="flex flex-col gap-1">
      <input type="hidden" name="userId" value={userId} />
      {state.error ? (
        <p role="alert" className="max-w-[220px] text-[12px] text-critique">
          {state.error}
        </p>
      ) : null}
      <Button type="submit" variant="secondary" size="sm" disabled={pending}>
        {pending ? "Envoi..." : "Renvoyer l'invitation"}
      </Button>
    </form>
  );
}

/** Actions sur un membre du personnel (F-ETA-04) : suspendre, réactiver, terminer l'affiliation, renseigner le n° d'Ordre, selon le statut actuel du compte. */
export function ActionsPersonnel({
  userId,
  statutCompte,
  statutValidation,
  numeroOrdre,
}: {
  userId: string;
  statutCompte: string;
  statutValidation: string;
  numeroOrdre: string | null;
}) {
  const refuseParLeMinistere = statutValidation === "rejete";
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

  if (statutCompte === "invite") {
    return <ActionInvitation userId={userId} />;
  }

  if (statutCompte === "suspendu") {
    return (
      <div className="flex flex-wrap gap-2">
        {refuseParLeMinistere ? (
          <span className="text-[12px] text-encre-attenuee">Rétablissement par le ministère uniquement</span>
        ) : stateReactivation.success ? (
          <span className="text-[12px] font-semibold text-bon">Réactivé.</span>
        ) : (
          <form action={formActionReactivation} className="flex flex-col gap-1">
            <input type="hidden" name="userId" value={userId} />
            {stateReactivation.error ? (
              <p role="alert" className="max-w-[220px] text-[12px] text-critique">
                {stateReactivation.error}
              </p>
            ) : null}
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
      {refuseParLeMinistere ? null : <ActionNumeroOrdre userId={userId} numeroOrdre={numeroOrdre} />}
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
