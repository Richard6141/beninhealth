"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { KeyRound } from "lucide-react";
import {
  consommerCodePartageAction,
  type ConsommationCodePartageState,
} from "@/modules/partage/actions";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { TextField } from "@/components/ui/TextField";

const etatInitial: ConsommationCodePartageState = { error: null, success: false };

/**
 * Saisie d'un code de partage temporaire (F-CIT-11 du pack), reserve aux
 * medecins et infirmiers (RG-CIT-91, verifie cote serveur). Redirige vers le
 * dossier du patient une fois le code accepte : consommerCodePartageAction a
 * deja cree le Consentement necessaire, getResumePatient y donnera donc
 * acces normalement.
 */
export function FormulaireCodePartage() {
  const [state, formAction, pending] = useActionState(consommerCodePartageAction, etatInitial);
  const router = useRouter();

  useEffect(() => {
    if (state.success && state.patientId) {
      router.push(`/app/medecin/patients/${state.patientId}`);
    }
  }, [state.success, state.patientId, router]);

  return (
    <Card
      title="Code de partage"
      description="Un patient présent devant vous peut vous donner accès à son dossier via un code à usage unique."
    >
      <form action={formAction} className="flex flex-col gap-4 sm:flex-row sm:items-end">
        <div className="flex-1">
          <TextField
            label="Code"
            name="code"
            required
            placeholder="Ex. K7M4-QX9P"
            error={state.error ?? undefined}
          />
        </div>
        <Button type="submit" variant="secondary" iconBefore={KeyRound} disabled={pending}>
          {pending ? "Vérification..." : "Valider le code"}
        </Button>
      </form>
    </Card>
  );
}
