"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, RefreshCw, Send } from "lucide-react";
import {
  confirmerCodeAccesAction,
  demanderAccesDossierAction,
  renvoyerCodeAccesAction,
  statutDemandeAccesAction,
  type ConfirmationAccesState,
  type DemandeAccesState,
  type StatutDemandeAcces,
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

  const [statut, setStatut] = useState<StatutDemandeAcces | null>(null);

  useEffect(() => {
    if (confirmation.success && confirmation.patientId) {
      router.push(`/app/medecin/patients/${confirmation.patientId}`);
    }
  }, [confirmation.success, confirmation.patientId, router]);

  const demandeId = renvoi.success && renvoi.demandeId ? renvoi.demandeId : demande.demandeId;
  const expireLe = renvoi.success && renvoi.expireLe ? renvoi.expireLe : demande.expireLe;

  // Sonde l'etat de la demande : un patient qui repond depuis son espace
  // (sans dicter de code) ouvre le dossier ici sans autre action.
  useEffect(() => {
    if (!demande.success || !demandeId) {
      return;
    }

    let actif = true;
    const minuteur = setInterval(async () => {
      const resultat = await statutDemandeAccesAction(demandeId);

      if (!actif) {
        return;
      }

      setStatut(resultat);

      if (resultat?.statut === "accordee" && resultat.patientId) {
        router.push(`/app/medecin/patients/${resultat.patientId}`);
      }

      if (resultat === null || resultat.statut !== "en_attente") {
        clearInterval(minuteur);
      }
    }, 4000);

    return () => {
      actif = false;
      clearInterval(minuteur);
    };
  }, [demande.success, demandeId, router]);

  if (demande.success && demandeId && statut?.statut === "refusee") {
    return (
      <div className="flex flex-col gap-4">
        <Alert level="critical" title="Le patient a refusé la demande">
          Aucun accès n&apos;a été accordé. Ne renouvelez pas la demande sans en parler avec le patient.
        </Alert>
        <div>
          <Button type="button" variant="secondary" size="sm" onClick={onRecommencer}>
            Nouvelle recherche
          </Button>
        </div>
      </div>
    );
  }

  if (demande.success && demandeId && statut?.statut === "expiree") {
    return (
      <div className="flex flex-col gap-4">
        <Alert level="warning" title="La demande a expiré">
          Aucune réponse n&apos;a été reçue à temps. Vous pouvez recommencer la recherche.
        </Alert>
        <div>
          <Button type="button" variant="secondary" size="sm" onClick={onRecommencer}>
            Nouvelle recherche
          </Button>
        </div>
      </div>
    );
  }

  if (demande.success && demandeId) {
    return (
      <div className="flex flex-col gap-4">
        <Alert level="info" title="Demande envoyée au patient, si un dossier correspond">
          Le patient reçoit un code sur son téléphone (WhatsApp ou SMS){expireLe ? ` valable jusqu'à ${heureLocale(expireLe)}` : ""}.
          Demandez-le lui. S&apos;il a un espace patient BHIP, il peut aussi autoriser la demande depuis son téléphone,
          sans vous donner de code : le dossier s&apos;ouvre alors ici. Par sécurité, cet écran ne dit pas si un dossier
          a été trouvé : si rien n&apos;arrive, vérifiez le numéro ou le NPI, ou utilisez le code de partage du patient.
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
          hint="Au-delà de 24 heures, l'accès n'est accordé que si le patient a un rendez-vous confirmé ou une arrivée enregistrée aujourd'hui dans votre établissement."
        />
      </div>

      <label className="flex items-start gap-3 text-[15px] text-encre">
        <input type="checkbox" name="presence" required className="mt-1 h-5 w-5 shrink-0 accent-[var(--marine)]" />
        <span>
          <span className="font-semibold">Le patient est présent devant moi.</span>{" "}
          <span className="text-encre-secondaire">
            Votre attestation est enregistrée dans le journal d&apos;audit.
          </span>
        </span>
      </label>

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
