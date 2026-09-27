"use client";

import { useActionState, useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  approuverActionEnAttenteAction,
  inviterAdministrateurAction,
  reactiverCompteAction,
  refuserActionEnAttenteAction,
  reinitialiserSecondFacteurAction,
  renvoyerInvitationCompteAction,
  suspendreCompteAction,
  type ActionEnAttenteResume,
  type GestionComptesNationaleState,
} from "@/modules/administration/gestion-comptes-nationale";
import { InvitationEnvoyee } from "@/components/InvitationEnvoyee";
import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/TextField";

const etatInitial: GestionComptesNationaleState = { error: null, success: false };

function formaterDate(date: string): string {
  try {
    return new Date(date).toLocaleString("fr-FR", { dateStyle: "long", timeStyle: "short" });
  } catch {
    return date;
  }
}

function ChampMotif({ libelle = "Motif", aide }: { libelle?: string; aide?: string }) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="flex flex-wrap items-baseline gap-1.5 text-[15px] font-semibold text-encre">
        {libelle}
        <span className="text-critique" aria-hidden="true">
          *
        </span>
      </label>
      {aide ? <p className="text-[13px] text-encre-secondaire">{aide}</p> : null}
      <textarea
        id={id}
        name="motif"
        rows={3}
        required
        minLength={10}
        maxLength={500}
        className="w-full resize-y rounded-champ border border-bordure-forte bg-surface px-3 py-2 text-[15px] text-encre transition-colors motion-reduce:transition-none placeholder:text-encre-attenuee focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2"
      />
    </div>
  );
}

type TypeAction = "suspension" | "reactivation" | "reinitialisation_2fa";

const ACTIONS: Record<TypeAction, { action: typeof suspendreCompteAction; bouton: string; variante: "danger" | "primary" | "secondary" }> = {
  suspension: { action: suspendreCompteAction, bouton: "Suspendre le compte", variante: "danger" },
  reactivation: { action: reactiverCompteAction, bouton: "Réactiver le compte", variante: "primary" },
  reinitialisation_2fa: { action: reinitialiserSecondFacteurAction, bouton: "Réinitialiser le second facteur", variante: "danger" },
};

