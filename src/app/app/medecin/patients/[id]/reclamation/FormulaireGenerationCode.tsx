"use client";

import { useActionState } from "react";
import {
  genererCodeReclamationAction,
  type GenererCodeReclamationActionState,
} from "@/modules/identity/reclamation";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";

const etatInitial: GenererCodeReclamationActionState = { error: null, success: false };

/** Génère un code de réclamation (F-AUTH-03) pour un dossier "sans compte". Affiché ici (usage de démonstration) et "envoyé" par SMS simulé (F-NOT-02). */
export function FormulaireGenerationCode({ patientId }: { patientId: string }) {
  const [state, formAction, pending] = useActionState(genererCodeReclamationAction, etatInitial);

  if (state.success && state.code) {
    return (
      <div className="flex flex-col gap-3">
        <Alert level="success" title="Code généré">
          Un SMS simulé a été envoyé (consultable sur /app/ministere/sms). Code affiché ici uniquement à titre de
          démonstration :
        </Alert>
        <p className="chiffres text-center text-[28px] font-bold tracking-[0.2em] text-titre">{state.code}</p>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="patientId" value={patientId} />
      {state.error ? (
        <Alert level="critical" title="Génération impossible">
          {state.error}
        </Alert>
      ) : null}
      <Button type="submit" variant="primary" className="w-fit" disabled={pending}>
        {pending ? "Génération..." : "Générer un code"}
      </Button>
    </form>
  );
}
