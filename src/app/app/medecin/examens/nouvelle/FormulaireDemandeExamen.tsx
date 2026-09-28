"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import {
  demanderExamenAction,
  type LaboratoireActionState,
  type LaboratoireOption,
} from "@/modules/laboratoire/actions";
import type { GroupeExamensActifs } from "@/modules/administration/referentiel-examens";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { SelectField } from "@/components/ui/SelectField";
import { TextField } from "@/components/ui/TextField";

const etatInitial: LaboratoireActionState = { error: null, success: false };

const CODE_AUTRE_EXAMEN = "AUTRE";

/** F-LAB-01 du pack : longueur maximale des renseignements cliniques (voir schemaDemandeExamen). */
const LONGUEUR_MAX_RENSEIGNEMENTS_CLINIQUES = 200;

/** F-LAB-01 du pack : niveau d'urgence de la demande. */
const OPTIONS_NIVEAU_URGENCE = [
  { value: "normal", label: "Normal" },
  { value: "urgent", label: "Urgent" },
];

export interface FormulaireDemandeExamenProps {
  laboratoires: LaboratoireOption[];
  /** RG-LAB-01 du pack : toujours renseigne, une demande est toujours liee a une consultation. */
  consultationId: string;
  patientId: string;
  patientNomComplet: string | null;
  /**
   * Referentiel des examens (F-ADM-04), recupere cote serveur (page.tsx) :
   * ne peut plus etre importe directement en module pur cote client depuis
   * que ce referentiel vit en base plutot que dans un tableau statique.
   */
  optionsExamensReferentiel: GroupeExamensActifs[];
}

/**
 * Formulaire de demande d'examen (Phase 8). RG-LAB-01 du pack : une demande
 * est toujours liee a une consultation (comme une ordonnance), le patient
 * n'est donc plus choisi ici mais fixe par la consultation selectionnee sur
 * l'ecran precedent (page.tsx / SelecteurConsultation), affiche en lecture
 * seule.
 */
export function FormulaireDemandeExamen({
  laboratoires,
  consultationId,
  patientId,
  patientNomComplet,
  optionsExamensReferentiel,
}: FormulaireDemandeExamenProps) {
  const [state, formAction, pending] = useActionState(demanderExamenAction, etatInitial);
  const [codeTypeExamen, setCodeTypeExamen] = useState("");
  const [precisionAutreExamen, setPrecisionAutreExamen] = useState("");
  const [renseignementsCliniques, setRenseignementsCliniques] = useState("");

  const OPTIONS_TYPE_EXAMEN = [
    ...optionsExamensReferentiel.flatMap(({ famille, examens }) =>
      examens.map((examen) => ({ value: examen.code, label: `${famille} · ${examen.libelle}` }))
    ),
    { value: CODE_AUTRE_EXAMEN, label: "Autre (préciser)" },
  ];

  function libelleExamen(code: string): string | undefined {
    for (const { examens } of optionsExamensReferentiel) {
      const trouve = examens.find((examen) => examen.code === code);
      if (trouve) return trouve.libelle;
    }
    return undefined;
  }

  const estAutreExamen = codeTypeExamen === CODE_AUTRE_EXAMEN;
  const typeExamenFinal = estAutreExamen
    ? precisionAutreExamen.trim()
    : (libelleExamen(codeTypeExamen) ?? "");

  const optionsLaboratoires = laboratoires.map((laboratoire) => ({
    value: laboratoire.id,
    label: `${laboratoire.nom} (${laboratoire.localisation})`,
  }));

  const erreurConsentement =
    state.error !== null && state.error.toLowerCase().includes("consentement");

  if (state.success) {
    return (
      <Card>
        <div className="flex flex-col gap-4">
          <Alert level="success" title="Demande d'examen enregistree">
            La demande d&apos;examen a bien ete transmise au laboratoire.
          </Alert>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/app/medecin/consultations"
              className="text-[13px] font-semibold text-accent hover:underline"
            >
              Retour a l&apos;historique des consultations
            </Link>
            <Link
              href="/app/medecin/examens"
              className="text-[13px] font-semibold text-accent hover:underline"
            >
              Voir l&apos;historique des examens demandes
            </Link>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card
      title="Demande d'examen"
      description="Renseignez le laboratoire et le type d'examen souhaite."
    >
      <form action={formAction} aria-busy={pending} className="flex flex-col gap-6">
        <input type="hidden" name="consultationId" value={consultationId} />
        <input type="hidden" name="patientId" value={patientId} />

        {state.error ? (
          erreurConsentement ? (
            <Alert level="warning" title="Consentement necessaire">
              {state.error}
            </Alert>
          ) : (
            <Alert level="critical" title="Demande non enregistree">
              {state.error}
            </Alert>
          )
        ) : null}

        <div className="flex flex-col gap-1 rounded-champ border border-bordure bg-plan px-4 py-3">
          <span className="text-[12px] font-semibold uppercase tracking-[0.06em] text-encre-attenuee">
            Patient
          </span>
          <span className="text-[15px] font-semibold text-encre">
            {patientNomComplet ?? "Patient non precise"}
          </span>
        </div>

        <SelectField
          label="Laboratoire"
          name="laboratoireId"
          required
          options={optionsLaboratoires}
          placeholder="Choisir un laboratoire"
        />

        <input type="hidden" name="typeExamen" value={typeExamenFinal} />
        <SelectField
          label="Type d'examen"
          required
          options={OPTIONS_TYPE_EXAMEN}
          placeholder="Choisir un type d'examen"
          value={codeTypeExamen}
          onChange={(event) => setCodeTypeExamen(event.target.value)}
        />
        {estAutreExamen ? (
          <TextField
            label="Préciser le type d'examen"
            required
            placeholder="Ex. Test auditif"
            value={precisionAutreExamen}
            onChange={(event) => setPrecisionAutreExamen(event.target.value)}
          />
        ) : null}

        <div className="flex flex-col gap-1.5">
          <label htmlFor="renseignementsCliniques" className="text-[15px] font-semibold text-encre">
            Renseignements cliniques
          </label>
          <textarea
            id="renseignementsCliniques"
            name="renseignementsCliniques"
            rows={3}
            maxLength={LONGUEUR_MAX_RENSEIGNEMENTS_CLINIQUES}
            placeholder="Bref contexte clinique utile au laboratoire (facultatif)"
            value={renseignementsCliniques}
            onChange={(event) => setRenseignementsCliniques(event.target.value)}
            className="w-full rounded-champ border border-bordure-forte bg-surface px-3 py-2 text-[14px] text-encre placeholder:text-encre-attenuee transition-colors motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2"
          />
          <span className="self-end text-[12px] text-encre-attenuee">
            {renseignementsCliniques.length}/{LONGUEUR_MAX_RENSEIGNEMENTS_CLINIQUES}
          </span>
        </div>

        <SelectField
          label="Niveau d'urgence"
          name="niveauUrgence"
          options={OPTIONS_NIVEAU_URGENCE}
          defaultValue="normal"
          hint="« Urgent » signale au laboratoire une demande à traiter en priorité."
        />

        <label className="flex items-center gap-2 text-[15px] font-semibold text-encre">
          <input type="checkbox" name="aJeunRequis" value="true" />
          À jeun requis
        </label>

        <Button
          type="submit"
          variant="primary"
          className="w-fit"
          disabled={pending || !typeExamenFinal}
        >
          {pending ? "Envoi en cours..." : "Envoyer la demande"}
        </Button>
      </form>
    </Card>
  );
}
