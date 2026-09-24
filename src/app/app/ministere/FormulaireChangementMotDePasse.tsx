"use client";

import { useActionState } from "react";
import {
  changerMotDePasseAction,
  type GestionCompteActionState,
} from "@/modules/identity/gestion-comptes";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/TextField";

const etatInitial: GestionCompteActionState = { error: null, success: false };

export interface FormulaireChangementMotDePasseProps {
  onFermer: () => void;
}

/**
 * Formulaire de changement de mot de passe du compte connecte
 * (changerMotDePasseAction, module identity/gestion-comptes). Disponible
 * pour tout role, y compris admin_national depuis l'ecran ministere.
 */
export function FormulaireChangementMotDePasse({
  onFermer,
}: FormulaireChangementMotDePasseProps) {
  const [state, formAction, pending] = useActionState(changerMotDePasseAction, etatInitial);

  return (
    <div className="flex flex-col gap-4">
      {state.error ? (
        <Alert level="critical" title="Changement impossible">
          {state.error}
        </Alert>
      ) : null}
      {state.success ? (
        <Alert level="success" title="Mot de passe modifie">
          Votre mot de passe a ete change avec succes. Utilisez le nouveau mot
          de passe lors de votre prochaine connexion.
        </Alert>
      ) : null}

      {state.success ? (
        <div className="flex justify-end">
          <Button type="button" variant="primary" onClick={onFermer}>
            Fermer
          </Button>
        </div>
      ) : (
        <form action={formAction} aria-busy={pending} className="flex flex-col gap-4">
          <TextField
            label="Mot de passe actuel"
            name="motDePasseActuel"
            type="password"
            autoComplete="current-password"
            required
          />
          <TextField
            label="Nouveau mot de passe"
            name="nouveauMotDePasse"
            type="password"
            autoComplete="new-password"
            hint="8 caracteres minimum."
            required
          />
          <TextField
            label="Confirmation du nouveau mot de passe"
            name="confirmationMotDePasse"
            type="password"
            autoComplete="new-password"
            required
          />
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={onFermer} disabled={pending}>
              Annuler
            </Button>
            <Button type="submit" variant="primary" disabled={pending}>
              {pending ? "Changement en cours..." : "Changer le mot de passe"}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
