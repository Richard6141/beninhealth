"use client";

import { useActionState } from "react";
import Link from "next/link";
import {
  creerReferenceAction,
  type ReferenceActionState,
  type EtablissementDestinationOption,
  type NiveauUrgenceReference,
} from "@/modules/reference/actions";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { SelectField } from "@/components/ui/SelectField";
import { TextField } from "@/components/ui/TextField";

const etatInitial: ReferenceActionState = { error: null, success: false };

const OPTIONS_NIVEAU_URGENCE: { value: NiveauUrgenceReference; label: string }[] = [
  { value: "programmee", label: "Programmée" },
  { value: "urgente", label: "Urgente" },
];

export interface FormulaireReferenceProps {
  consultationId: string;
  patientNomComplet: string;
  motifConsultation: string;
  etablissements: EtablissementDestinationOption[];
}

/**
 * Formulaire de creation d'une reference (F-CLI-14) : motif, niveau
 * d'urgence, resume clinique et etablissement de destination. Le patient et
 * la consultation d'origine sont fixes (transmis en props, jamais modifiables
 * ici), meme principe que FormulairePrescription.tsx.
 */
export function FormulaireReference({
  consultationId,
  patientNomComplet,
  motifConsultation,
  etablissements,
}: FormulaireReferenceProps) {
  const [state, formAction, pending] = useActionState(creerReferenceAction, etatInitial);

  const optionsEtablissements = etablissements.map((etablissement) => ({
    value: etablissement.id,
    label: `${etablissement.nom} (${etablissement.localisation})`,
  }));

  if (state.success) {
    return (
      <Card>
        <div className="flex flex-col gap-4">
          <Alert level="success" title="Reference envoyee">
            La reference a bien ete transmise a l&apos;etablissement destinataire.
          </Alert>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/app/medecin/consultations"
              className="text-[13px] font-semibold text-accent hover:underline"
            >
              Retour a l&apos;historique des consultations
            </Link>
            <Link
              href="/app/medecin/references"
              className="text-[13px] font-semibold text-accent hover:underline"
            >
              Voir mes references
            </Link>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card
      title="Reference"
      description={`Patient : ${patientNomComplet}${motifConsultation ? ` · Motif de la consultation : ${motifConsultation}` : ""}`}
    >
      <form action={formAction} aria-busy={pending} className="flex flex-col gap-6">
        <input type="hidden" name="consultationId" value={consultationId} />

        {state.error ? (
          <Alert level="critical" title="Reference non envoyee">
            {state.error}
          </Alert>
        ) : null}

        {etablissements.length === 0 ? (
          <Alert level="warning" title="Aucun etablissement disponible">
            Aucun hopital n&apos;est enregistre comme destination possible pour
            l&apos;instant.
          </Alert>
        ) : null}

        <SelectField
          label="Etablissement de destination"
          name="etablissementDestinationId"
          required
          options={optionsEtablissements}
          placeholder="Choisir un etablissement"
        />

        <SelectField
          label="Niveau d'urgence"
          name="niveauUrgence"
          required
          options={OPTIONS_NIVEAU_URGENCE}
          placeholder="Choisir un niveau"
        />

        <TextField label="Motif de la reference" name="motif" required placeholder="Ex. Suspicion de pathologie cardiaque" />

        <div className="flex flex-col gap-1.5">
          <label htmlFor="resumeClinique" className="flex flex-wrap items-baseline gap-1.5 text-[18px] font-semibold text-encre">
            Resume clinique
            <span className="text-critique" aria-hidden="true">
              *
            </span>
          </label>
          <p className="text-[13px] text-encre-secondaire">
            Visible par le medecin de l&apos;etablissement destinataire, jamais
            le contenu complet de la consultation.
          </p>
          <textarea
            id="resumeClinique"
            name="resumeClinique"
            required
            rows={5}
            placeholder="Antecedents pertinents, examen clinique, hypothese diagnostique..."
            className="w-full resize-y rounded-champ border border-bordure-forte bg-surface px-3 py-2 text-[16px] text-encre transition-colors motion-reduce:transition-none placeholder:text-encre-attenuee focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2"
          />
        </div>

        <Button type="submit" variant="primary" className="w-fit" disabled={pending || etablissements.length === 0}>
          {pending ? "Envoi en cours..." : "Envoyer la reference"}
        </Button>
      </form>
    </Card>
  );
}
