"use client";

import { useActionState, useState } from "react";
import type { ChangeEvent } from "react";
import {
  enregistrerVaccinationCommunautaireAction,
  type VaccinationActionState,
} from "@/modules/vaccination/actions";
import {
  OPTIONS_LIEUX_VACCINATION,
  OPTIONS_VACCINS,
  OPTIONS_VOIES_ADMINISTRATION,
  VALEUR_VACCIN_AUTRE,
  type LieuVaccination,
} from "@/modules/vaccination/referentiel";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { SelectField } from "@/components/ui/SelectField";
import { TextField } from "@/components/ui/TextField";

const etatInitial: VaccinationActionState = { error: null, success: false };

function dateDuJourISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export interface FormulaireVaccinationCommunautaireProps {
  personneId: string;
  onEnregistree: () => void;
}

/**
 * Sous-formulaire des donnees structurees d'une vaccination en campagne /
 * strategie avancee (F-COM-04 du pack), affiche par FormulaireSuiviCommunautaire
 * quand l'agent choisit le type de visite "Vaccination" ET une personne
 * enregistree (jamais pour un beneficiaire en texte libre, qui n'a pas de
 * fiche a laquelle rattacher une vaccination structuree - voir la docstring
 * de enregistrerVaccinationCommunautaireAction).
 *
 * Server Action distincte de creerSuiviCommunautaireAction : cette derniere
 * garde son role inchange (trace la visite dans l'historique de suivi), ce
 * formulaire cree EN PLUS une vraie ligne Vaccination (carnet structure,
 * controles d'age et de doublon, retrait motive possible ensuite).
 */
