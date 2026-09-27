"use client";

import Image from "next/image";
import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import {
  demarrerInscriptionAction,
  renvoyerCodeInscriptionAction,
  verifierCodeInscriptionAction,
  type InscriptionActionState,
} from "@/modules/identity/inscription";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { SelectField } from "@/components/ui/SelectField";
import { TextField } from "@/components/ui/TextField";

const DELAI_RENVOI_SECONDES = 60;

/** Etape 2 : saisie du code envoye par e-mail, avec renvoi possible apres 60 s. */
function EtapeCode({ depart }: { depart: InscriptionActionState }) {
  const [etat, formAction, pending] = useActionState(verifierCodeInscriptionAction, depart);
  const [etatRenvoi, renvoiAction, renvoiPending] = useActionState(renvoyerCodeInscriptionAction, depart);
  const [secondesRestantes, setSecondesRestantes] = useState(DELAI_RENVOI_SECONDES);

  useEffect(() => {
    const minuteur = setInterval(() => setSecondesRestantes((secondes) => Math.max(0, secondes - 1)), 1000);
    return () => clearInterval(minuteur);
  }, []);

  // Un nouvel envoi reussi relance le compte a rebours (ajustement d'etat pendant le rendu).
  const [renvoiPrecedent, setRenvoiPrecedent] = useState(etatRenvoi);
  if (etatRenvoi !== renvoiPrecedent) {
    setRenvoiPrecedent(etatRenvoi);
    if (!etatRenvoi.error) {
      setSecondesRestantes(DELAI_RENVOI_SECONDES);
    }
  }
  const jeton = etat.inscriptionToken ?? depart.inscriptionToken ?? "";
  const codeDemo = etatRenvoi.codeDemo ?? etat.codeDemo ?? depart.codeDemo;
  const emailMasque = depart.emailMasque;

  return (
    <Card
      title="Vérifiez votre adresse e-mail"
      description={`Saisissez le code à 6 chiffres envoyé à ${emailMasque ?? "votre adresse e-mail"}. Il est valable 10 minutes.`}
    >
      <form action={formAction} aria-busy={pending} className="flex flex-col gap-4">
        {etat.error ? (
          <Alert level="critical" title="Code refusé">
            {etat.error}
          </Alert>
        ) : null}
        {etatRenvoi.error ? (
          <Alert level="warning" title="Nouvel envoi impossible">
            {etatRenvoi.error}
          </Alert>
        ) : null}
        {!etat.error && (etatRenvoi.message ?? depart.message) ? (
          <Alert level="info" title="Code envoyé">
            {etatRenvoi.message ?? depart.message}
          </Alert>
        ) : null}
        {codeDemo ? (
          <Alert level="info" title="Environnement de démonstration">
            Code envoyé : <span className="chiffres font-semibold">{codeDemo}</span>
          </Alert>
        ) : null}

        <input type="hidden" name="inscriptionToken" value={jeton} />

        <TextField
          label="Code de vérification"
          name="code"
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          required
          autoFocus
        />

        <Button type="submit" variant="primary" className="w-full" disabled={pending}>
          {pending ? "Vérification..." : "Créer mon compte"}
        </Button>
      </form>

      <form action={renvoiAction} className="mt-4">
        <input type="hidden" name="inscriptionToken" value={jeton} />
        <Button type="submit" variant="secondary" className="w-full" disabled={renvoiPending || secondesRestantes > 0}>
          {secondesRestantes > 0 ? `Renvoyer le code dans ${secondesRestantes} s` : "Renvoyer le code"}
        </Button>
      </form>
    </Card>
  );
}

export default function InscriptionPage() {
  const [state, formAction, pending] = useActionState(demarrerInscriptionAction, {
    error: null,
  } as InscriptionActionState);

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
        {state.etape === "code" && state.inscriptionToken ? (
          <EtapeCode depart={state} />
        ) : (
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
                <TextField label="Nom" name="nom" autoComplete="family-name" maxLength={60} required />
                <TextField label="Prénoms" name="prenom" autoComplete="given-name" maxLength={80} required />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <TextField label="Date de naissance" name="dateNaissance" type="date" required />
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

              <TextField
                label="Téléphone"
                name="telephone"
                type="tel"
                autoComplete="tel"
                placeholder="+229 01 97 12 34 56"
                hint="Numéro béninois à 10 chiffres, commençant par 01."
                required
              />
              <TextField
                label="Adresse e-mail"
                name="email"
                type="email"
                autoComplete="email"
                hint="Un code de vérification y sera envoyé."
                required
              />
              <TextField
                label="Mot de passe"
                name="motDePasse"
                type="password"
                autoComplete="new-password"
                hint="8 caractères au moins. Évitez votre numéro, votre date de naissance et les mots courants."
                minLength={8}
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
                {pending ? "Envoi du code..." : "Continuer"}
              </Button>
            </form>

            <p className="mt-6 text-center text-[13px] text-encre-secondaire">
              Déjà un compte ?{" "}
              <Link href="/connexion" className="font-semibold text-accent hover:underline">
                Se connecter
              </Link>
            </p>
            <p className="mt-2 text-center text-[13px] text-encre-secondaire">
              Un dossier a déjà été créé pour vous ?{" "}
              <Link href="/inscription/reclamer" className="font-semibold text-accent hover:underline">
                Réclamer mon dossier
              </Link>
            </p>
          </Card>
        )}
      </div>
    </div>
  );
}
