"use client";

import Image from "next/image";
import Link from "next/link";
import { useActionState } from "react";
import {
  loginAction,
  verifierCodeEmailEtConnecterAction,
  verifierMfaEtConnecterAction,
} from "@/modules/identity/actions";
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
      description="Saisissez le code à 6 chiffres de votre application d'authentification, ou un de vos codes de secours."
    >
      <form action={formAction} aria-busy={pending} className="flex flex-col gap-4">
        {state.error ? (
          <Alert level="critical" title="Code refuse">
            {state.error}
          </Alert>
        ) : null}

        <input type="hidden" name="preAuthToken" value={preAuthToken} />

        <TextField
          label="Code de vérification ou code de secours"
          name="code"
          type="text"
          autoComplete="one-time-code"
          maxLength={11}
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

/**
 * Deuxieme etape de connexion, obligatoire pour tout compte : affichee des
 * que loginAction renvoie emailCodeRequis=true. Si le compte a en plus la
 * double authentification active, verifierCodeEmailEtConnecterAction renvoie
 * a son tour mfaRequis=true : cette etape enchaine alors directement sur
 * EtapeCodeMfa (troisieme etape) plutot que de revenir au formulaire de
 * connexion.
 */
function EtapeCodeEmail({
  preAuthToken,
  codeDemo,
}: {
  preAuthToken: string;
  codeDemo?: string;
}) {
  const [state, formAction, pending] = useActionState(verifierCodeEmailEtConnecterAction, {
    error: null,
  });

  if (state.mfaRequis && state.preAuthToken) {
    return <EtapeCodeMfa preAuthToken={state.preAuthToken} />;
  }

  return (
    <Card
      title="Vérification par e-mail"
      description="Saisissez le code à 6 chiffres que nous venons de vous envoyer par e-mail."
    >
      <form action={formAction} aria-busy={pending} className="flex flex-col gap-4">
        {state.error ? (
          <Alert level="critical" title="Code refuse">
            {state.error}
          </Alert>
        ) : null}

        {codeDemo ? (
          <Alert level="info" title="Environnement de démonstration">
            Code envoyé : <span className="chiffres font-semibold">{codeDemo}</span>
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
        className="h-20 w-auto"
        priority
      />
      <div className="w-full max-w-md">
        {state.emailCodeRequis && state.preAuthToken ? (
          <EtapeCodeEmail preAuthToken={state.preAuthToken} codeDemo={state.codeDemo} />
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
              <label className="flex items-start gap-2 text-[13px] text-encre">
                <input type="checkbox" name="appareilPartage" className="mt-0.5" />
                <span>
                  Appareil partagé : se déconnecter à la fermeture du navigateur et après 30 minutes d&apos;inactivité.
                </span>
              </label>
              <Link
                href="/mot-de-passe-oublie"
                className="w-fit text-[13px] font-semibold text-accent hover:underline"
              >
                Mot de passe oublié ?
              </Link>

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
            <p className="mt-2 text-center text-[13px] text-encre-secondaire">
              <Link
                href="/etablissements"
                className="font-semibold text-accent hover:underline"
              >
                Rechercher un établissement de santé
              </Link>
            </p>
          </Card>
        )}
      </div>
    </div>
  );
}
