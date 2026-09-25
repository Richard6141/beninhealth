"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import {
  demanderExamenAction,
  type LaboratoireActionState,
  type LaboratoireOption,
} from "@/modules/laboratoire/actions";
import { ModalNouveauPatient, type PatientCree } from "@/app/app/medecin/patients/ModalNouveauPatient";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { SelectField } from "@/components/ui/SelectField";
import { TextField } from "@/components/ui/TextField";

const etatInitial: LaboratoireActionState = { error: null, success: false };

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
}: FormulaireDemandeExamenProps) {
  const [state, formAction, pending] = useActionState(demanderExamenAction, etatInitial);
  const [patients, setPatients] = useState(patientsInitiaux);
  const [patientId, setPatientId] = useState(patientIdPreselectionne);

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

        <TextField
          label="Type d'examen"
          name="typeExamen"
          required
          placeholder="Ex. Numeration formule sanguine"
        />

        <Button type="submit" variant="primary" className="w-fit" disabled={pending || !patientId}>
          {pending ? "Envoi en cours..." : "Envoyer la demande"}
        </Button>
      </form>
    </Card>
  );
}
