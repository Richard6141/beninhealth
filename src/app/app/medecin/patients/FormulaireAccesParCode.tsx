"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, RefreshCw, Send } from "lucide-react";
import {
  confirmerCodeAccesAction,
  demanderAccesDossierAction,
  renvoyerCodeAccesAction,
  type ConfirmationAccesState,
  type DemandeAccesState,
} from "@/modules/transfert/actions";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { SelectField, type SelectOption } from "@/components/ui/SelectField";
import { TextField } from "@/components/ui/TextField";
import { cn } from "@/lib/cn";

const etatDemandeInitial: DemandeAccesState = { error: null, success: false };
const etatConfirmationInitial: ConfirmationAccesState = { error: null, success: false };

type Mode = "telephone" | "npi";

interface Props {
  npiActif: boolean;
  optionsMotif: SelectOption[];
  optionsDuree: SelectOption[];
}

function heureLocale(iso: string): string {
  return new Date(iso).toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Africa/Porto-Novo",
  });
}

function Assistant({ npiActif, optionsMotif, optionsDuree, onRecommencer }: Props & { onRecommencer: () => void }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("telephone");
  const [demande, demanderAction, demandeEnCours] = useActionState(demanderAccesDossierAction, etatDemandeInitial);
  const [renvoi, renvoyerAction, renvoiEnCours] = useActionState(renvoyerCodeAccesAction, etatDemandeInitial);
  const [confirmation, confirmerAction, confirmationEnCours] = useActionState(
    confirmerCodeAccesAction,
    etatConfirmationInitial
  );

  useEffect(() => {
    if (confirmation.success && confirmation.patientId) {
      router.push(`/app/medecin/patients/${confirmation.patientId}`);
    }
  }, [confirmation.success, confirmation.patientId, router]);

  const demandeId = renvoi.success && renvoi.demandeId ? renvoi.demandeId : demande.demandeId;
  const expireLe = renvoi.success && renvoi.expireLe ? renvoi.expireLe : demande.expireLe;

  if (demande.success && demandeId) {
    return (
      <div className="flex flex-col gap-4">
        <Alert level="info" title="Code envoyé au patient, si un dossier correspond">
          Le code lui est envoyé sur son téléphone (WhatsApp ou SMS){expireLe ? ` et expire à ${heureLocale(expireLe)}` : ""}.
          Demandez-le lui à voix haute. Par sécurité, cet écran ne dit pas si un dossier a été trouvé : si aucun code
          n&apos;arrive, vérifiez le numéro ou le NPI, ou utilisez le code de partage du patient.
        </Alert>

        <form action={confirmerAction} className="flex flex-col gap-4 sm:flex-row sm:items-end">
          <input type="hidden" name="demandeId" value={demandeId} />
          <div className="flex-1">
            <TextField
              label="Code donné par le patient"
              name="code"
              required
              inputMode="numeric"
              autoComplete="off"
              placeholder="6 chiffres"
              error={confirmation.error ?? undefined}
            />
          </div>
          <Button type="submit" iconBefore={KeyRound} disabled={confirmationEnCours}>
            {confirmationEnCours ? "Vérification..." : "Ouvrir le dossier"}
          </Button>
        </form>

        <div className="flex flex-wrap items-center gap-3">
          <form action={renvoyerAction}>
            <input type="hidden" name="demandeId" value={demandeId} />
            <Button type="submit" variant="secondary" size="sm" iconBefore={RefreshCw} disabled={renvoiEnCours}>
              {renvoiEnCours ? "Envoi..." : "Renvoyer le code"}
            </Button>
          </form>
          <Button type="button" variant="ghost" size="sm" onClick={onRecommencer}>
            Nouvelle recherche
          </Button>
          {renvoi.success ? (
            <span className="text-[13px] text-bon" role="status">
              Nouveau code envoyé.
            </span>
          ) : renvoi.error ? (
            <span className="text-[13px] text-critique" role="alert">
              {renvoi.error}
            </span>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <form action={demanderAction} className="flex flex-col gap-5">
      <input type="hidden" name="mode" value={mode} />

      {npiActif ? (
        <div role="group" aria-label="Critère de recherche" className="flex flex-wrap gap-2">
          {(
            [
              ["telephone", "Téléphone et date de naissance"],
              ["npi", "NPI"],
            ] as const
          ).map(([valeur, libelle]) => (
            <button
              key={valeur}
              type="button"
              aria-pressed={mode === valeur}
              onClick={() => setMode(valeur)}
              className={cn(
                "h-10 rounded-champ border px-4 text-[14px] font-semibold",
                mode === valeur
                  ? "border-marine bg-marine-clair text-marine"
                  : "border-bordure-forte bg-surface text-encre hover:bg-surface-appui"
              )}
            >
              {libelle}
            </button>
          ))}
        </div>
      ) : null}

      {mode === "npi" ? (
        <TextField
          label="NPI du patient"
          name="npi"
          required
          inputMode="numeric"
          autoComplete="off"
          placeholder="13 chiffres"
          hint="Numéro d'identification personnel, tel qu'il figure sur le certificat NPI."
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="Téléphone du patient"
            name="telephone"
            type="tel"
            required
            autoComplete="off"
            placeholder="+229 01 97 00 00 00"
            hint="Le numéro enregistré dans son dossier, avec ou sans le préfixe 01."
          />
          <TextField label="Date de naissance" name="dateNaissance" type="date" required />
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField label="Motif de l'accès" name="motif" required options={optionsMotif} defaultValue="consultation" />
        <SelectField
          label="Durée de l'accès demandé"
          name="dureeHeures"
          required
          options={optionsDuree}
          defaultValue="24"
          hint="Le patient voit cette durée dans le message qu'il reçoit."
        />
      </div>

      {demande.error ? (
        <p className="text-[14px] text-critique" role="alert">
          {demande.error}
        </p>
      ) : null}

      <div>
        <Button type="submit" iconBefore={Send} disabled={demandeEnCours}>
          {demandeEnCours ? "Envoi..." : "Envoyer le code au patient"}
        </Button>
      </div>
    </form>
  );
}

/**
 * Acces au dossier d'un patient qui n'a encore aucun lien avec ce
 * professionnel : le patient recoit un code sur son telephone et le dicte.
 * Voir docs/conception-transfert-dossier.md.
 */
export function FormulaireAccesParCode(props: Props) {
  const [cle, setCle] = useState(0);

  return (
    <Card
      title="Ouvrir le dossier d'un nouveau patient"
      description="Le patient reçoit un code sur son téléphone et vous le donne : il consent ainsi à votre accès, pour la durée choisie."
    >
      <Assistant key={cle} {...props} onRecommencer={() => setCle((valeur) => valeur + 1)} />
    </Card>
  );
}
