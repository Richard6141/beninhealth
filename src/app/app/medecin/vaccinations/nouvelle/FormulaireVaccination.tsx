"use client";

import { useActionState, useEffect, useState } from "react";
import type { ChangeEvent } from "react";
import Link from "next/link";
import {
  enregistrerVaccinationAction,
  getVaccinationsDuPatient,
  type VaccinationActionState,
  type VaccinationResume,
} from "@/modules/vaccination/actions";
import {
  LIEUX_VACCINATION,
  OPTIONS_LIEUX_VACCINATION,
  OPTIONS_VOIES_ADMINISTRATION,
  VALEUR_VACCIN_AUTRE,
  type LieuVaccination,
  type OptionReferentiel,
} from "@/modules/vaccination/referentiel";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { SelectField } from "@/components/ui/SelectField";
import { TextField } from "@/components/ui/TextField";
import { ListeVaccinations } from "../ListeVaccinations";

const etatInitial: VaccinationActionState = { error: null, success: false };

export interface PatientPourSelection {
  patientId: string;
  nomComplet: string;
  identifiantSante: string;
}

export interface FormulaireVaccinationProps {
  patients: PatientPourSelection[];
  /** Chaine vide si aucun patient n'est preselectionne par la query string. */
  patientIdPreselectionne: string;
  /** Vaccins actifs du referentiel administrable (F-ADM-04), sans l'option
   * "Autre" : ajoutee ici (voir VALEUR_VACCIN_AUTRE), jamais stockee en base. */
  optionsVaccinsReferentiel: OptionReferentiel[];
}

function dateDuJourISO(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Formulaire d'enregistrement d'une vaccination (F-CLI-11 du pack). Le
 * vaccin est choisi dans un referentiel simple ; l'option "Autre" ouvre un
 * champ de saisie libre, dont le contenu devient la valeur reellement
 * envoyee au serveur (jamais le mot "Autre" tel quel).
 *
 * Tous les champs sont geres en etat React controle (meme approche que
 * FormulairePrescription) : l'avertissement de doublon (meme vaccin, meme
 * dose, deja enregistre pour ce patient et pas retire) est calcule cote
 * client des la saisie, a partir de l'historique du patient choisi
 * (getVaccinationsDuPatient), et bloque le bouton d'envoi tant que la case
 * de confirmation n'est pas cochee : une seule soumission reelle au serveur
 * est necessaire. Le controle serveur (enregistrerVaccinationAction) reste
 * la seule autorite reelle et revalide tout independamment.
 *
 * Meme mecanisme d'avertissement pour l'age/intervalle minimum du calendrier
 * PEV (controlerAgeVaccination, referentiel.ts), a une difference pres : la
 * date de naissance du patient n'est connue que du serveur, donc pas de
 * pre-detection cote client possible ici (contrairement au doublon).
 * L'avertissement n'apparait qu'apres un premier envoi refuse par le serveur
 * (state.avertissementAge), avec la meme case de confirmation a cocher avant
 * de pouvoir renvoyer.
 */
