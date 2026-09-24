"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  grantConsentAction,
  type PatientActionState,
  type ProfessionnelDisponible,
} from "@/modules/patient/actions";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { SelectField } from "@/components/ui/SelectField";

const etatInitial: PatientActionState = { error: null, success: false };

const optionsTypeAcces = [
  { value: "dossier_complet", label: "Dossier complet" },
  { value: "consultations", label: "Consultations" },
  { value: "prescriptions", label: "Prescriptions" },
  { value: "examens", label: "Examens" },
  { value: "documents", label: "Documents" },
];

export interface FormulaireNouveauConsentementProps {
  professionnels: ProfessionnelDisponible[];
}

export function FormulaireNouveauConsentement({
  professionnels,
}: FormulaireNouveauConsentementProps) {
  const [state, formAction, pending] = useActionState(
    grantConsentAction,
    etatInitial
  );
  const router = useRouter();

  useEffect(() => {
    if (state.success) {
      router.refresh();
    }
  }, [state.success, router]);

  const optionsProfessionnels = professionnels.map((professionnel) => ({
    value: professionnel.userId,
    label: `${professionnel.nomComplet}, ${professionnel.specialite}, ${professionnel.etablissementNom}`,
  }));

  return (
    <Card description="Le professionnel choisi pourra consulter les informations correspondant au type d'accès sélectionné, jusqu'à ce que vous retiriez cet accès.">
      <form action={formAction} aria-busy={pending} className="flex flex-col gap-4">
        {state.error ? (
          <Alert level="critical" title="Autorisation impossible">
            {state.error}
          </Alert>
        ) : null}
        {state.success ? (
          <Alert level="success" title="Accès accordé">
            Le professionnel sélectionné peut désormais accéder à votre
            dossier selon le type d&apos;accès choisi.
          </Alert>
        ) : null}

        <SelectField
          label="Professionnel de santé"
          name="acteurAutoriseId"
          required
          options={optionsProfessionnels}
          placeholder="Choisir un professionnel"
        />

        <SelectField
          label="Type d'accès"
          name="typeAcces"
          required
          options={optionsTypeAcces}
          placeholder="Choisir un type d'accès"
        />

        <Button type="submit" variant="primary" className="w-fit" disabled={pending}>
          {pending ? "Envoi en cours..." : "Accorder l'accès"}
        </Button>
      </form>
    </Card>
  );
}
