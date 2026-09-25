"use client";

import Image from "next/image";
import Link from "next/link";
import { useActionState } from "react";
import { registerPatientAction } from "@/modules/identity/actions";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { SelectField } from "@/components/ui/SelectField";
import { TextField } from "@/components/ui/TextField";

export default function InscriptionPage() {
  const [state, formAction, pending] = useActionState(registerPatientAction, {
    error: null,
  });

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-plan px-4 py-10">
      <Image
        src="/image.png"
        alt="Ministere de la Sante, Republique du Benin"
        width={169}
        height={48}
        className="h-16 w-auto"
        priority
      />
      <div className="w-full max-w-xl">
        <Card
          title="Créer mon espace santé"
          description="Ces informations permettent de créer votre dossier patient sur la plateforme."
        >
          <form action={formAction} aria-busy={pending} className="flex flex-col gap-4">
            {state.error ? (
              <Alert level="critical" title="Inscription impossible">
                {state.error}
              </Alert>
            ) : null}

            <div className="grid gap-4 sm:grid-cols-2">
              <TextField
                label="Nom"
                name="nom"
                autoComplete="family-name"
                required
              />
              <TextField
                label="Prénom"
                name="prenom"
                autoComplete="given-name"
                required
              />
            </div>

            <TextField
              label="Adresse e-mail"
              name="email"
              type="email"
              autoComplete="email"
              required
            />
            <TextField
              label="Téléphone"
              name="telephone"
              type="tel"
              autoComplete="tel"
              placeholder="+229 00 00 00 00"
              required
            />
            <TextField
              label="Mot de passe"
              name="motDePasse"
              type="password"
              autoComplete="new-password"
              required
            />

            <div className="grid gap-4 sm:grid-cols-2">
              <TextField
                label="Date de naissance"
                name="dateNaissance"
                type="date"
                required
              />
              <SelectField
                label="Sexe"
                name="sexe"
                required
                placeholder="Choisir"
                options={[
                  { value: "M", label: "Masculin" },
                  { value: "F", label: "Féminin" },
                ]}
              />
            </div>

            <Button
              type="submit"
              variant="primary"
              className="mt-2 w-full"
              disabled={pending}
            >
              {pending ? "Création en cours..." : "Créer mon compte"}
            </Button>
          </form>

          <p className="mt-6 text-center text-[13px] text-encre-secondaire">
            Déjà un compte ?{" "}
            <Link
              href="/connexion"
              className="font-semibold text-accent hover:underline"
            >
              Se connecter
            </Link>
          </p>
        </Card>
      </div>
    </div>
  );
}
