"use client";

import { useState } from "react";
import type { ChangeEvent } from "react";
import { useRouter } from "next/navigation";
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

  function handleContinuer() {
    if (!patientId) return;
    router.push(
      `/app/medecin/consultations/nouvelle?patientId=${encodeURIComponent(patientId)}`
    );
  }

  return (
    <Card description="Seuls les patients vous ayant accorde un acces a leur dossier apparaissent dans cette liste.">
      <div className="flex flex-col gap-4">
        <SelectField
          label="Patient"
          required
          options={options}
          placeholder="Choisir un patient"
          value={patientId}
          onChange={handleChange}
        />
        <Button
          type="button"
          variant="primary"
          className="w-fit"
          disabled={!patientId}
          onClick={handleContinuer}
        >
          Continuer
        </Button>
      </div>
    </Card>
  );
}
