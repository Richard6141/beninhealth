"use client";

import { useState } from "react";
import { useActionState } from "react";
import {
  demanderRectificationAction,
  fermerMonCompteAction,
  verifierMotDePasseExportAction,
} from "@/modules/patient/droits-donnees";
import type { PatientActionState } from "@/modules/patient/actions";
import type { ExportDonneesActionState } from "@/modules/patient/droits-donnees";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { TextField } from "@/components/ui/TextField";

const etatInitial: PatientActionState = { error: null, success: false };

const styleLienTelechargement =
  "inline-flex h-11 items-center justify-center gap-2 rounded-champ border border-bordure-forte bg-surface px-4 text-[14px] font-semibold text-encre transition-colors motion-reduce:transition-none hover:bg-surface-appui focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2";

/**
 * Section "Obtenir une copie de mes données" (F-CIT-13, type 1). La
 * verification du mot de passe (verifierMotDePasseExportAction) delivre un
 * jeton signe de 5 minutes, joint aux deux liens de telechargement : les
 * routes /api/patient/export/* le exigent en plus de la session.
 *
 * RG-AUTH-53 : si une re-authentification recente existe deja (moins de 5
 * minutes, pour n'importe quel acte sensible, ex. une signature
 * d'ordonnance), le formulaire est remplace par un simple bouton (aucun
 * champ a soumettre). Sinon, mot de passe obligatoire et code MFA en plus si
 * actif sur ce compte.
 */
function SectionExportDonnees({
  reauthentificationRecente,
  mfaActif,
}: {
  reauthentificationRecente: boolean;
  mfaActif: boolean;
}) {
  const [state, formAction, pending] = useActionState<ExportDonneesActionState, FormData>(
    verifierMotDePasseExportAction,
    etatInitial
  );

  return (
    <Card
      title="Obtenir une copie de mes données"
      description="Téléchargez l'ensemble de vos données personnelles au format PDF et JSON, après confirmation de votre mot de passe."
    >
      {state.success && state.jeton ? (
        <div className="flex flex-col gap-3">
          <Alert level="success" title="Identité confirmée">
            Vos fichiers sont prêts. Chaque lien régénère une copie à jour de vos données au moment du
            téléchargement et reste valable 5 minutes.
          </Alert>
          <div className="flex flex-wrap gap-3">
            <a
              href={`/api/patient/export/pdf?jeton=${encodeURIComponent(state.jeton)}`}
              className={styleLienTelechargement}
            >
              Télécharger (PDF)
            </a>
            <a
              href={`/api/patient/export/json?jeton=${encodeURIComponent(state.jeton)}`}
              className={styleLienTelechargement}
            >
              Télécharger (JSON)
            </a>
          </div>
        </div>
      ) : (
        <form action={formAction} className="flex flex-col gap-4">
          {state.error ? (
            <Alert level="critical" title="Confirmation impossible">
              {state.error}
            </Alert>
          ) : null}
          {reauthentificationRecente ? (
            <p className="text-[13px] text-encre-attenuee">
              Ré-authentification déjà effectuée il y a moins de 5 minutes (RG-AUTH-53), mot de passe
              non redemandé.
            </p>
          ) : (
            <>
              <TextField
                label="Mot de passe actuel"
                name="motDePasse"
                type="password"
                autoComplete="current-password"
                required
              />
              {mfaActif ? (
                <TextField
                  label="Code de double authentification"
                  name="codeMfa"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  required
                  hint="Code de votre application d'authentification, ou un code de secours."
                />
              ) : null}
            </>
          )}
          <Button type="submit" variant="primary" className="w-fit" disabled={pending}>
            {pending ? "Vérification..." : "Confirmer et préparer ma copie"}
          </Button>
        </form>
      )}
    </Card>
  );
}

const LONGUEUR_MIN_DESCRIPTION = 20;