export function FormulaireVaccination({
  patients,
  patientIdPreselectionne,
  optionsVaccinsReferentiel,
}: FormulaireVaccinationProps) {
  const optionsVaccins: OptionReferentiel[] = [
    ...optionsVaccinsReferentiel,
    { value: VALEUR_VACCIN_AUTRE, label: VALEUR_VACCIN_AUTRE },
  ];
  const [state, formAction, pending] = useActionState(enregistrerVaccinationAction, etatInitial);
  const [patientId, setPatientId] = useState(patientIdPreselectionne);
  const [vaccinSelectionne, setVaccinSelectionne] = useState("");
  const [autreVaccin, setAutreVaccin] = useState("");
  const [numeroDose, setNumeroDose] = useState("1");
  const [dateAdministration, setDateAdministration] = useState(dateDuJourISO());
  const [numeroLot, setNumeroLot] = useState("");
  const [siteInjection, setSiteInjection] = useState("");
  const [voie, setVoie] = useState("");
  const [lieu, setLieu] = useState<LieuVaccination>(LIEUX_VACCINATION[0]);
  const [nomCampagne, setNomCampagne] = useState("");
  // Cle de la combinaison (patient, vaccin, dose) pour laquelle la case de
  // confirmation a ete cochee : comparee a la combinaison actuelle a chaque
  // rendu, plutot qu'un useEffect qui reinitialiserait confirmerDoublon a
  // chaque changement (setState synchrone dans un effet, deconseille par
  // React - voir react-hooks/set-state-in-effect).
  const [confirmationDoublon, setConfirmationDoublon] = useState({ cle: "", confirme: false });
  // Meme principe que confirmationDoublon, mais pour l'avertissement d'age
  // (F-CLI-11) : contrairement au doublon, ce controle a besoin de la date de
  // naissance du patient, connue seulement du serveur, donc pas de
  // pre-detection cote client possible ici. L'avertissement n'apparait qu'apres
  // un premier essai d'envoi refuse par enregistrerVaccinationAction
  // (state.avertissementAge), avec la meme case de confirmation a cocher.
  const [confirmationAge, setConfirmationAge] = useState({ cle: "", confirme: false });
  const [vaccinationsExistantes, setVaccinationsExistantes] = useState<VaccinationResume[]>([]);
  const [historique, setHistorique] = useState<VaccinationResume[] | null>(null);

  const optionsPatients = patients.map((patient) => ({
    value: patient.patientId,
    label: `${patient.nomComplet} (${patient.identifiantSante})`,
  }));

  const vaccinFinal = vaccinSelectionne === VALEUR_VACCIN_AUTRE ? autreVaccin.trim() : vaccinSelectionne;
  const numeroDoseNombre = Number(numeroDose);
  const cleDoublon = `${patientId}|${vaccinFinal}|${numeroDose}`;
  const confirmerDoublon = confirmationDoublon.cle === cleDoublon && confirmationDoublon.confirme;

  const cleAge = `${patientId}|${vaccinFinal}|${numeroDose}|${dateAdministration}`;
  const confirmerAge = confirmationAge.cle === cleAge && confirmationAge.confirme;
  const avertissementAgeDetecte = state.avertissementAge === true;

  useEffect(() => {
    if (!patientId) {
      return;
    }

    let annule = false;
    getVaccinationsDuPatient(patientId).then((liste) => {
      if (!annule) setVaccinationsExistantes(liste);
    });

    return () => {
      annule = true;
    };
  }, [patientId]);

  useEffect(() => {
    if (state.success && patientId) {
      getVaccinationsDuPatient(patientId).then(setHistorique);
    }
  }, [state.success, patientId]);

  const doublonDetecte =
    vaccinFinal.length > 0 &&
    Number.isInteger(numeroDoseNombre) &&
    numeroDoseNombre > 0 &&
    vaccinationsExistantes.some(
      (vaccination) =>
        !vaccination.saisieParErreur &&
        vaccination.vaccin === vaccinFinal &&
        vaccination.numeroDose === numeroDoseNombre
    );

  if (state.success) {
    return (
      <div className="flex flex-col gap-6">
        <Card>
          <div className="flex flex-col gap-4">
            <Alert level="success" title="Vaccination enregistree">
              La vaccination a bien ete enregistree. Rappel (RG-CLI-100) :
              une vaccination est definitive, toute erreur de saisie se
              corrige par un retrait motive.
            </Alert>
            <Link
              href="/app/medecin/patients"
              className="w-fit text-[13px] font-semibold text-accent hover:underline"
            >
              Retour a mes patients
            </Link>
          </div>
        </Card>
        {historique ? <ListeVaccinations vaccinations={historique} /> : null}
      </div>
    );
  }

  return (
    <Card
      title="Nouvelle vaccination"
      description="Renseignez le patient et les informations de l'acte vaccinal."
    >
      <form action={formAction} aria-busy={pending} className="flex flex-col gap-6">
        <input type="hidden" name="patientId" value={patientId} />
        <input type="hidden" name="vaccin" value={vaccinFinal} />

        {state.error && !avertissementAgeDetecte ? (
          <Alert level="critical" title="Vaccination non enregistree">
            {state.error}
          </Alert>
        ) : null}

        <div className="flex flex-col gap-2">
          <SelectField
            label="Patient"
            required
            options={optionsPatients}
            placeholder="Choisir un patient"
            value={patientId}
            onChange={(event: ChangeEvent<HTMLSelectElement>) => setPatientId(event.target.value)}
          />
          {patients.length === 0 ? (
            <p className="text-[13px] text-encre-attenuee">
              Aucun patient ne vous a encore accorde d&apos;acces a son
              dossier.
            </p>
          ) : null}
        </div>

        <SelectField
          label="Vaccin"
          required
          options={optionsVaccins}
          placeholder="Choisir un vaccin"
          value={vaccinSelectionne}
          onChange={(event: ChangeEvent<HTMLSelectElement>) => setVaccinSelectionne(event.target.value)}
        />

        {vaccinSelectionne === VALEUR_VACCIN_AUTRE ? (
          <TextField
            label="Preciser le vaccin"
            required
            value={autreVaccin}
            onChange={(event: ChangeEvent<HTMLInputElement>) => setAutreVaccin(event.target.value)}
          />
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="Numero de dose"
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
            label="Numero de lot"
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
            placeholder="Ex. Bras gauche, deltoide"
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

        {doublonDetecte ? (
          <div className="flex flex-col gap-3">
            <Alert level="warning" title="Dose deja enregistree">
              La dose {numeroDose} du vaccin {vaccinFinal} est deja
              enregistree pour ce patient.
            </Alert>
            <label className="flex items-center gap-2 text-[13px] font-semibold text-encre">
              <input
                type="checkbox"
                name="confirmerDoublon"
                checked={confirmerDoublon}
                onChange={(event) =>
                  setConfirmationDoublon({ cle: cleDoublon, confirme: event.target.checked })
                }
              />
              Confirmer l&apos;enregistrement malgre la dose deja existante
            </label>
          </div>
        ) : null}

        {avertissementAgeDetecte ? (
          <div className="flex flex-col gap-3">
            <Alert level="warning" title="Ecart au calendrier vaccinal habituel">
              {state.error}
            </Alert>
            <label className="flex items-center gap-2 text-[13px] font-semibold text-encre">
              <input
                type="checkbox"
                name="confirmerAge"
                checked={confirmerAge}
                onChange={(event) =>
                  setConfirmationAge({ cle: cleAge, confirme: event.target.checked })
                }
              />
              Confirmer l&apos;enregistrement malgre cet ecart au calendrier
            </label>
          </div>
        ) : null}

        <Button
          type="submit"
          variant="primary"
          className="w-fit"
          disabled={
            pending ||
            !patientId ||
            !vaccinFinal ||
            (lieu === "campagne" && nomCampagne.trim().length < 3) ||
            (doublonDetecte && !confirmerDoublon) ||
            (avertissementAgeDetecte && !confirmerAge)
          }
        >
          {pending ? "Enregistrement en cours..." : "Enregistrer la vaccination"}
        </Button>
      </form>
    </Card>
  );
}
