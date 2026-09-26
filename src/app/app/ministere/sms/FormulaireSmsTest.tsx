"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  envoyerSmsTestAction,
  type EnvoyerSmsTestActionState,
} from "@/modules/notification/sms/dev";
import { CATEGORIES_MODIFIABLES, CATEGORIES_VERROUILLEES } from "@/modules/notification/categories";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { SelectField } from "@/components/ui/SelectField";
import { TextField } from "@/components/ui/TextField";

const etatInitial: EnvoyerSmsTestActionState = { error: null, success: false };

const OPTIONS_CATEGORIE = [
  ...CATEGORIES_MODIFIABLES.map((c) => ({ value: c.code, label: c.libelle })),
  ...CATEGORIES_VERROUILLEES.map((c) => ({ value: c.code, label: `${c.libelle} (jamais différé)` })),
];

/**
 * Formulaire d'envoi de SMS de test (F-NOT-02), pour verifier la chaine
 * complete : formatage RG-NOT-02, differe RG-NOT-04, ecriture en base. Ne
 * fait jamais partir de vrai SMS (OutboxSmsProvider, seule implementation).
 */
export function FormulaireSmsTest() {
  const [state, formAction, pending] = useActionState(envoyerSmsTestAction, etatInitial);
  const router = useRouter();

  useEffect(() => {
    if (state.success) {
      router.refresh();
    }
  }, [state.success, router]);

  return (
    <Card
      title="Envoyer un SMS de test"
      description="Vérifie le formatage (préfixe, 160 caractères, translitération) et la mise en différé (21h-7h)."
    >
      <form action={formAction} className="flex flex-col gap-4">
        {state.error ? (
          <Alert level="critical" title="Envoi impossible">
            {state.error}
          </Alert>
        ) : null}
        {state.success ? (
          <Alert level="success" title="Envoi simulé enregistré">
            Vérifiez la liste ci-dessous.
          </Alert>
        ) : null}

        <TextField label="Numéro de destinataire" name="destinataire" required placeholder="+229..." />
        <TextField label="Texte" name="texte" required placeholder="Message à envoyer" />
        <SelectField
          label="Catégorie"
          name="categorie"
          required
          options={OPTIONS_CATEGORIE}
          placeholder="Choisir une catégorie"
        />

        <Button type="submit" variant="secondary" className="w-fit" disabled={pending}>
          {pending ? "Envoi..." : "Envoyer"}
        </Button>
      </form>
    </Card>
  );
}