/** Section "Signaler une information à corriger" (F-CIT-13, type 2). */
function SectionRectification() {
  const [state, formAction, pending] = useActionState(demanderRectificationAction, etatInitial);
  const [description, setDescription] = useState("");

  if (state.success) {
    return (
      <Card title="Signaler une information à corriger">
        <Alert level="success" title="Demande envoyée">
          Votre demande a bien été transmise au ministère de la Santé pour examen.
        </Alert>
      </Card>
    );
  }

  return (
    <Card
      title="Signaler une information à corriger"
      description="Décrivez l'information de votre dossier que vous estimez incorrecte ; votre demande sera transmise pour examen."
    >
      <form action={formAction} className="flex flex-col gap-4">
        {state.error ? (
          <Alert level="critical" title="Envoi impossible">
            {state.error}
          </Alert>
        ) : null}
        <div className="flex flex-col gap-1.5">
          <label htmlFor="description-rectification" className="text-[18px] font-semibold text-encre">
            Description <span className="text-critique" aria-hidden="true">*</span>
          </label>
          <textarea
            id="description-rectification"
            name="description"
            rows={4}
            required
            minLength={LONGUEUR_MIN_DESCRIPTION}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Ex. mon groupe sanguin affiché est incorrect, il devrait être O+."
            className="w-full resize-y rounded-champ border border-bordure-forte bg-surface px-3 py-2 text-[16px] text-encre transition-colors motion-reduce:transition-none placeholder:text-encre-attenuee focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2"
          />
        </div>
        <Button
          type="submit"
          variant="primary"
          className="w-fit"
          disabled={pending || description.trim().length < LONGUEUR_MIN_DESCRIPTION}
        >
          {pending ? "Envoi..." : "Envoyer ma demande"}
        </Button>
      </form>
    </Card>
  );
}

/**
 * Section "Fermer mon compte" (F-CIT-13, type 3). RG-CIT-110 : le dossier
 * medical est conserve, seul l'acces par compte est desactive
 * (fermerMonCompteAction). Redirige vers /connexion en cas de succes (la
 * session est detruite cote serveur avant le redirect).
 */
function SectionFermetureCompte() {
  const [confirmation, setConfirmation] = useState(false);
  const [state, formAction, pending] = useActionState(fermerMonCompteAction, etatInitial);

  return (
    <Card
      title="Fermer mon compte"
      description="Votre dossier médical sera conservé, mais vous ne pourrez plus vous connecter avec ce compte."
    >
      {!confirmation ? (
        <Button variant="danger" className="w-fit" onClick={() => setConfirmation(true)}>
          Fermer mon compte
        </Button>
      ) : (
        <form action={formAction} className="flex flex-col gap-4">
          {state.error ? (
            <Alert level="critical" title="Fermeture impossible">
              {state.error}
            </Alert>
          ) : null}
          <Alert level="warning" title="Action irréversible depuis cet écran">
            Vous serez déconnecté(e) immédiatement et ne pourrez plus vous reconnecter avec ce
            compte. Votre dossier médical reste conservé et consultable par un professionnel de
            santé que vous avez autorisé.
          </Alert>
          <TextField
            label="Mot de passe actuel"
            name="motDePasse"
            type="password"
            autoComplete="current-password"
            required
          />
          <div className="flex gap-3">
            <Button type="submit" variant="danger" disabled={pending}>
              {pending ? "Fermeture..." : "Confirmer la fermeture"}
            </Button>
            <Button type="button" variant="secondary" onClick={() => setConfirmation(false)}>
              Annuler
            </Button>
          </div>
        </form>
      )}
    </Card>
  );
}

export interface GestionDroitsDonneesProps {
  /** RG-AUTH-53 : statut de re-authentification pour SectionExportDonnees (null si indisponible, traite comme "tout redemander"). */
  statutReauthentificationExport: { reauthentificationRecente: boolean; mfaActif: boolean } | null;
}

export function GestionDroitsDonnees({ statutReauthentificationExport }: GestionDroitsDonneesProps) {
  return (
    <div className="flex flex-col gap-6">
      <SectionExportDonnees
        reauthentificationRecente={statutReauthentificationExport?.reauthentificationRecente ?? false}
        mfaActif={statutReauthentificationExport?.mfaActif ?? false}
      />
      <SectionRectification />
      <SectionFermetureCompte />
    </div>
  );
}
