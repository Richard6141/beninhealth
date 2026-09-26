"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  basculerActifMedicamentAction,
  creerMedicamentAction,
  modifierMedicamentAction,
  type MedicamentReferentielResume,
  type ReferentielMedicamentsActionState,
} from "@/modules/administration/referentiel-medicaments";
import { FORMES_CONNUES } from "@/modules/administration/referentiel-medicaments-catalogue";
import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { SelectField } from "@/components/ui/SelectField";
import { TextField } from "@/components/ui/TextField";

const etatInitial: ReferentielMedicamentsActionState = { error: null, success: false };

const optionsFormes = FORMES_CONNUES.map((forme) => ({ value: forme, label: forme }));

/** Champs communs a la creation et a la modification (structure partagee, pas de logique dupliquee). */
function ChampsMedicament({ valeurs }: { valeurs?: MedicamentReferentielResume }) {
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2">
        <TextField label="Nom commercial" name="nom" required maxLength={100} defaultValue={valeurs?.nom} />
        <TextField
          label="Principe actif (DCI)"
          name="principeActif"
          required
          maxLength={100}
          defaultValue={valeurs?.principeActif}
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <TextField label="Dosage" name="dosage" required maxLength={50} defaultValue={valeurs?.dosage} />
        <SelectField
          label="Forme galénique"
          name="forme"
          options={optionsFormes}
          defaultValue={valeurs?.forme || "comprime"}
        />
        <TextField
          label="Classe thérapeutique"
          name="classeTherapeutique"
          hint="Ex. pénicillines, ains, tétracyclines."
          maxLength={100}
          defaultValue={valeurs?.classeTherapeutique}
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <TextField
          label="Âge minimum (mois)"
          name="ageMinimumMois"
          type="number"
          min={0}
          hint="Laisser vide si aucune restriction d'âge connue."
          defaultValue={valeurs?.ageMinimumMois ?? ""}
        />
        <label className="flex items-center gap-2 self-end pb-2 text-[13px] font-semibold text-encre">
          <input
            type="checkbox"
            name="contreIndiqueGrossesse"
            defaultChecked={valeurs?.contreIndiqueGrossesse ?? false}
          />
          Contre-indiqué pendant la grossesse
        </label>
      </div>
      <TextField
        label="Informations complémentaires"
        name="informationsComplementaires"
        hint="Facultatif, 500 caractères maximum."
        maxLength={500}
        defaultValue={valeurs?.informationsComplementaires}
      />
    </>
  );
}

function FormulaireAjoutMedicament() {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(creerMedicamentAction, etatInitial);
  const [cle, setCle] = useState(0);

  // Reinitialise le formulaire apres un ajout reussi : ajustement d'etat
  // pendant le rendu (comparaison avec l'etat precedent), plutot qu'un appel
  // setState dans un effet, meme pattern que Sidebar.tsx.
  const [etatPrecedent, setEtatPrecedent] = useState(state);
  if (state !== etatPrecedent) {
    setEtatPrecedent(state);
    if (state.success) {
      setCle((valeur) => valeur + 1);
    }
  }

  // router.refresh() reste dans un vrai effet (contrairement au reset local
  // ci-dessus) : c'est un appel externe au composant, pas une mise a jour de
  // son propre etat, jamais correct pendant le rendu.
  useEffect(() => {
    if (state.success) {
      router.refresh();
    }
  }, [state.success, router]);

  return (
    <form key={cle} action={formAction} className="flex flex-col gap-4">
      {state.error ? (
        <Alert level="critical" title="Ajout impossible">
          {state.error}
        </Alert>
      ) : null}
      {state.success ? (
        <Alert level="success" title="Médicament ajouté">
          Le médicament a bien été ajouté au référentiel.
        </Alert>
      ) : null}
      <ChampsMedicament />
      <Button type="submit" variant="primary" size="sm" className="w-fit" disabled={pending}>
        {pending ? "Ajout en cours..." : "Ajouter au référentiel"}
      </Button>
    </form>
  );
}

