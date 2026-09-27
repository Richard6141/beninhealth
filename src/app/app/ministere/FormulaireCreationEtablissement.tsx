"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  creerEtablissementAction,
  type GestionCompteActionState,
} from "@/modules/identity/gestion-comptes";
import { Alert } from "@/components/ui/Alert";
import { InvitationEnvoyee } from "@/components/InvitationEnvoyee";
import { Button } from "@/components/ui/Button";
import { SelectField } from "@/components/ui/SelectField";
import { TextField } from "@/components/ui/TextField";
import { ChampTextarea } from "./ChampTextarea";
import { OPTIONS_TYPE_ETABLISSEMENT } from "./lib";

const etatInitial: GestionCompteActionState = { error: null, success: false };

export interface FormulaireCreationEtablissementProps {
  onFermer: () => void;
}

/**
 * Formulaire de creation d'un etablissement et de son compte administrateur
 * (creerEtablissementAction, module identity/gestion-comptes). En cas de
 * succes, le formulaire est remplace par la confirmation de l'invitation
 * envoyee a l'administrateur (F-AUTH-05) : il choisit lui-meme son mot de passe.
 */
export function FormulaireCreationEtablissement({
  onFermer,
}: FormulaireCreationEtablissementProps) {
  const [state, formAction, pending] = useActionState(creerEtablissementAction, etatInitial);
  const router = useRouter();

  useEffect(() => {
    if (state.success) {
      router.refresh();
    }
  }, [state.success, router]);

  if (state.success) {
    return (
      <div className="flex flex-col gap-4">
        <Alert level="success" title="Etablissement cree">
          L&apos;etablissement est cree et actif. Son administrateur pourra se connecter des qu&apos;il aura active
          son compte avec l&apos;invitation envoyee.
        </Alert>

        <InvitationEnvoyee email={state.invitationEnvoyeeA ?? ""} lien={state.lienInvitation} />

        <div className="flex justify-end">
          <Button type="button" variant="primary" onClick={onFermer}>
            Fermer
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form action={formAction} aria-busy={pending} className="flex flex-col gap-6">
      {state.error ? (
        <Alert level="critical" title="Creation impossible">
          {state.error}
        </Alert>
      ) : null}

      <div className="flex flex-col gap-4">
        <h3 className="text-[15px] font-bold text-encre">Etablissement</h3>
        <TextField label="Nom" name="nom" required />
        <SelectField
          label="Type"
          name="type"
          required
          options={OPTIONS_TYPE_ETABLISSEMENT}
          placeholder="Choisir un type"
        />
        <TextField
          label="Localisation"
          name="localisation"
          required
          hint="Ville ou quartier, ex : Cotonou, quartier Akpakpa"
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Latitude" name="latitude" type="number" step="any" required />
          <TextField label="Longitude" name="longitude" type="number" step="any" required />
        </div>
        <TextField
          label="Capacite"
          name="capacite"
          type="number"
          min={0}
          step={1}
          required
          hint="Nombre de lits ou de postes de travail"
        />
        <ChampTextarea
          label="Services disponibles"
          name="servicesDisponibles"
          hint="Un service par ligne, ex : Consultation generale"
          rows={4}
        />
      </div>

      <div className="flex flex-col gap-4 border-t border-bordure pt-5">
        <h3 className="text-[15px] font-bold text-encre">
          Compte administrateur de cet etablissement
        </h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Nom" name="adminNom" required />
          <TextField label="Prenom" name="adminPrenom" required />
        </div>
        <TextField label="Email" name="adminEmail" type="email" required />
        <TextField label="Telephone" name="adminTelephone" type="tel" required />
      </div>

      <div className="flex justify-end gap-2 border-t border-bordure pt-5">
        <Button type="button" variant="secondary" onClick={onFermer} disabled={pending}>
          Annuler
        </Button>
        <Button type="submit" variant="primary" disabled={pending}>
          {pending ? "Creation en cours..." : "Creer l'etablissement"}
        </Button>
      </div>
    </form>
  );
}
