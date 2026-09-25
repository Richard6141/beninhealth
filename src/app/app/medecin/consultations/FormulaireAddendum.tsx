"use client";

import { useActionState, useId, useState } from "react";
import {
  ajouterAddendumConsultationAction,
  type ClinicalActionState,
} from "@/modules/clinical/actions";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { SelectField } from "@/components/ui/SelectField";

const etatInitial: ClinicalActionState = { error: null, success: false };

const OPTIONS_MOTIF = [
  { value: "complement_information", label: "Complément d'information" },
  { value: "correction", label: "Correction" },
  { value: "resultat_recu", label: "Résultat reçu" },
  { value: "autre", label: "Autre" },
];

const LONGUEUR_MAX_CONTENU = 2000;

/**
 * Formulaire d'ajout d'addendum (F-CLI-08 du pack) : jamais une modification
 * du contenu original de la consultation, toujours un ajout date et signe,
 * affiche sous la consultation une fois enregistre. Replie par defaut pour
 * ne pas alourdir chaque carte de l'historique.
 */
export function FormulaireAddendum({ consultationId }: { consultationId: string }) {
  const [ouvert, setOuvert] = useState(false);
  const [state, formAction, pending] = useActionState(ajouterAddendumConsultationAction, etatInitial);
  const contenuId = useId();

  if (state.success) {
    return <p className="text-[13px] font-semibold text-bon">Addendum enregistré.</p>;
  }

  if (!ouvert) {
    return (
      <Button type="button" variant="secondary" className="w-fit" onClick={() => setOuvert(true)}>
        Ajouter un addendum
      </Button>
    );
  }

  return (
    <form
      action={formAction}
      aria-busy={pending}
      className="flex flex-col gap-3 rounded-champ border border-bordure bg-plan p-3"
    >
      <input type="hidden" name="consultationId" value={consultationId} />

      {state.error ? (
        <Alert level="critical" title="Addendum non enregistré">
          {state.error}
        </Alert>
      ) : null}

      <SelectField
        label="Motif"
        name="motif"
        required
        options={OPTIONS_MOTIF}
        placeholder="Choisir un motif"
      />

      <div className="flex flex-col gap-1.5">
        <label htmlFor={contenuId} className="text-[14px] font-semibold text-encre">
          Contenu
        </label>
        <textarea
          id={contenuId}
          name="contenu"
          required
          rows={4}
          maxLength={LONGUEUR_MAX_CONTENU}
          className="w-full resize-y rounded-champ border border-bordure-forte bg-surface px-3 py-2 text-[16px] text-encre transition-colors motion-reduce:transition-none placeholder:text-encre-attenuee focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2"
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <Button type="submit" variant="primary" disabled={pending}>
          {pending ? "Enregistrement..." : "Enregistrer l'addendum"}
        </Button>
        <Button type="button" variant="secondary" onClick={() => setOuvert(false)}>
          Annuler
        </Button>
      </div>
    </form>
  );
}