/** Suspendre, reactiver ou reinitialiser le second facteur d'un compte : motif obligatoire, replie par defaut. */
export function FormulaireActionCompte({ userId, type, estAdministrateur }: { userId: string; type: TypeAction; estAdministrateur: boolean }) {
  const router = useRouter();
  const [ouvert, setOuvert] = useState(false);
  const definition = ACTIONS[type];
  const [state, formAction, pending] = useActionState(definition.action, etatInitial);

  useEffect(() => {
    if (state.success) router.refresh();
  }, [state.success, router]);

  if (state.success) {
    return (
      <Alert level="success" title={state.enAttente ? "Demande enregistrée" : "Action effectuée"}>
        {state.enAttente
          ? "Ce compte est un compte d'administrateur : la demande attend la confirmation d'un second administrateur (quatre yeux)."
          : "L'action a été enregistrée dans le journal d'audit."}
      </Alert>
    );
  }

  if (!ouvert) {
    return (
      <Button type="button" variant={definition.variante} size="sm" className="w-fit" onClick={() => setOuvert(true)}>
        {definition.bouton}
      </Button>
    );
  }

  return (
    <form action={formAction} aria-busy={pending} className="flex flex-col gap-3 rounded-champ border border-bordure bg-surface p-3">
      <input type="hidden" name="userId" value={userId} />

      {state.error ? (
        <Alert level="critical" title="Action impossible">
          {state.error}
        </Alert>
      ) : null}

      {estAdministrateur ? (
        <Alert level="info" title="Compte d'administrateur">
          Cette action n&apos;est pas exécutée tout de suite : elle est enregistrée et doit être confirmée par un
          autre administrateur.
        </Alert>
      ) : null}

      <ChampMotif />

      {type === "reinitialisation_2fa" ? (
        <label className="flex items-start gap-2 text-[14px] text-encre">
          <input type="checkbox" name="identiteVerifiee" required className="mt-1 h-4 w-4" />
          <span>J&apos;ai vérifié l&apos;identité de la personne par appel ou en présentiel.</span>
        </label>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button type="submit" variant={definition.variante} size="sm" disabled={pending}>
          {pending ? "Envoi..." : definition.bouton}
        </Button>
        <Button type="button" variant="secondary" size="sm" disabled={pending} onClick={() => setOuvert(false)}>
          Annuler
        </Button>
      </div>
    </form>
  );
}

/** Renvoi de l'invitation d'un compte qui ne l'a pas encore activee (F-AUTH-05) : l'ancienne est annulee. */
export function BoutonRenvoiInvitation({ userId }: { userId: string }) {
  const [state, formAction, pending] = useActionState(renvoyerInvitationCompteAction, etatInitial);

  if (state.success && state.invitationEnvoyeeA) {
    return <InvitationEnvoyee email={state.invitationEnvoyeeA} lien={state.lienInvitation} />;
  }

  return (
    <form action={formAction} aria-busy={pending} className="flex flex-col gap-2">
      <input type="hidden" name="userId" value={userId} />
      {state.error ? (
        <Alert level="critical" title="Renvoi impossible">
          {state.error}
        </Alert>
      ) : null}
      <Button type="submit" variant="secondary" size="sm" className="w-fit" disabled={pending}>
        {pending ? "Envoi..." : "Renvoyer l'invitation"}
      </Button>
    </form>
  );
}

/** Demande d'invitation d'un administrateur national : toujours en attente d'un second administrateur. */
export function FormulaireInvitationAdmin() {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(inviterAdministrateurAction, etatInitial);
  const formulaireRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.success) {
      formulaireRef.current?.reset();
      router.refresh();
    }
  }, [state.success, router]);

  return (
    <form ref={formulaireRef} action={formAction} aria-busy={pending} className="flex flex-col gap-3">
      {state.error ? (
        <Alert level="critical" title="Demande impossible">
          {state.error}
        </Alert>
      ) : null}
      {state.success ? (
        <Alert level="success" title="Demande enregistrée">
          Un autre administrateur doit confirmer l&apos;invitation avant que le compte ne soit créé.
        </Alert>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <TextField label="Prénom" name="prenom" required maxLength={100} />
        <TextField label="Nom" name="nom" required maxLength={100} />
        <TextField label="Adresse e-mail" name="email" type="email" required maxLength={200} />
        <TextField label="Téléphone" name="telephone" type="tel" required maxLength={30} />
      </div>
      <ChampMotif aide="Pourquoi ce nouvel administrateur est nécessaire." />
      <Button type="submit" variant="primary" size="sm" className="w-fit" disabled={pending}>
        {pending ? "Envoi..." : "Demander l'invitation"}
      </Button>
    </form>
  );
}

function LigneDemande({ demande }: { demande: ActionEnAttenteResume }) {
  const router = useRouter();
  const [approbation, actionApprobation, pendingApprobation] = useActionState(approuverActionEnAttenteAction, etatInitial);
  const [refus, actionRefus, pendingRefus] = useActionState(refuserActionEnAttenteAction, etatInitial);
  const [refusOuvert, setRefusOuvert] = useState(false);
  const motifRefusId = useId();

  useEffect(() => {
    if (approbation.success || refus.success) router.refresh();
  }, [approbation.success, refus.success, router]);

  if (approbation.success) {
    return (
      <div className="flex flex-col gap-3">
        <Alert level="success" title="Demande approuvée">
          L&apos;action a été exécutée.
        </Alert>
        {approbation.invitationEnvoyeeA ? (
          <InvitationEnvoyee email={approbation.invitationEnvoyeeA} lien={approbation.lienInvitation} />
        ) : null}
        {approbation.invitationNonEnvoyee ? (
          <Alert level="warning" title="Invitation non envoyée">
            Le compte est créé mais l&apos;e-mail d&apos;invitation n&apos;a pas pu partir. Renvoyez l&apos;invitation depuis la fiche du compte.
          </Alert>
        ) : null}
      </div>
    );
  }
  if (refus.success) {
    return (
      <Alert level="info" title="Demande refusée">
        Rien n&apos;a été exécuté.
      </Alert>
    );
  }

  return (
    <div className="flex flex-col gap-3 border-b border-bordure py-4 last:border-0">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-[15px] font-semibold text-encre">{demande.libelleType}</p>
        {demande.cibleNomComplet ? <Badge tone="neutral">{demande.cibleNomComplet}</Badge> : null}
      </div>
      <p className="text-[13px] text-encre-secondaire">
        Demandée par {demande.estDemandeParMoi ? "vous" : demande.demandePar} le {formaterDate(demande.dateDemande)},
        valable jusqu&apos;au {formaterDate(demande.expireLe)}.
      </p>
      <p className="text-[14px] text-encre">Motif : {demande.motif}</p>

      {approbation.error ? (
        <Alert level="critical" title="Approbation impossible">
          {approbation.error}
        </Alert>
      ) : null}
      {refus.error ? (
        <Alert level="critical" title="Refus impossible">
          {refus.error}
        </Alert>
      ) : null}

      {demande.estDemandeParMoi ? (
        <p className="text-[13px] font-semibold text-vigilance">
          Un autre administrateur doit décider de cette demande (quatre yeux).
        </p>
      ) : (
        <div className="flex flex-wrap items-start gap-2">
          <form action={actionApprobation}>
            <input type="hidden" name="actionId" value={demande.id} />
            <Button type="submit" variant="primary" size="sm" disabled={pendingApprobation || pendingRefus}>
              {pendingApprobation ? "Exécution..." : "Approuver"}
            </Button>
          </form>

          {refusOuvert ? (
            <form action={actionRefus} className="flex flex-col gap-2 rounded-champ border border-critique bg-critique-clair p-3">
              <input type="hidden" name="actionId" value={demande.id} />
              <label htmlFor={motifRefusId} className="text-[14px] font-semibold text-encre">
                Motif du refus
              </label>
              <input
                id={motifRefusId}
                name="motif"
                required
                minLength={5}
                maxLength={500}
                className="h-11 w-72 max-w-full rounded-champ border border-bordure-forte bg-surface px-3 text-[15px] text-encre"
              />
              <div className="flex gap-2">
                <Button type="submit" variant="danger" size="sm" disabled={pendingRefus}>
                  {pendingRefus ? "Envoi..." : "Confirmer le refus"}
                </Button>
                <Button type="button" variant="secondary" size="sm" onClick={() => setRefusOuvert(false)}>
                  Annuler
                </Button>
              </div>
            </form>
          ) : (
            <Button type="button" variant="danger" size="sm" onClick={() => setRefusOuvert(true)}>
              Refuser
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

/** Demandes en attente de confirmation par un second administrateur (RG-ADM-30). */
export function ListeActionsEnAttente({ demandes }: { demandes: ActionEnAttenteResume[] }) {
  if (demandes.length === 0) {
    return <p className="text-[14px] text-encre-secondaire">Aucune demande en attente.</p>;
  }
  return (
    <div className="flex flex-col">
      {demandes.map((demande) => (
        <LigneDemande key={demande.id} demande={demande} />
      ))}
    </div>
  );
}
