"use client";

import { useActionState } from "react";
import {
  mettreAJourProfilAction,
  type MonProfil,
  type ProfilActionState,
} from "@/modules/identity/actions";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/TextField";

const etatInitial: ProfilActionState = { error: null, success: false };

export function FormulaireInformations({ profil }: { profil: MonProfil }) {
  const [state, formAction, pending] = useActionState(mettreAJourProfilAction, etatInitial);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {state.error ? (
        <Alert level="critical" title="Mise à jour impossible">
          {state.error}
        </Alert>
      ) : null}
      {state.success ? (
        <Alert level="success" title="Profil mis à jour">
          Vos informations personnelles ont été enregistrées.
        </Alert>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label="Prénom" name="prenom" required defaultValue={profil.prenom} />
        <TextField label="Nom" name="nom" required defaultValue={profil.nom} />
      </div>
      <TextField
        label="Téléphone"
        name="telephone"
        type="tel"
        required
        defaultValue={profil.telephone}
      />
      <TextField
        label="Adresse e-mail"
        name="email"
        type="email"
        defaultValue={profil.email}
        disabled
        hint="L'adresse e-mail sert d'identifiant de connexion et ne peut pas être modifiée ici."
      />

      <Button type="submit" variant="primary" className="w-fit" disabled={pending}>
        {pending ? "Enregistrement..." : "Enregistrer"}
      </Button>
    </form>
  );
}
