"use client";

import { useState } from "react";
import type { ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { SelectField } from "@/components/ui/SelectField";

export interface ConsultationSelectionnable {
  id: string;
  patientNomComplet: string | null;
  patientIdentifiantSante: string | null;
  motif: string;
  date: string;
  statut: string;
}

export interface SelecteurConsultationProps {
  consultations: ConsultationSelectionnable[];
}

function formaterDate(date: string): string {
  try {
    return new Date(date).toLocaleDateString("fr-FR", { dateStyle: "long" });
  } catch {
    return date;
  }
}

/**
 * Selecteur de consultation pour demarrer une nouvelle prescription sans
 * passer par le lien "Prescrire" d'une consultation precise (RG-PRE-01 du
 * pack : une prescription est toujours liee a une consultation, jamais
 * creee dans l'absolu). Meme convention que SelecteurPatient.tsx (module
 * consultations) : navigation client via useRouter().push.
 */
export function SelecteurConsultation({ consultations }: SelecteurConsultationProps) {
  const [consultationId, setConsultationId] = useState("");
  const router = useRouter();

  const options = consultations.map((consultation) => ({
    value: consultation.id,
    label: `${consultation.patientNomComplet ?? "Patient non precise"} : ${consultation.motif || "(sans motif)"} · ${formaterDate(consultation.date)}${consultation.statut === "brouillon" ? " (brouillon)" : ""}`,
  }));

  function handleChange(event: ChangeEvent<HTMLSelectElement>) {
    setConsultationId(event.target.value);
  }

  function handleContinuer() {
    if (!consultationId) return;
    router.push(
      `/app/medecin/prescriptions/nouvelle?consultationId=${encodeURIComponent(consultationId)}`
    );
  }

  return (
    <Card description="Une prescription est toujours rattachee a une consultation : choisissez celle concernee.">
      <div className="flex flex-col gap-4">
        <SelectField
          label="Consultation"
          required
          options={options}
          placeholder="Choisir une consultation"
          value={consultationId}
          onChange={handleChange}
        />
        <Button
          type="button"
          variant="primary"
          className="w-fit"
          disabled={!consultationId}
          onClick={handleContinuer}
        >
          Continuer
        </Button>
      </div>
    </Card>
  );
}
