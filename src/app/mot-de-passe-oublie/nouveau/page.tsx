"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect } from "react";
import { useActionState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  reinitialiserMotDePasseAction,
  type ReinitialisationMotDePasseState,
} from "@/modules/identity/reinitialisation-mot-de-passe";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { TextField } from "@/components/ui/TextField";

const etatInitial: ReinitialisationMotDePasseState = { error: null, success: false };

/**
 * Etape 2 de F-AUTH-04 : code + nouveau mot de passe. L'e-mail est redemande
 * explicitement (pre-rempli depuis l'etape precedente via ?email=, simple
 * confort d'usage) plutot que transmis par un jeton lie a un compte reel : ce
 * parcours doit rester indiscernable, cote reponse, entre "compte
 * inexistant" et "code incorrect" (voir reinitialisation-mot-de-passe.ts).
 */
export default function NouveauMotDePassePage() {
  const [state, formAction, pending] = useActionState(reinitialiserMotDePasseAction, etatInitial);
  const parametres = useSearchParams();
  const router = useRouter();
  const emailPreRempli = parametres.get("email") ?? "";

  useEffect(() => {
    if (state.success) {
      const minuteur = setTimeout(() => router.push("/connexion"), 3000);
      return () => clearTimeout(minuteur);
    }
  }, [state.success, router]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-plan px-4 py-10">
      <Image
        src="/image.png"
        alt="Ministere de la Sante, Republique du Benin"
        width={225}
        height={64}
        className="h-20 w-auto"
        priority
      />
      <div className="w-full max-w-md">
        <Card
          title="Nouveau mot de passe"
          description="Saisissez le code reçu par e-mail, puis votre nouveau mot de passe."
        >
          {state.success ? (
            <Alert level="success" title="Mot de passe modifié">
              Votre mot de passe a été modifié. Redirection vers la connexion...
            </Alert>
          ) : (
            <form action={formAction} aria-busy={pending} className="flex flex-col gap-4">
              {state.error ? (
                <Alert level="critical" title="Réinitialisation impossible">
                  {state.error}
                </Alert>
              ) : null}

              <TextField
                label="Adresse e-mail"
                name="email"
                type="email"
                autoComplete="email"
                defaultValue={emailPreRempli}
                required
              />
              <TextField
                label="Code reçu par e-mail"
                name="code"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                required
                autoFocus={Boolean(emailPreRempli)}
              />
              <TextField
                label="Nouveau mot de passe"
                name="nouveauMotDePasse"
                type="password"
                autoComplete="new-password"
                hint="Au moins 8 caractères."
                required
              />
              <TextField
                label="Confirmer le nouveau mot de passe"
                name="confirmationMotDePasse"
                type="password"
                autoComplete="new-password"
                required
              />

              <Button type="submit" variant="primary" className="mt-2 w-full" disabled={pending}>
                {pending ? "Modification en cours..." : "Modifier mon mot de passe"}
              </Button>
            </form>
          )}

          <p className="mt-6 text-center text-[13px] text-encre-secondaire">
            <Link href="/connexion" className="font-semibold text-accent hover:underline">
              Retour à la connexion
            </Link>
          </p>
        </Card>
      </div>
    </div>
  );
}
