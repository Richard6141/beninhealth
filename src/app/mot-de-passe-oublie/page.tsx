"use client";

import Image from "next/image";
import Link from "next/link";
import { useActionState, useState } from "react";
import {
  demanderReinitialisationMotDePasseAction,
  type DemandeReinitialisationState,
} from "@/modules/identity/reinitialisation-mot-de-passe";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { TextField } from "@/components/ui/TextField";
import { cn } from "@/lib/cn";

const etatInitial: DemandeReinitialisationState = { message: null, soumis: false };

/** Lien stylise comme un Button primaire (Button ne rend qu'un <button>, jamais un <a> : meme technique que LienNouvellePrescription dans prescriptions/page.tsx). */
function LienEtapeSuivante({ href }: { href: string }) {
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex h-11 w-full items-center justify-center gap-2 rounded-carte bg-marine px-4 text-[15px] font-semibold text-white transition-colors motion-reduce:transition-none hover:bg-marine-fonce",
        "focus-visible:outline-2 focus-visible:outline-marine focus-visible:outline-offset-2"
      )}
    >
      J&apos;ai reçu mon code
    </Link>
  );
}

/**
 * Etape 1 de F-AUTH-04 (mot de passe oublie) : demande d'un code par e-mail.
 * Le message affiche est toujours le meme, que le compte existe ou non
 * (CA-2 du pack, voir reinitialisation-mot-de-passe.ts) : cet ecran ne peut
 * donc jamais savoir si la demande a reellement declenche un envoi, et ne
 * doit surtout pas essayer de le deviner. `emailSoumis` garde seulement une
 * copie locale de l'e-mail saisi pour pre-remplir le lien vers l'etape
 * suivante (confort d'usage, jamais une confirmation que le compte existe).
 */
export default function MotDePasseOubliePage() {
  const [state, formAction, pending] = useActionState(
    demanderReinitialisationMotDePasseAction,
    etatInitial
  );
  // Champ controle uniquement pour pre-remplir le lien vers l'etape suivante
  // (confort d'usage) : le formulaire lui-meme garde action={formAction} tel
  // quel (jamais enveloppe dans une fonction intermediaire), pour ne pas
  // casser la soumission progressive native du formulaire Server Action.
  const [emailSoumis, setEmailSoumis] = useState("");

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
          title="Mot de passe oublié"
          description="Saisissez votre adresse e-mail : si un compte existe, un code de réinitialisation vous sera envoyé."
        >
          {state.soumis ? (
            <div className="flex flex-col gap-4">
              <Alert level="info" title="Vérifiez votre e-mail">
                {state.message}
              </Alert>
              {state.codeDemo ? (
                <Alert level="info" title="Environnement de démonstration">
                  Code envoyé : <span className="chiffres font-semibold">{state.codeDemo}</span>
                </Alert>
              ) : null}
              <LienEtapeSuivante
                href={`/mot-de-passe-oublie/nouveau${emailSoumis ? `?email=${encodeURIComponent(emailSoumis)}` : ""}`}
              />
            </div>
          ) : (
            <form action={formAction} aria-busy={pending} className="flex flex-col gap-4">
              {state.message ? (
                <Alert level="critical" title="Demande impossible">
                  {state.message}
                </Alert>
              ) : null}

              <TextField
                label="Adresse e-mail"
                name="email"
                type="email"
                autoComplete="email"
                required
                autoFocus
                onChange={(evenement) => setEmailSoumis(evenement.target.value)}
              />

              <Button type="submit" variant="primary" className="mt-2 w-full" disabled={pending}>
                {pending ? "Envoi en cours..." : "Recevoir un code"}
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
