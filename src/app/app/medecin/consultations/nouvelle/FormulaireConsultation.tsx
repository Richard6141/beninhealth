"use client";

import { useActionState, useId } from "react";
import type { ReactNode } from "react";
import Link from "next/link";
import {
  creerConsultationAction,
  type ClinicalActionState,
} from "@/modules/clinical/actions";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { TextField } from "@/components/ui/TextField";

const etatInitial: ClinicalActionState = { error: null, success: false };

/**
 * Champ texte multiligne (un element par ligne), meme structure visuelle que
 * TextField : le design system ne fournit pas de composant "textarea" dedie
 * (voir src/app/app/patient/dossier/FormulaireDossier.tsx, meme convention
 * pour allergies/antecedents/maladiesChroniques).
 */
function ChampTexteMultiligne({
  label,
  name,
  hint,
  required = false,
  rows = 4,
}: {
  label: string;
  name: string;
  hint: string;
  required?: boolean;
  rows?: number;
}): ReactNode {
  const fieldId = useId();
  const hintId = `${fieldId}-hint`;

  return (
    <div className="flex flex-col gap-1.5">
      <label
        htmlFor={fieldId}
        className="flex flex-wrap items-baseline gap-1.5 text-[18px] font-semibold text-encre"
      >
        {label}
        {required ? (
          <span className="text-critique" aria-hidden="true">
            *
          </span>
        ) : (
          <span className="text-[13px] font-normal text-encre-attenuee">
            (facultatif)
          </span>
        )}
      </label>
      <p id={hintId} className="text-[13px] text-encre-secondaire">
        {hint}
      </p>
      <textarea
        id={fieldId}
        name={name}
        rows={rows}
        required={required}
        aria-describedby={hintId}
        className="w-full rounded-champ border border-bordure-forte bg-surface px-3 py-2 text-[16px] text-encre transition-colors motion-reduce:transition-none placeholder:text-encre-attenuee focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2"
      />
    </div>
  );
}

export interface FormulaireConsultationProps {
  patientId: string;
  patientNomComplet: string;
  patientIdentifiantSante: string;
  rendezVousId: string;
}

/**
 * Formulaire de creation d'une consultation, une fois le patient determine
 * (via query param patientId/rendezVousId ou selection dans SelecteurPatient).
 * creerConsultationAction peut echouer specifiquement faute de consentement
 * actif du patient pour ce professionnel : ce cas est distingue a l'ecran
 * (message rassurant, avec la marche a suivre) plutot que de l'afficher comme
 * une erreur technique brute.
 */
export function FormulaireConsultation({
  patientId,
  patientNomComplet,
  patientIdentifiantSante,
  rendezVousId,
}: FormulaireConsultationProps) {
  const [state, formAction, pending] = useActionState(
    creerConsultationAction,
    etatInitial
  );

  const erreurConsentement =
    state.error !== null && state.error.toLowerCase().includes("consentement");

  if (state.success) {
    return (
      <Card>
        <div className="flex flex-col gap-4">
          <Alert level="success" title="Consultation enregistree">
            La consultation de {patientNomComplet} a bien ete enregistree dans
            son dossier.
          </Alert>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/app/medecin/rendez-vous"
              className="text-[13px] font-semibold text-accent hover:underline"
            >
              Retour a mes rendez-vous
            </Link>
            <Link
              href="/app/medecin/consultations"
              className="text-[13px] font-semibold text-accent hover:underline"
            >
              Voir l&apos;historique des consultations
            </Link>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card
      title={`Consultation de ${patientNomComplet}`}
      description={
        patientIdentifiantSante
          ? `Identifiant sante : ${patientIdentifiantSante}`
          : undefined
      }
    >
      <form action={formAction} aria-busy={pending} className="flex flex-col gap-5">
        <input type="hidden" name="patientId" value={patientId} />
        <input type="hidden" name="rendezVousId" value={rendezVousId} />

        {state.error ? (
          erreurConsentement ? (
            <Alert level="warning" title="Consentement necessaire">
              {state.error} Demandez au patient de vous accorder l&apos;acces
              a son dossier depuis son espace patient (section « Gerer mes
              autorisations d&apos;acces »), puis reessayez.
            </Alert>
          ) : (
            <Alert level="critical" title="Consultation non enregistree">
              {state.error}
            </Alert>
          )
        ) : null}

        <TextField label="Motif de la consultation" name="motif" required />

        <ChampTexteMultiligne
          label="Symptomes"
          name="symptomes"
          hint="Un symptome par ligne (ex. fievre, toux, douleur abdominale)."
        />

        <TextField
          label="Constantes"
          name="constantes"
          hint="Ex. temperature 37.5 C, tension arterielle 12/8, frequence cardiaque 78 bpm."
        />

        <ChampTexteMultiligne
          label="Observations"
          name="observations"
          hint="Observations cliniques relevees pendant la consultation."
        />

        <ChampTexteMultiligne
          label="Conclusion"
          name="conclusion"
          hint="Diagnostic ou conclusion de la consultation."
        />

        <Button type="submit" variant="primary" className="w-fit" disabled={pending}>
          {pending ? "Enregistrement en cours..." : "Enregistrer la consultation"}
        </Button>
      </form>
    </Card>
  );
}
