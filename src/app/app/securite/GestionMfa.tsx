"use client";

import { useState, useActionState } from "react";
import { useRouter } from "next/navigation";
import {
  demarrerEnrolementMfa,
  activerMfaAction,
  desactiverMfaAction,
  regenererCodesSecoursAction,
  type EnrolementMfa,
} from "@/modules/identity/mfa";
import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/TextField";

/**
 * Gestion de la double authentification (F-AUTH-06) : activation (QR code puis
 * code de confirmation, puis dix codes de secours affiches une seule fois),
 * desactivation reservee au patient, renouvellement des codes de secours. Le
 * secret et le QR code d'enrolement ne sont jamais sauvegardes tant que le code
 * de confirmation n'a pas ete valide (voir demarrerEnrolementMfa/activerMfaAction).
 */
export function GestionMfa({
  actif,
  obligatoire,
  codesSecoursRestants,
  destinationApresActivation,
}: {
  actif: boolean;
  obligatoire: boolean;
  codesSecoursRestants: number;
  /** Page a ouvrir une fois les codes de secours conserves (ecran d'activation obligatoire). */
  destinationApresActivation?: string;
}) {
  const router = useRouter();
  const [enrolement, setEnrolement] = useState<EnrolementMfa | null>(null);
  const [chargementEnrolement, setChargementEnrolement] = useState(false);
  const [afficherDesactivation, setAfficherDesactivation] = useState(false);
  const [afficherRenouvellement, setAfficherRenouvellement] = useState(false);
  const [codesAffiches, setCodesAffiches] = useState<string[] | null>(null);
  const [codesConserves, setCodesConserves] = useState(false);

  const [activationState, activationFormAction, activationPending] = useActionState(
    activerMfaAction,
    { error: null, success: false }
  );
  const [desactivationState, desactivationFormAction, desactivationPending] = useActionState(
    desactiverMfaAction,
    { error: null, success: false }
  );
  const [renouvellementState, renouvellementFormAction, renouvellementPending] = useActionState(
    regenererCodesSecoursAction,
    { error: null, success: false }
  );

  // Ajustements d'etat pendant le rendu (comparaison avec l'etat precedent)
  // plutot que des setState dans un effet, meme pattern que
  // FormulaireNouveauRendezVous.tsx.
  const [activationPrecedent, setActivationPrecedent] = useState(activationState);
  if (activationState !== activationPrecedent) {
    setActivationPrecedent(activationState);
    if (activationState.success && activationState.codesSecours) {
      setEnrolement(null);
      setCodesAffiches(activationState.codesSecours);
      setCodesConserves(false);
    }
  }

  const [renouvellementPrecedent, setRenouvellementPrecedent] = useState(renouvellementState);
  if (renouvellementState !== renouvellementPrecedent) {
    setRenouvellementPrecedent(renouvellementState);
    if (renouvellementState.success && renouvellementState.codesSecours) {
      setAfficherRenouvellement(false);
      setCodesAffiches(renouvellementState.codesSecours);
      setCodesConserves(false);
    }
  }

  const [desactivationPrecedent, setDesactivationPrecedent] = useState(desactivationState);
  if (desactivationState !== desactivationPrecedent) {
    setDesactivationPrecedent(desactivationState);
    if (desactivationState.success) {
      setAfficherDesactivation(false);
      router.refresh();
    }
  }

  async function commencerActivation() {
    setChargementEnrolement(true);
    const resultat = await demarrerEnrolementMfa();
    setEnrolement(resultat);
    setChargementEnrolement(false);
  }

  function telechargerCodes(codes: string[]) {
    const contenu = [
      "Codes de secours, Benin Health Intelligence Platform",
      "Chaque code ne sert qu'une seule fois. Conservez cette feuille en lieu sur.",
      "",
      ...codes,
      "",
    ].join("\n");
    const lien = document.createElement("a");
    lien.href = URL.createObjectURL(new Blob([contenu], { type: "text/plain" }));
    lien.download = "codes-de-secours-bhip.txt";
    lien.click();
    URL.revokeObjectURL(lien.href);
  }

  function terminer() {
    setCodesAffiches(null);
    if (destinationApresActivation) {
      router.push(destinationApresActivation);
    }
    router.refresh();
  }

  if (codesAffiches) {
    return (
      <div className="flex flex-col gap-4">
        <Alert level="warning" title="Conservez ces codes de secours maintenant">
          Ils ne seront plus jamais affichés. Chaque code ne sert qu&apos;une seule fois, si vous perdez
          l&apos;accès à votre application d&apos;authentification.
        </Alert>
        <ul className="chiffres grid grid-cols-2 gap-2 rounded-champ border border-bordure bg-plan p-4 text-[16px] font-semibold text-encre sm:grid-cols-5">
          {codesAffiches.map((code) => (
            <li key={code}>{code}</li>
          ))}
        </ul>
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" variant="secondary" onClick={() => telechargerCodes(codesAffiches)}>
            Télécharger les codes
          </Button>
          <Button type="button" variant="secondary" onClick={() => window.print()}>
            Imprimer
          </Button>
        </div>
        <label className="flex items-center gap-2 text-[14px] font-semibold text-encre">
          <input
            type="checkbox"
            checked={codesConserves}
            onChange={(evenement) => setCodesConserves(evenement.target.checked)}
          />
          J&apos;ai conservé mes codes de secours
        </label>
        <Button type="button" variant="primary" className="w-fit" disabled={!codesConserves} onClick={terminer}>
          Terminer
        </Button>
      </div>
    );
  }

  if (actif && afficherDesactivation) {
    return (
      <form action={desactivationFormAction} className="flex flex-col gap-4">
        {desactivationState.error ? (
          <Alert level="critical" title="Désactivation impossible">
            {desactivationState.error}
          </Alert>
        ) : null}
        <p className="text-[13px] text-encre-secondaire">
          Confirmez votre mot de passe et un code de votre application d&apos;authentification (ou un code de
          secours) pour désactiver la double authentification.
        </p>
        <TextField label="Mot de passe actuel" name="motDePasse" type="password" autoComplete="current-password" required />
        <TextField label="Code de vérification ou code de secours" name="code" type="text" autoComplete="one-time-code" required />
        <div className="flex gap-3">
          <Button type="submit" variant="danger" disabled={desactivationPending}>
            {desactivationPending ? "Désactivation..." : "Confirmer la désactivation"}
          </Button>
          <Button type="button" variant="secondary" onClick={() => setAfficherDesactivation(false)}>
            Annuler
          </Button>
        </div>
      </form>
    );
  }

  if (actif && afficherRenouvellement) {
    return (
      <form action={renouvellementFormAction} className="flex flex-col gap-4">
        {renouvellementState.error ? (
          <Alert level="critical" title="Renouvellement impossible">
            {renouvellementState.error}
          </Alert>
        ) : null}
        <p className="text-[13px] text-encre-secondaire">
          Un nouveau lot de dix codes remplace les précédents, qui cessent de fonctionner. Confirmez votre mot de
          passe et un code de votre application d&apos;authentification.
        </p>
        <TextField label="Mot de passe actuel" name="motDePasse" type="password" autoComplete="current-password" required />
        <TextField label="Code de vérification ou code de secours" name="code" type="text" autoComplete="one-time-code" required />
        <div className="flex gap-3">
          <Button type="submit" variant="primary" disabled={renouvellementPending}>
            {renouvellementPending ? "Renouvellement..." : "Générer de nouveaux codes"}
          </Button>
          <Button type="button" variant="secondary" onClick={() => setAfficherRenouvellement(false)}>
            Annuler
          </Button>
        </div>
      </form>
    );
  }

  if (actif) {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="good">Activée</Badge>
          <p className="text-[13px] text-encre-secondaire">
            Un code de votre application d&apos;authentification est demandé à chaque connexion.
          </p>
        </div>
        <p className="text-[13px] text-encre-secondaire">
          Codes de secours restants : <span className="chiffres font-semibold text-encre">{codesSecoursRestants}</span>
          {codesSecoursRestants <= 3 ? " (pensez à en générer de nouveaux)" : ""}
        </p>
        <div className="flex flex-wrap gap-3">
          <Button variant="secondary" className="w-fit" onClick={() => setAfficherRenouvellement(true)}>
            Générer de nouveaux codes de secours
          </Button>
          {obligatoire ? null : (
            <Button variant="secondary" className="w-fit" onClick={() => setAfficherDesactivation(true)}>
              Désactiver la double authentification
            </Button>
          )}
        </div>
        {obligatoire ? (
          <p className="text-[12.5px] text-encre-attenuee">
            La double authentification est obligatoire pour votre rôle. En cas de perte de votre appareil,
            demandez sa réinitialisation à un administrateur.
          </p>
        ) : null}
      </div>
    );
  }

  if (!enrolement) {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <Badge tone="neutral">Non activée</Badge>
          <p className="text-[13px] text-encre-secondaire">
            {obligatoire
              ? "Obligatoire pour votre rôle : activez-la pour continuer."
              : "Recommandée pour protéger votre dossier de santé."}
          </p>
        </div>
        <Button variant="primary" className="w-fit" onClick={commencerActivation} disabled={chargementEnrolement}>
          {chargementEnrolement ? "Préparation..." : "Activer la double authentification"}
        </Button>
      </div>
    );
  }

  return (
    <form action={activationFormAction} className="flex flex-col gap-4">
      {activationState.error ? (
        <Alert level="critical" title="Activation impossible">
          {activationState.error}
        </Alert>
      ) : null}

      <p className="text-[13px] text-encre-secondaire">
        Scannez ce code avec une application d&apos;authentification (Google Authenticator, Microsoft
        Authenticator, FreeOTP ou équivalent), puis saisissez le code à 6 chiffres qu&apos;elle affiche pour
        confirmer l&apos;activation.
      </p>

      {/* eslint-disable-next-line @next/next/no-img-element -- data URL genere localement, pas une image distante */}
      <img
        src={enrolement.qrCodeDataUrl}
        alt="Code QR d'activation de la double authentification"
        width={200}
        height={200}
        className="rounded-champ border border-bordure"
      />

      <p className="text-[12.5px] text-encre-attenuee">
        Impossible de scanner ? Saisissez cette clé manuellement :{" "}
        <span className="chiffres font-semibold text-encre">{enrolement.secretBase32}</span>
      </p>

      <input type="hidden" name="secretBase32" value={enrolement.secretBase32} />

      <TextField
        label="Code de vérification"
        name="code"
        type="text"
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={6}
        required
      />

      <div className="flex gap-3">
        <Button type="submit" variant="primary" disabled={activationPending}>
          {activationPending ? "Vérification..." : "Confirmer l'activation"}
        </Button>
        <Button type="button" variant="secondary" onClick={() => setEnrolement(null)}>
          Annuler
        </Button>
      </div>
    </form>
  );
}
