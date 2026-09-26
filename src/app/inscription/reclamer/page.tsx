"use client";

import Image from "next/image";
import Link from "next/link";
import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  reclamerDossierAction,
  type ReclamerDossierActionState,
} from "@/modules/identity/reclamation";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { TextField } from "@/components/ui/TextField";

const etatInitial: ReclamerDossierActionState = { error: null, success: false };

/**
 * Ecran "Reclamer un dossier existant" (F-AUTH-03 du pack) : pour une
 * personne dont le dossier a ete cree par un etablissement (F-CLI-03) sans
 * compte, et qui a recu un code (simule, voir /app/ministere/sms). Succes ->
 * session ouverte, redirection vers /app/patient (meme effet qu'une
 * connexion normale).
 */
export default function ReclamerDossierPage() {
  const [state, formAction, pending] = useActionState(reclamerDossierAction, etatInitial);
  const router = useRouter();

  useEffect(() => {
    if (state.success) {
      router.push("/app/patient");
    }
  }, [state.success, router]);

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
          title="Réclamer mon dossier"
          description="Si un professionnel de santé a déjà créé votre dossier, activez votre compte avec le code reçu."
        >
          <form action={formAction} aria-busy={pending} className="flex flex-col gap-4">
            {state.error ? (
              <Alert level="critical" title="Réclamation impossible">
                {state.error}
              </Alert>
            ) : null}

            <TextField label="Code reçu" name="code" required placeholder="XXXXXXXX" />
            <TextField label="Date de naissance" name="dateNaissance" type="date" required />
            <TextField label="Téléphone enregistré sur votre dossier" name="telephone" required />
            <TextField label="Votre adresse e-mail" name="nouvelEmail" type="email" required />
            <TextField
              label="Choisissez un mot de passe"
              name="nouveauMotDePasse"
              type="password"
              required
              hint="Au moins 8 caractères."
            />

            <Button type="submit" variant="primary" disabled={pending}>
              {pending ? "Vérification..." : "Activer mon compte"}
            </Button>

            <p className="text-center text-[13px] text-encre-secondaire">
              Pas de code ?{" "}
              <Link href="/inscription" className="font-semibold text-accent hover:underline">
                Créer un nouveau compte
              </Link>
            </p>
          </form>
        </Card>
      </div>
    </div>
  );
}
