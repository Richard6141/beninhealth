"use client";

import { useActionState, useEffect, useId, useState } from "react";
import { useRouter } from "next/navigation";
import {
  creerSuiviCommunautaireAction,
  type PersonneCommunautaireResume,
  type SuiviCommunautaireActionState,
} from "@/modules/communautaire/actions";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { SelectField } from "@/components/ui/SelectField";
import { TextField } from "@/components/ui/TextField";
import { ModalNouvellePersonne } from "./ModalNouvellePersonne";

const etatInitial: SuiviCommunautaireActionState = { error: null, success: false };

const optionsTypeVisite = [
  { value: "vaccination", label: "Vaccination" },
  { value: "depistage", label: "Dépistage" },
  { value: "suivi_grossesse", label: "Suivi de grossesse" },
  { value: "sensibilisation", label: "Sensibilisation" },
  { value: "autre", label: "Autre" },
];

/**
 * Champ notes multiligne libre : le design system ne fournit pas de
 * composant "textarea" dedie (voir src/app/app/medecin/laboratoire/
 * FormulaireResultat.tsx, meme constat local).
 */
function ChampNotes() {
  const fieldId = useId();

  return (
    <div className="flex flex-col gap-1.5">
      <label
        htmlFor={fieldId}
        className="flex flex-wrap items-baseline gap-1.5 text-[18px] font-semibold text-encre"
      >
        Notes
        <span className="text-[13px] font-normal text-encre-attenuee">(facultatif)</span>
      </label>
      <textarea
        id={fieldId}
        name="notes"
        rows={3}
        placeholder="Observations, recommandations, suivi à prévoir..."
        className="w-full resize-y rounded-champ border border-bordure-forte bg-surface px-3 py-2 text-[16px] text-encre transition-colors motion-reduce:transition-none placeholder:text-encre-attenuee focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2"
      />
    </div>
  );
}

const VALEUR_NOUVEAU_BENEFICIAIRE = "";

/**
 * Contenu du formulaire, isole a part (remonte via la prop "key" du parent
 * apres chaque visite enregistree) pour repartir d'un useActionState neuf,
 * meme pattern que src/app/app/medecin/laboratoire/FormulaireResultat.tsx.
 */
function ContenuFormulaire({
  personnesInitiales,
  onNouvelleVisite,
}: {
  personnesInitiales: PersonneCommunautaireResume[];
  onNouvelleVisite: () => void;
}) {
  const [state, formAction, pending] = useActionState(
    creerSuiviCommunautaireAction,
    etatInitial
  );
  const router = useRouter();
  const [personnes, setPersonnes] = useState(personnesInitiales);
  const [personneId, setPersonneId] = useState(VALEUR_NOUVEAU_BENEFICIAIRE);

  useEffect(() => {
    if (state.success) {
      router.refresh();
    }
  }, [state.success, router]);

  if (state.success) {
    return (
      <div className="flex flex-col gap-4">
        <Alert level="success" title="Visite enregistrée">
          La visite a bien été ajoutée à votre historique de suivi communautaire.
        </Alert>
        {state.avertissementDoublonBeneficiaire ? (
          <Alert level="warning" title="Bénéficiaire peut-être déjà connu">
            {state.avertissementDoublonBeneficiaire}
          </Alert>
        ) : null}
        <Button type="button" variant="secondary" className="w-fit" onClick={onNouvelleVisite}>
          Enregistrer une nouvelle visite
        </Button>
      </div>
    );
  }

  const optionsPersonnes = [
    { value: VALEUR_NOUVEAU_BENEFICIAIRE, label: "Saisir un nom (sans enregistrement)" },
    ...personnes.map((personne) => ({ value: personne.id, label: personne.nomComplet })),
  ];

  return (
    <form action={formAction} aria-busy={pending} className="flex flex-col gap-4">
      {state.error ? (
        <Alert level="critical" title="Enregistrement impossible">
          {state.error}
        </Alert>
      ) : null}

      <input type="hidden" name="personneId" value={personneId} />

      <div className="flex flex-col gap-1.5">
        <SelectField
          label="Bénéficiaire"
          name="personneSelection"
          required
          options={optionsPersonnes}
          value={personneId}
          onChange={(e) => setPersonneId(e.target.value)}
        />
        <ModalNouvellePersonne
          onPersonneCreee={(personne) => {
            setPersonnes((liste) => [personne, ...liste]);
            setPersonneId(personne.id);
          }}
        />
      </div>

      {personneId === VALEUR_NOUVEAU_BENEFICIAIRE ? (
        <TextField
          label="Nom du bénéficiaire"
          name="beneficiaireNom"
          required
          placeholder="Nom et prénom"
        />
      ) : null}

      <SelectField
        label="Type de visite"
        name="typeVisite"
        required
        options={optionsTypeVisite}
        placeholder="Choisir un type de visite"
      />
      <TextField label="Localisation" name="localisation" placeholder="Quartier, village..." />
      <ChampNotes />

      <Button type="submit" variant="primary" className="w-fit" disabled={pending}>
        {pending ? "Enregistrement en cours..." : "Enregistrer la visite"}
      </Button>
    </form>
  );
}

/** Formulaire d'enregistrement d'une visite de suivi communautaire (creerSuiviCommunautaireAction, module communautaire). */
export function FormulaireSuiviCommunautaire({
  personnes,
}: {
  personnes: PersonneCommunautaireResume[];
}) {
  const [cle, setCle] = useState(0);

  return (
    <Card
      title="Enregistrer une visite"
      description="Chaque visite de terrain est tracée dans votre historique de suivi."
    >
      <ContenuFormulaire
        key={cle}
        personnesInitiales={personnes}
        onNouvelleVisite={() => setCle((valeur) => valeur + 1)}
      />
    </Card>
  );
}