function FormulaireModificationMedicament({
  medicament,
  onTermine,
}: {
  medicament: MedicamentReferentielResume;
  onTermine: () => void;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(modifierMedicamentAction, etatInitial);

  // Notifie le parent (ferme le formulaire d'edition) apres une modification
  // reussie : un vrai effet de bord externe au composant (il modifie l'etat
  // du PARENT, pas le sien propre), a la difference de la reinitialisation
  // locale de FormulaireAjoutMedicament ci-dessus.
  useEffect(() => {
    if (state.success) {
      onTermine();
      router.refresh();
    }
  }, [state.success, onTermine, router]);

  return (
    <form action={formAction} className="flex flex-col gap-4 rounded-champ border border-bordure bg-plan p-4">
      <input type="hidden" name="id" value={medicament.id} />
      {state.error ? (
        <Alert level="critical" title="Modification impossible">
          {state.error}
        </Alert>
      ) : null}
      <ChampsMedicament valeurs={medicament} />
      <div className="flex flex-wrap gap-2">
        <Button type="submit" variant="primary" size="sm" disabled={pending}>
          {pending ? "Enregistrement..." : "Enregistrer les modifications"}
        </Button>
        <Button type="button" variant="secondary" size="sm" onClick={onTermine}>
          Annuler
        </Button>
      </div>
    </form>
  );
}

function LigneMedicament({ medicament }: { medicament: MedicamentReferentielResume }) {
  const router = useRouter();
  const [enEdition, setEnEdition] = useState(false);
  const [etatBasculement, actionBasculement, pendingBasculement] = useActionState(
    basculerActifMedicamentAction,
    etatInitial
  );

  useEffect(() => {
    if (etatBasculement.success) {
      router.refresh();
    }
  }, [etatBasculement.success, router]);

  if (enEdition) {
    return <FormulaireModificationMedicament medicament={medicament} onTermine={() => setEnEdition(false)} />;
  }

  return (
    <div className="flex flex-col gap-2 border-b border-bordure py-3 last:border-0 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-[14px] font-semibold text-encre">
            {medicament.nom} ({medicament.dosage}, {medicament.forme})
          </p>
          <Badge tone={medicament.actif ? "good" : "neutral"}>{medicament.actif ? "Actif" : "Désactivé"}</Badge>
          {medicament.contreIndiqueGrossesse ? <Badge tone="alert">Grossesse</Badge> : null}
          {medicament.ageMinimumMois !== null ? (
            <Badge tone="alert">Âge min. {medicament.ageMinimumMois} mois</Badge>
          ) : null}
        </div>
        <p className="text-[12px] text-encre-attenuee">
          {medicament.principeActif}
          {medicament.classeTherapeutique ? ` · ${medicament.classeTherapeutique}` : ""}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="secondary" size="sm" onClick={() => setEnEdition(true)}>
          Modifier
        </Button>
        <form action={actionBasculement}>
          <input type="hidden" name="id" value={medicament.id} />
          <Button
            type="submit"
            variant={medicament.actif ? "danger" : "primary"}
            size="sm"
            disabled={pendingBasculement}
          >
            {pendingBasculement ? "..." : medicament.actif ? "Désactiver" : "Activer"}
          </Button>
        </form>
      </div>
    </div>
  );
}

export function SectionReferentielMedicaments({
  referentiel,
}: {
  referentiel: MedicamentReferentielResume[];
}) {
  return (
    <div className="flex flex-col gap-6">
      <Card description="Nouveau médicament ajouté au référentiel, actif par défaut.">
        <FormulaireAjoutMedicament />
      </Card>

      <Card>
        <div className="flex flex-col">
          {referentiel.map((medicament) => (
            <LigneMedicament key={medicament.id} medicament={medicament} />
          ))}
        </div>
      </Card>
    </div>
  );
}
