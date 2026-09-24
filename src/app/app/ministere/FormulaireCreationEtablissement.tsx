"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy } from "lucide-react";
import {
  creerEtablissementAction,
  type GestionCompteActionState,
} from "@/modules/identity/gestion-comptes";
import { Alert } from "@/components/ui/Alert";
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
 * succes, le formulaire est remplace par un encart d'attention affichant le
 * mot de passe temporaire en clair : il n'est jamais reaffiche apres cette
 * fermeture, donc jamais masque automatiquement ici.
 */
export function FormulaireCreationEtablissement({
  onFermer,
}: FormulaireCreationEtablissementProps) {
  const [state, formAction, pending] = useActionState(creerEtablissementAction, etatInitial);
  const [copie, setCopie] = useState(false);
  const router = useRouter();

  useEffect(() => {
    if (state.success) {
      router.refresh();
    }
  }, [state.success, router]);

  async function copierMotDePasse(motDePasse: string) {
    try {
      await navigator.clipboard.writeText(motDePasse);
      setCopie(true);
      setTimeout(() => setCopie(false), 2000);
    } catch {
      // La copie manuelle reste possible depuis le texte affiche (select-all).
    }
  }

  if (state.success) {
    return (
      <div className="flex flex-col gap-4">
        <Alert level="success" title="Etablissement cree">
          L&apos;etablissement et le compte de son administrateur ont ete
          crees avec succes.
        </Alert>

        {state.motDePasseTemporaire ? (
          <div className="flex flex-col gap-3 rounded-champ border border-vigilance bg-vigilance-clair p-4">
            <p className="text-[14px] font-semibold text-encre">
              Mot de passe temporaire de l&apos;administrateur
            </p>
            <p className="text-[13px] text-encre-secondaire">
              Notez ce mot de passe temporaire et transmettez-le de facon
              securisee a l&apos;administrateur de l&apos;etablissement, il ne
              sera plus jamais affiche.
            </p>
            <div className="flex items-center gap-2">
              <code className="flex-1 select-all break-all rounded-champ border border-bordure-forte bg-surface px-3 py-2 text-[16px] font-semibold tracking-wide text-encre">
                {state.motDePasseTemporaire}
              </code>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                iconBefore={copie ? Check : Copy}
                onClick={() => copierMotDePasse(state.motDePasseTemporaire ?? "")}
              >
                {copie ? "Copie" : "Copier"}
              </Button>
            </div>
          </div>
        ) : null}

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
