"use client";

import Image from "next/image";
import Link from "next/link";
import { useActionState } from "react";
import { loginAction, verifierMfaEtConnecterAction } from "@/modules/identity/actions";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { TextField } from "@/components/ui/TextField";

/**
 * Deuxieme etape de connexion (Phase 7) : affichee uniquement quand
 * loginAction renvoie mfaRequis=true (compte avec la double authentification
 * activee). Le jeton de pre-authentification est transmis tel quel dans un
 * champ cache, jamais modifie ni lu cote client.
 */
function EtapeCodeMfa({ preAuthToken }: { preAuthToken: string }) {
  const [state, formAction, pending] = useActionState(verifierMfaEtConnecterAction, {
    error: null,
  });

  return (
    <Card
      title="Double authentification"
      description="Saisissez le code a 6 chiffres genere par votre application d'authentification."
    >
      <form action={formAction} aria-busy={pending} className="flex flex-col gap-4">
        {state.error ? (
          <Alert level="critical" title="Code refuse">
            {state.error}
          </Alert>
        ) : null}

        <input type="hidden" name="preAuthToken" value={preAuthToken} />

        <TextField
          label="Code de verification"
          name="code"
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          required
          autoFocus
        />

        <Button
          type="submit"
          variant="primary"
          className="mt-2 w-full"
          disabled={pending}
        >
          {pending ? "Verification en cours..." : "Valider"}
        </Button>
      </form>
    </Card>
  );
}

export default function ConnexionPage() {
  const [state, formAction, pending] = useActionState(loginAction, {
    error: null,
  });

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-plan px-4 py-10">
      <Image
        src="/image.png"
        alt="Ministere de la Sante, Republique du Benin"
        width={225}
        height={64}
        className="h-16 w-auto"
        priority
      />
      <div className="w-full max-w-md">
        {state.mfaRequis && state.preAuthToken ? (
          <EtapeCodeMfa preAuthToken={state.preAuthToken} />
        ) : (
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
        )}
      </div>
    </div>
  );
}
