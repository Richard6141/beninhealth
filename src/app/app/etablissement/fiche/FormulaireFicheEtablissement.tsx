"use client";

import { useActionState, useId } from "react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import {
  mettreAJourFicheAction,
  type FicheEtablissement,
  type MettreAJourFicheActionState,
} from "@/modules/facility/gestion-fiche";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/TextField";

const etatInitial: MettreAJourFicheActionState = { error: null, success: false };

/**
 * Zone de texte pour les services disponibles (une ligne = un service),
 * meme constat local que d'autres formulaires ce soir : pas de composant
 * "textarea" dedie dans le design system.
 */
function ChampServices({ valeurInitiale }: { valeurInitiale: string }) {
  const fieldId = useId();

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={fieldId} className="text-[18px] font-semibold text-encre">
        Services disponibles
        <span className="ml-1.5 text-[13px] font-normal text-encre-attenuee">(un par ligne)</span>
      </label>
      <textarea
        id={fieldId}
        name="servicesDisponibles"
        rows={5}
        defaultValue={valeurInitiale}
        placeholder="Consultation générale&#10;Vaccination&#10;Laboratoire..."
        className="w-full resize-y rounded-champ border border-bordure-forte bg-surface px-3 py-2 text-[16px] text-encre transition-colors motion-reduce:transition-none placeholder:text-encre-attenuee focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2"
      />
    </div>
  );
}

/**
 * Formulaire de la fiche etablissement (F-ETA-03) : seuls les champs
 * operationnels sont modifiables ici (sigle, adresse, telephone, email,
 * capacite, services). Le nom, le type, le niveau, le rattachement
 * geographique, les coordonnees GPS et le statut restent du ressort
 * national (F-ADM-02), jamais proposes a la modification sur cet ecran.
 */
export function FormulaireFicheEtablissement({ fiche }: { fiche: FicheEtablissement }) {
  const [state, formAction, pending] = useActionState(mettreAJourFicheAction, etatInitial);
  const router = useRouter();

  useEffect(() => {
    if (state.success) {
      router.refresh();
    }
  }, [state.success, router]);

  return (
    <form action={formAction} aria-busy={pending} className="flex flex-col gap-4">
      {state.error ? (
        <Alert level="critical" title="Enregistrement impossible">
          {state.error}
        </Alert>
      ) : null}
      {state.success ? (
        <Alert level="success" title="Fiche mise à jour">
          Les modifications ont bien été enregistrées.
        </Alert>
      ) : null}

      <div className="rounded-champ border border-bordure bg-plan px-3 py-2">
        <p className="text-[13px] font-semibold text-encre-secondaire">
          {fiche.nom}
        </p>
        <p className="text-[12px] text-encre-attenuee">
          Nom, type, niveau, rattachement géographique et statut : gérés par le ministère.
        </p>
      </div>

      <TextField label="Sigle" name="sigle" defaultValue={fiche.sigle} hint="Facultatif." />
      <TextField label="Adresse" name="adresse" defaultValue={fiche.adresse} hint="Facultatif." />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          label="Téléphone"
          name="telephoneEtablissement"
          defaultValue={fiche.telephoneEtablissement}
          hint="Facultatif."
        />
        <TextField
          label="E-mail"
          name="emailEtablissement"
          type="email"
          defaultValue={fiche.emailEtablissement}
          hint="Facultatif."
        />
      </div>
      <TextField
        label="Capacité (nombre de lits)"
        name="capacite"
        type="number"
        min={0}
        required
        defaultValue={fiche.capacite}
      />
      <ChampServices valeurInitiale={fiche.servicesDisponiblesTexte} />

      <Button type="submit" variant="primary" className="w-fit" disabled={pending}>
        {pending ? "Enregistrement..." : "Enregistrer"}
      </Button>
    </form>
  );
}
