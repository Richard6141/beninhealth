"use client";

import { useActionState } from "react";
import { Trash2 } from "lucide-react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { SelectField } from "@/components/ui/SelectField";
import { TextField } from "@/components/ui/TextField";
import {
  ajouterCreneauAction,
  supprimerCreneauAction,
  type CreneauDisponibiliteResume,
  type DisponibiliteActionState,
} from "@/modules/facility/disponibilites";

const etatInitial: DisponibiliteActionState = { error: null, success: false };

const JOURS_SEMAINE = [
  { value: "1", label: "Lundi" },
  { value: "2", label: "Mardi" },
  { value: "3", label: "Mercredi" },
  { value: "4", label: "Jeudi" },
  { value: "5", label: "Vendredi" },
  { value: "6", label: "Samedi" },
  { value: "0", label: "Dimanche" },
];

const LIBELLE_JOUR: Record<number, string> = {
  0: "Dimanche",
  1: "Lundi",
  2: "Mardi",
  3: "Mercredi",
  4: "Jeudi",
  5: "Vendredi",
  6: "Samedi",
};

interface FormulaireCreneauxProps {
  professionnelId: string;
  creneaux: CreneauDisponibiliteResume[];
}

/**
 * Ecran F-ETA-05 (perimetre reduit, voir src/modules/facility/disponibilites.ts) :
 * ajout et suppression de creneaux hebdomadaires recurrents. Toutes les
 * heures affichees et saisies sont en heure locale Africa/Porto-Novo
 * (RG-ETA-43), la conversion UTC+1 est geree cote serveur.
 */
export function FormulaireCreneaux({ professionnelId, creneaux }: FormulaireCreneauxProps) {
  const [etatAjout, actionAjout, ajoutEnCours] = useActionState(ajouterCreneauAction, etatInitial);
  const [etatSuppression, actionSuppression, suppressionEnCours] = useActionState(supprimerCreneauAction, etatInitial);

  return (
    <div className="flex flex-col gap-6">
      <form action={actionAjout} className="flex flex-col gap-4 rounded-champ border border-bordure bg-plan p-4">
        <input type="hidden" name="professionnelId" value={professionnelId} />
        {etatAjout.error ? (
          <Alert level="critical" title="Ajout impossible">
            {etatAjout.error}
          </Alert>
        ) : null}
        <div className="grid gap-3 sm:grid-cols-3">
          <SelectField label="Jour" name="jourSemaine" required options={JOURS_SEMAINE} defaultValue="1" />
          <TextField label="Heure de début" name="heureDebut" type="time" required defaultValue="08:00" />
          <TextField label="Heure de fin" name="heureFin" type="time" required defaultValue="12:00" />
        </div>
        <Button type="submit" variant="primary" className="w-fit" disabled={ajoutEnCours}>
          {ajoutEnCours ? "Ajout..." : "Ajouter ce créneau"}
        </Button>
      </form>

      {etatSuppression.error ? (
        <Alert level="critical" title="Suppression impossible">
          {etatSuppression.error}
        </Alert>
      ) : null}

      {creneaux.length === 0 ? (
        <p className="text-[13px] text-encre-attenuee">
          Aucun créneau défini pour le moment : ce professionnel reste réservable à toute heure (comportement par
          défaut tant qu&apos;aucun créneau n&apos;est configuré).
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {creneaux.map((creneau) => (
            <li
              key={creneau.id}
              className="flex items-center justify-between gap-3 rounded-champ border border-bordure bg-surface px-3 py-2 text-[13px]"
            >
              <span className="text-encre">
                <span className="font-semibold">{LIBELLE_JOUR[creneau.jourSemaine]}</span> · {creneau.heureDebut} à{" "}
                {creneau.heureFin}
              </span>
              <form action={actionSuppression}>
                <input type="hidden" name="creneauId" value={creneau.id} />
                <button
                  type="submit"
                  disabled={suppressionEnCours}
                  aria-label={`Supprimer le créneau du ${LIBELLE_JOUR[creneau.jourSemaine]} ${creneau.heureDebut}-${creneau.heureFin}`}
                  className="flex h-8 w-8 items-center justify-center rounded-champ text-encre-attenuee transition-colors motion-reduce:transition-none hover:bg-critique-clair hover:text-critique"
                >
                  <Trash2 size={15} aria-hidden="true" />
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
