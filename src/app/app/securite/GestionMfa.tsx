"use client";

import { useState, useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  demarrerEnrolementMfa,
  activerMfaAction,
  desactiverMfaAction,
  type EnrolementMfa,
} from "@/modules/identity/mfa";
import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/TextField";

/**
 * Gestion de la double authentification (Phase 7) : active/desactive la MFA
 * du compte connecte. Le secret et le QR code d'enrolement ne sont jamais
 * sauvegardes tant que le code de confirmation n'a pas ete valide
 * (voir demarrerEnrolementMfa/activerMfaAction).
 */
export function GestionMfa({ actif }: { actif: boolean }) {
  const router = useRouter();
  const [enrolement, setEnrolement] = useState<EnrolementMfa | null>(null);
  const [chargementEnrolement, setChargementEnrolement] = useState(false);
  const [afficherDesactivation, setAfficherDesactivation] = useState(false);

  const [activationState, activationFormAction, activationPending] = useActionState(
    activerMfaAction,
    { error: null, success: false }
  );

  const [desactivationState, desactivationFormAction, desactivationPending] = useActionState(
    desactiverMfaAction,
    { error: null, success: false }
  );

  useEffect(() => {
    if (activationState.success) {
      setEnrolement(null);
      router.refresh();
    }
  }, [activationState.success, router]);

  useEffect(() => {
    if (desactivationState.success) {
      setAfficherDesactivation(false);
      router.refresh();
    }
  }, [desactivationState.success, router]);

  async function commencerActivation() {
    setChargementEnrolement(true);
    const resultat = await demarrerEnrolementMfa();
    setEnrolement(resultat);
    setChargementEnrolement(false);
  }

  if (actif && !afficherDesactivation) {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <Badge tone="good">Activée</Badge>
          <p className="text-[13px] text-encre-secondaire">
            Un code de votre application d&apos;authentification est demandé à
            chaque connexion.
          </p>
        </div>
        <Button
          variant="secondary"
          className="w-fit"
          onClick={() => setAfficherDesactivation(true)}
        >
          Désactiver la double authentification
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
          Confirmez votre mot de passe pour désactiver la double
          authentification sur ce compte.
        </p>
        <TextField
          label="Mot de passe actuel"
          name="motDePasse"
          type="password"
          autoComplete="current-password"
          required
        />
        <div className="flex gap-3">
          <Button type="submit" variant="danger" disabled={desactivationPending}>
            {desactivationPending ? "Désactivation..." : "Confirmer la désactivation"}
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => setAfficherDesactivation(false)}
          >
            Annuler
          </Button>
        </div>
      </form>
    );
  }

  if (!enrolement) {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <Badge tone="neutral">Non activée</Badge>
          <p className="text-[13px] text-encre-secondaire">
            Recommandée pour les comptes professionnels et administrateurs.
          </p>
        </div>
        <Button
          variant="primary"
          className="w-fit"
          onClick={commencerActivation}
          disabled={chargementEnrolement}
        >
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
        Scannez ce code avec une application d&apos;authentification (Google
        Authenticator, Authy, ou équivalent), puis saisissez le code à 6
        chiffres qu&apos;elle affiche pour confirmer l&apos;activation.
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
        <span className="chiffres font-semibold text-encre">
          {enrolement.secretBase32}
        </span>
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
