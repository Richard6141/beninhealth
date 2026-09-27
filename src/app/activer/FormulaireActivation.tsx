"use client";

import Link from "next/link";
import { useActionState } from "react";
import { activerCompteAction } from "@/modules/identity/activation";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/TextField";

export function FormulaireActivation({ jeton }: { jeton: string }) {
  const [state, formAction, pending] = useActionState(activerCompteAction, { error: null, success: false });

  if (state.success) {
    return (
      <div className="flex flex-col gap-4">
        <Alert level="success" title="Compte activé">
          Votre mot de passe est enregistré. Vous pouvez maintenant vous connecter : un code vous sera envoyé par e-mail
          et, si votre rôle l&apos;exige, vous activerez la double authentification.
        </Alert>
        <Link href="/connexion" className="font-semibold text-accent hover:underline">
          Aller à la connexion
        </Link>
      </div>
    );
  }

  return (
    <form action={formAction} aria-busy={pending} className="flex flex-col gap-4">
      {state.error ? (
        <Alert level="critical" title="Activation impossible">
          {state.error}
        </Alert>
      ) : null}

      <input type="hidden" name="jeton" value={jeton} />

      <TextField
        label="Mot de passe"
        name="motDePasse"
        type="password"
        autoComplete="new-password"
        hint="12 caractères au moins. Évitez votre numéro de téléphone, votre adresse e-mail et les mots courants."
        minLength={12}
        maxLength={128}
        required
      />
      <TextField
        label="Confirmer le mot de passe"
        name="confirmation"
        type="password"
        autoComplete="new-password"
        minLength={12}
        maxLength={128}
        required
      />

      <label className="flex items-start gap-2 text-[14px] text-encre">
        <input type="checkbox" name="conditions" required className="mt-1" />
        <span>
          J&apos;accepte les{" "}
          <Link href="/conditions" target="_blank" className="font-semibold text-accent hover:underline">
            conditions d&apos;utilisation
          </Link>{" "}
          et la{" "}
          <Link href="/confidentialite" target="_blank" className="font-semibold text-accent hover:underline">
            politique de confidentialité
          </Link>
          .
        </span>
      </label>

      <Button type="submit" variant="primary" className="mt-2 w-full" disabled={pending}>
        {pending ? "Activation..." : "Activer mon compte"}
      </Button>
    </form>
  );
}
