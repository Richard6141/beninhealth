"use client";

import Link from "next/link";
import { useActionState } from "react";
import { loginAction } from "@/modules/identity/actions";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { TextField } from "@/components/ui/TextField";

export default function ConnexionPage() {
  const [state, formAction, pending] = useActionState(loginAction, {
    error: null,
  });

  return (
    <div className="flex min-h-screen items-center justify-center bg-plan px-4 py-10">
      <div className="w-full max-w-md">
        <Card
          title="Connexion"
          description="Accédez à votre espace santé Bénin Health Intelligence Platform."
        >
          <form action={formAction} aria-busy={pending} className="flex flex-col gap-4">
            {state.error ? (
              <Alert level="critical" title="Connexion impossible">
                {state.error}
              </Alert>
            ) : null}

            <TextField
              label="Adresse e-mail"
              name="email"
              type="email"
              autoComplete="email"
              required
            />
            <TextField
              label="Mot de passe"
              name="motDePasse"
              type="password"
              autoComplete="current-password"
              required
            />

            <Button
              type="submit"
              variant="primary"
              className="mt-2 w-full"
              disabled={pending}
            >
              {pending ? "Connexion en cours..." : "Se connecter"}
            </Button>
          </form>

          <p className="mt-6 text-center text-[13px] text-encre-secondaire">
            Pas encore de compte ?{" "}
            <Link
              href="/inscription"
              className="font-semibold text-accent hover:underline"
            >
              Créer mon espace santé
            </Link>
          </p>
        </Card>
      </div>
    </div>
  );
}
