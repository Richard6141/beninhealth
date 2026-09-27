"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  grantConsentAction,
  type PatientActionState,
  type ProfessionnelDisponible,
} from "@/modules/patient/actions";
import { OPTIONS_DUREE_CONSENTEMENT } from "@/modules/patient/consentement-durees";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { SelectField } from "@/components/ui/SelectField";
import { SelecteurProfessionnel } from "./SelecteurProfessionnel";

const etatInitial: PatientActionState = { error: null, success: false };

const optionsTypeAcces = [
  { value: "dossier_complet", label: "Dossier complet" },
  { value: "consultations", label: "Consultations" },
  { value: "prescriptions", label: "Prescriptions" },
  { value: "examens", label: "Examens" },
  { value: "documents", label: "Documents" },
];

export function FormulaireNouveauConsentement() {
  const [state, formAction, pending] = useActionState(grantConsentAction, etatInitial);
  const [professionnel, setProfessionnel] = useState<ProfessionnelDisponible | null>(null);
  const router = useRouter();

  // Ajustement d'etat pendant le rendu (comparaison avec l'etat precedent),
  // meme motif que GestionMfa.tsx : router.refresh() reste le seul effet.
  const [etatPrecedent, setEtatPrecedent] = useState(state);
  if (state !== etatPrecedent) {
    setEtatPrecedent(state);
    if (state.success) {
      setProfessionnel(null);
    }
  }

  useEffect(() => {
    if (state.success) {
      router.refresh();
    }
  }, [state.success, router]);

  const optionsDuree = OPTIONS_DUREE_CONSENTEMENT.map((option) => ({
    value: option.valeur,
    label: option.libelle,
  }));

  return (
    <Card description="Recherchez le professionnel choisi : il pourra consulter les informations correspondant au type d'accès sélectionné, pour la durée choisie. Vous pouvez retirer l'accès à tout moment avant l'échéance.">
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

        <input type="hidden" name="acteurAutoriseId" value={professionnel?.userId ?? ""} />
        <SelecteurProfessionnel
          professionnelChoisi={professionnel}
          onChoisir={setProfessionnel}
          onEffacer={() => setProfessionnel(null)}
        />

        <SelectField
          label="Type d'accès"
          name="typeAcces"
          required
          options={optionsTypeAcces}
          placeholder="Choisir un type d'accès"
        />

        <SelectField
          label="Durée de l'autorisation"
          name="duree"
          required
          options={optionsDuree}
          placeholder="Choisir une durée"
          hint="Maximum 12 mois. Vous pourrez retirer l'accès avant l'échéance à tout moment."
        />

        <Button type="submit" variant="primary" className="w-fit" disabled={pending || !professionnel}>
          {pending ? "Envoi en cours..." : "Accorder l'accès"}
        </Button>
      </form>
    </Card>
  );
}
