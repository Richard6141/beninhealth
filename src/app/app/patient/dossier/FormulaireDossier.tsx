"use client";

import { useActionState, useEffect } from "react";
import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  updatePatientProfileAction,
  type DossierPatientResume,
  type PatientActionState,
} from "@/modules/patient/actions";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { SelectField } from "@/components/ui/SelectField";

const optionsGroupeSanguin = [
  { value: "A+", label: "A+" },
  { value: "A-", label: "A-" },
  { value: "B+", label: "B+" },
  { value: "B-", label: "B-" },
  { value: "AB+", label: "AB+" },
  { value: "AB-", label: "AB-" },
  { value: "O+", label: "O+" },
  { value: "O-", label: "O-" },
  { value: "inconnu", label: "Inconnu" },
];

const etatInitial: PatientActionState = { error: null, success: false };

export interface FormulaireDossierProps {
  dossier: DossierPatientResume | null;
}

/**
 * Groupe sanguin et grossesse en cours : seuls champs restes ici (F-CIT-04
 * du pack). Allergies, antecedents, maladies chroniques et contacts
 * d'urgence sont geres individuellement par SectionInformationsDeclarees.tsx
 * (src/modules/patient/informations-declarees.ts, versionnement
 * declare/confirme/retire), plus reecrits d'un bloc par cette action.
 */
export function FormulaireDossier({ dossier }: FormulaireDossierProps): ReactNode {
  const [state, formAction, pending] = useActionState(
    updatePatientProfileAction,
    etatInitial
  );
  const router = useRouter();

  useEffect(() => {
    if (state.success) {
      router.refresh();
    }
  }, [state.success, router]);

  return (
    <form action={formAction} aria-busy={pending} className="flex flex-col gap-5">
      {state.error ? (
        <Alert level="critical" title="Mise à jour impossible">
          {state.error}
        </Alert>
      ) : null}
      {state.success ? (
        <Alert level="success" title="Dossier mis à jour">
          Vos informations de santé ont bien été enregistrées.
        </Alert>
      ) : null}

      <SelectField
        label="Groupe sanguin"
        name="groupeSanguin"
        options={optionsGroupeSanguin}
        defaultValue={dossier?.groupeSanguin || "inconnu"}
      />

      {dossier?.sexe === "F" ? (
        <label className="flex items-center gap-2 text-[16px] font-semibold text-encre">
          <input
            type="checkbox"
            name="grossesseEnCours"
            defaultChecked={dossier.grossesseEnCours}
          />
          Grossesse en cours
        </label>
      ) : null}

      <Button
        type="submit"
        variant="primary"
        className="w-fit"
        disabled={pending}
      >
        {pending ? "Enregistrement en cours..." : "Enregistrer"}
      </Button>
    </form>
  );
}
