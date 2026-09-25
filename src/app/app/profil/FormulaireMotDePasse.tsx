"use client";

import { useActionState } from "react";
import {
  changerMotDePasseAction,
  type GestionCompteActionState,
} from "@/modules/identity";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/TextField";

const etatInitial: GestionCompteActionState = { error: null, success: false };

/**
 * Reutilise changerMotDePasseAction de src/modules/identity/gestion-comptes.ts
 * (meme regle metier : mot de passe actuel exige, un seul point
 * d'implementation du changement de mot de passe dans tout le module).
 */
export function FormulaireMotDePasse() {
  const [state, formAction, pending] = useActionState(changerMotDePasseAction, etatInitial);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {state.error ? (
        <Alert level="critical" title="Changement impossible">
          {state.error}
        </Alert>
      ) : null}
      {state.success ? (
        <Alert level="success" title="Mot de passe modifié">
          Votre mot de passe a été changé avec succès.
        </Alert>
      ) : null}

      <TextField
        label="Mot de passe actuel"
        name="motDePasseActuel"
        type="password"
        autoComplete="current-password"
        required
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          label="Nouveau mot de passe"
          name="nouveauMotDePasse"
          type="password"
          autoComplete="new-password"
          required
          hint="8 caractères minimum."
        />
        <TextField
          label="Confirmation"
          name="confirmationMotDePasse"
          type="password"
          autoComplete="new-password"
          required
        />
      </div>

      <Button type="submit" variant="primary" className="w-fit" disabled={pending}>
        {pending ? "Modification..." : "Changer le mot de passe"}
      </Button>
    </form>
  );
}
