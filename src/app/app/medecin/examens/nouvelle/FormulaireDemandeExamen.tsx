"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import {
  demanderExamenAction,
  type LaboratoireActionState,
  type LaboratoireOption,
} from "@/modules/laboratoire/actions";
import type { GroupeExamensActifs } from "@/modules/administration/referentiel-examens";
import { ModalNouveauPatient, type PatientCree } from "@/app/app/medecin/patients/ModalNouveauPatient";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { SelectField } from "@/components/ui/SelectField";
import { TextField } from "@/components/ui/TextField";

const etatInitial: LaboratoireActionState = { error: null, success: false };

const CODE_AUTRE_EXAMEN = "AUTRE";

/** F-LAB-01 du pack : niveau d'urgence de la demande. */
const OPTIONS_NIVEAU_URGENCE = [
  { value: "normal", label: "Normal" },
  { value: "urgent", label: "Urgent" },
];

export interface PatientPourSelection {
  patientId: string;
  nomComplet: string;
  identifiantSante: string;
}

export interface FormulaireDemandeExamenProps {
  laboratoires: LaboratoireOption[];
  patients: PatientPourSelection[];
  /** Chaine vide si aucune consultation n'est a l'origine de la demande. */
  consultationId: string;
  /** PatientId a pre-selectionner quand la demande part d'une consultation precise. */
  patientIdPreselectionne: string;
  /**
   * Referentiel des examens (F-ADM-04), recupere cote serveur (page.tsx) :
   * ne peut plus etre importe directement en module pur cote client depuis
   * que ce referentiel vit en base plutot que dans un tableau statique.
   */
  optionsExamensReferentiel: GroupeExamensActifs[];
}

/**
 * Formulaire de demande d'examen (Phase 8) : patient choisi dans un
 * selecteur (meme source que /app/medecin/consultations/nouvelle -
 * getPatientsAvecConsentement), pre-rempli automatiquement quand on arrive
 * depuis le lien "Demander un examen" d'une consultation. Le bouton
 * "Ajouter un patient" ouvre ModalNouveauPatient (F-CLI-03 du pack) pour un
 * patient qui n'a pas encore de dossier, et le selectionne immediatement une
 * fois cree.
 */
export function FormulaireDemandeExamen({
  laboratoires,
  patients: patientsInitiaux,
  consultationId,
  patientIdPreselectionne,
  optionsExamensReferentiel,
}: FormulaireDemandeExamenProps) {
  const [state, formAction, pending] = useActionState(demanderExamenAction, etatInitial);
  const [patients, setPatients] = useState(patientsInitiaux);
  const [patientId, setPatientId] = useState(patientIdPreselectionne);
  const [codeTypeExamen, setCodeTypeExamen] = useState("");
  const [precisionAutreExamen, setPrecisionAutreExamen] = useState("");

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

  const optionsPatients = patients.map((patient) => ({
    value: patient.patientId,
    label: `${patient.nomComplet} (${patient.identifiantSante})`,
  }));

  function handlePatientCree(patient: PatientCree) {
    setPatients((actuels) => [
      { patientId: patient.patientId, nomComplet: patient.nomComplet, identifiantSante: patient.identifiantSante },
      ...actuels,
    ]);
    setPatientId(patient.patientId);
  }

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
      description="Renseignez le patient, le laboratoire et le type d'examen souhaite."
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

        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-[240px] flex-1">
              <SelectField
                label="Patient"
                required
                options={optionsPatients}
                placeholder="Choisir un patient"
                value={patientId}
                onChange={(event) => setPatientId(event.target.value)}
              />
            </div>
            <ModalNouveauPatient onPatientCree={handlePatientCree} libelleBouton="Ajouter un patient" />
          </div>
          {patients.length === 0 ? (
            <p className="text-[13px] text-encre-attenuee">
              Aucun patient ne vous a encore accorde d&apos;acces a son
              dossier. Utilisez « Ajouter un patient » pour un patient qui se
              presente sans compte.
            </p>
          ) : null}
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
          disabled={pending || !patientId || !typeExamenFinal}
        >
          {pending ? "Envoi en cours..." : "Envoyer la demande"}
        </Button>
      </form>
    </Card>
  );
}