export function FormulaireVaccinationCommunautaire({
  personneId,
  onEnregistree,
}: FormulaireVaccinationCommunautaireProps) {
  const [state, formAction, pending] = useActionState(enregistrerVaccinationCommunautaireAction, etatInitial);
  const [vaccinSelectionne, setVaccinSelectionne] = useState("");
  const [autreVaccin, setAutreVaccin] = useState("");
  const [numeroDose, setNumeroDose] = useState("1");
  const [dateAdministration, setDateAdministration] = useState(dateDuJourISO());
  const [numeroLot, setNumeroLot] = useState("");
  const [siteInjection, setSiteInjection] = useState("");
  const [voie, setVoie] = useState("");
  const [lieu, setLieu] = useState<LieuVaccination>("campagne");
  const [nomCampagne, setNomCampagne] = useState("");
  const [confirmerDoublon, setConfirmerDoublon] = useState(false);
  const [confirmerAge, setConfirmerAge] = useState(false);

  const vaccinFinal = vaccinSelectionne === VALEUR_VACCIN_AUTRE ? autreVaccin.trim() : vaccinSelectionne;

  if (state.success) {
    return (
      <Alert level="success" title="Vaccination enregistrée">
        La vaccination a bien été ajoutée au carnet de cette personne.
        <Button type="button" variant="secondary" size="sm" className="mt-3 w-fit" onClick={onEnregistree}>
          Enregistrer une autre vaccination
        </Button>
      </Alert>
    );
  }

  return (
    <form action={formAction} aria-busy={pending} className="flex flex-col gap-4 rounded-champ border border-bordure bg-plan p-4">
      <p className="text-[15px] font-semibold text-encre">Détails de la vaccination</p>

      <input type="hidden" name="personneId" value={personneId} />
      <input type="hidden" name="vaccin" value={vaccinFinal} />

      {state.error && !state.avertissementDoublon && !state.avertissementAge ? (
        <Alert level="critical" title="Vaccination non enregistrée">
          {state.error}
        </Alert>
      ) : null}

      <SelectField
        label="Vaccin"
        required
        options={OPTIONS_VACCINS}
        placeholder="Choisir un vaccin"
        value={vaccinSelectionne}
        onChange={(event: ChangeEvent<HTMLSelectElement>) => setVaccinSelectionne(event.target.value)}
      />
      {vaccinSelectionne === VALEUR_VACCIN_AUTRE ? (
        <TextField
          label="Préciser le vaccin"
          required
          value={autreVaccin}
          onChange={(event: ChangeEvent<HTMLInputElement>) => setAutreVaccin(event.target.value)}
        />
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          label="Numéro de dose"
          name="numeroDose"
          type="number"
          min={1}
          required
          value={numeroDose}
          onChange={(event: ChangeEvent<HTMLInputElement>) => setNumeroDose(event.target.value)}
        />
        <TextField
          label="Date d'administration"
          name="dateAdministration"
          type="date"
          required
          value={dateAdministration}
          max={dateDuJourISO()}
          onChange={(event: ChangeEvent<HTMLInputElement>) => setDateAdministration(event.target.value)}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          label="Numéro de lot"
          name="numeroLot"
          required
          placeholder="Ex. LOT-2026-0456"
          value={numeroLot}
          onChange={(event: ChangeEvent<HTMLInputElement>) => setNumeroLot(event.target.value)}
        />
        <TextField
          label="Site d'injection"
          name="siteInjection"
          required
          placeholder="Ex. Bras gauche, deltoïde"
          value={siteInjection}
          onChange={(event: ChangeEvent<HTMLInputElement>) => setSiteInjection(event.target.value)}
        />
      </div>

      <SelectField
        label="Voie d'administration"
        name="voie"
        required
        options={OPTIONS_VOIES_ADMINISTRATION}
        placeholder="Choisir une voie"
        value={voie}
        onChange={(event: ChangeEvent<HTMLSelectElement>) => setVoie(event.target.value)}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField
          label="Lieu"
          name="lieu"
          options={OPTIONS_LIEUX_VACCINATION}
          value={lieu}
          onChange={(event: ChangeEvent<HTMLSelectElement>) => setLieu(event.target.value as LieuVaccination)}
        />
        {lieu === "campagne" ? (
          <TextField
            label="Nom de la campagne"
            name="nomCampagne"
            required
            placeholder="Ex. Riposte rougeole Cotonou"
            value={nomCampagne}
            onChange={(event: ChangeEvent<HTMLInputElement>) => setNomCampagne(event.target.value)}
          />
        ) : null}
      </div>

      {state.avertissementDoublon ? (
        <div className="flex flex-col gap-3">
          <Alert level="warning" title="Dose déjà enregistrée">
            {state.error}
          </Alert>
          <label className="flex items-center gap-2 text-[13px] font-semibold text-encre">
            <input
              type="checkbox"
              name="confirmerDoublon"
              checked={confirmerDoublon}
              onChange={(event) => setConfirmerDoublon(event.target.checked)}
            />
            Confirmer l&apos;enregistrement malgré la dose déjà existante
          </label>
        </div>
      ) : null}

      {state.avertissementAge ? (
        <div className="flex flex-col gap-3">
          <Alert level="warning" title="Écart au calendrier vaccinal habituel">
            {state.error}
          </Alert>
          <label className="flex items-center gap-2 text-[13px] font-semibold text-encre">
            <input
              type="checkbox"
              name="confirmerAge"
              checked={confirmerAge}
              onChange={(event) => setConfirmerAge(event.target.checked)}
            />
            Confirmer l&apos;enregistrement malgré cet écart au calendrier
          </label>
        </div>
      ) : null}

      <Button
        type="submit"
        variant="primary"
        size="sm"
        className="w-fit"
        disabled={
          pending ||
          !vaccinFinal ||
          !numeroLot ||
          !siteInjection ||
          !voie ||
          (lieu === "campagne" && nomCampagne.trim().length < 3) ||
          (Boolean(state.avertissementDoublon) && !confirmerDoublon) ||
          (Boolean(state.avertissementAge) && !confirmerAge)
        }
      >
        {pending ? "Enregistrement en cours..." : "Enregistrer la vaccination"}
      </Button>
    </form>
  );
}
