"use client";

import { useState } from "react";
import type { ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { ModalNouveauPatient, type PatientCree } from "@/app/app/medecin/patients/ModalNouveauPatient";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { SelectField } from "@/components/ui/SelectField";

export interface PatientAvecConsentement {
  patientId: string;
  nomComplet: string;
  identifiantSante: string;
}

export interface SelecteurPatientProps {
  patients: PatientAvecConsentement[];
}

/**
 * Selecteur de patient pour demarrer une nouvelle consultation, quand aucun
 * patientId n'est fourni en query param. La navigation vers
 * ?patientId=... se fait via useRouter().push (transition client, sans
 * recharger la page) plutot qu'une soumission de formulaire classique.
 */
export function SelecteurPatient({ patients }: SelecteurPatientProps) {
  const [patientId, setPatientId] = useState("");
  const router = useRouter();

  const options = patients.map((patient) => ({
    value: patient.patientId,
    label: `${patient.nomComplet} (${patient.identifiantSante})`,
  }));

  function handleChange(event: ChangeEvent<HTMLSelectElement>) {
    setPatientId(event.target.value);
  }

  function handleContinuer(id: string) {
    if (!id) return;
    router.push(
      `/app/medecin/consultations/nouvelle?patientId=${encodeURIComponent(id)}`
    );
  }

  function handlePatientCree(patient: PatientCree) {
    // Un patient nouvellement cree a systematiquement le Consentement
    // "dossier_complet" accorde automatiquement au medecin createur
    // (creerPatientParProfessionnelAction) : on peut donc demarrer sa
    // consultation immediatement, sans repasser par ce selecteur.
    handleContinuer(patient.patientId);
  }

  return (
    <Card description="Seuls les patients vous ayant accorde un acces a leur dossier apparaissent dans cette liste.">
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[240px] flex-1">
            <SelectField
              label="Patient"
              required
              options={options}
              placeholder="Choisir un patient"
              value={patientId}
              onChange={handleChange}
            />
          </div>
          <ModalNouveauPatient onPatientCree={handlePatientCree} libelleBouton="Ajouter un patient" />
        </div>
        <Button
          type="button"
          variant="primary"
          className="w-fit"
          disabled={!patientId}
          onClick={() => handleContinuer(patientId)}
        >
          Continuer
        </Button>
      </div>
    </Card>
  );
}
