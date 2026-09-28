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
 * Selecteur de consultation pour demarrer une demande d'examen sans passer
 * par le lien "Demander un examen" d'une consultation precise (RG-LAB-01 du
 * pack : une demande d'examen est toujours liee a une consultation, comme
 * une ordonnance, jamais creee dans l'absolu). Meme composant que
 * src/app/app/medecin/prescriptions/nouvelle/SelecteurConsultation.tsx,
 * duplique ici (pas d'import cross-ecran) et adapte a la route des examens.
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
      `/app/medecin/examens/nouvelle?consultationId=${encodeURIComponent(consultationId)}`
    );
  }

  return (
    <Card description="Une demande d'examen est toujours rattachee a une consultation : choisissez celle concernee.">
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
