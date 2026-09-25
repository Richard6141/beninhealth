"use client";

import { useActionState, useId, useState } from "react";
import type { ChangeEvent } from "react";
import Link from "next/link";
import {
  enregistrerPriseEnChargeAction,
  type SoinsActionState,
} from "@/modules/soins/actions";
import { LIBELLES_PRIORITE_TRI, PRIORITES_TRI, type PrioriteTri } from "@/modules/soins/priorites";
import {
  ageAnnees,
  calculerIMC,
  controlerFrequenceRespiratoire,
  controlerGlycemie,
  controlerIMC,
  controlerPoids,
  controlerPouls,
  controlerSaturationOxygene,
  controlerTaille,
  controlerTemperature,
  controlerTensionDiastolique,
  controlerTensionSystolique,
  type ResultatControleConstante,
} from "@/modules/clinical/controles-constantes";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { SelectField } from "@/components/ui/SelectField";
import { TextField } from "@/components/ui/TextField";

const etatInitial: SoinsActionState = { error: null, success: false };

interface ConstantesFormulaire {
  temperatureCelsius: string;
  pouls: string;
  tensionSystolique: string;
  tensionDiastolique: string;
  frequenceRespiratoire: string;
  saturationOxygene: string;
  poidsKg: string;
  tailleCm: string;
  glycemieGL: string;
}

const CONSTANTES_VIDES: ConstantesFormulaire = {
  temperatureCelsius: "",
  pouls: "",
  tensionSystolique: "",
  tensionDiastolique: "",
  frequenceRespiratoire: "",
  saturationOxygene: "",
  poidsKg: "",
  tailleCm: "",
  glycemieGL: "",
};

/** Champ constante vitale : label, unite et controle en direct (meme convention que FormulaireConsultation). */
function ChampConstante({
  label,
  name,
  unite,
  valeur,
  onChange,
  controle,
}: {
  label: string;
  name: string;
  unite: string;
  valeur: string;
  onChange: (valeur: string) => void;
  controle: ResultatControleConstante | null;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <TextField
        label={label}
        name={name}
        type="number"
        step="any"
        unit={unite}
        value={valeur}
        onChange={(event: ChangeEvent<HTMLInputElement>) => onChange(event.target.value)}
      />
      {controle && controle.statut !== "ok" ? (
        <p className={controle.statut === "refus" ? "text-[12px] text-critique" : "text-[12px] text-vigilance"}>
          {controle.message}
        </p>
      ) : null}
    </div>
  );
}

/** Note de soins : soins realises, pansements, injections, surveillance (F-CLI-12 du pack). */
function ChampNoteSoins({ value, onChange }: { value: string; onChange: (valeur: string) => void }) {
  const fieldId = useId();
  const hintId = `${fieldId}-hint`;

  return (
    <div className="flex flex-col gap-1.5">
      <label
        htmlFor={fieldId}
        className="flex flex-wrap items-baseline gap-1.5 text-[18px] font-semibold text-encre"
      >
        Note de soins
        <span className="text-critique" aria-hidden="true">
          *
        </span>
      </label>
      <p id={hintId} className="text-[13px] text-encre-secondaire">
        Soins realises, pansements, injections, surveillance particuliere.
      </p>
      <textarea
        id={fieldId}
        name="noteSoins"
        rows={4}
        required
        aria-describedby={hintId}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-champ border border-bordure-forte bg-surface px-3 py-2 text-[16px] text-encre transition-colors motion-reduce:transition-none placeholder:text-encre-attenuee focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2"
      />
    </div>
  );
}

function BandeauAllergies({ allergies }: { allergies: string[] }) {
  if (allergies.length === 0) {
    return null;
  }

  return (
    <Alert level="critical" title="Allergies connues du patient">
      {allergies.join(", ")}
    </Alert>
  );
}

export interface FormulairePriseEnChargeProps {
  patientId: string;
  patientNomComplet: string;
  patientIdentifiantSante: string;
  patientAllergies: string[];
  patientDateNaissance: string;
  rendezVousId: string;
}

/**
 * Formulaire de prise en charge infirmiere (F-CLI-12 du pack) : constantes
 * vitales (memes controles que FormulaireConsultation, reutilises depuis
 * controles-constantes.ts), priorite de tri et note de soins. Contrairement
 * a la consultation medicale, il n'y a pas de brouillon : un seul
 * enregistrement, transmis a enregistrerPriseEnChargeAction.
 */
export function FormulairePriseEnCharge({
  patientId,
  patientNomComplet,
  patientIdentifiantSante,
  patientAllergies,
  patientDateNaissance,
  rendezVousId,
}: FormulairePriseEnChargeProps) {
  const [state, formAction, pending] = useActionState(enregistrerPriseEnChargeAction, etatInitial);
  const [constantes, setConstantes] = useState<ConstantesFormulaire>(CONSTANTES_VIDES);
  const [confirmerAlerte, setConfirmerAlerte] = useState(false);
  const [prioriteTri, setPrioriteTri] = useState<PrioriteTri>("standard");
  const [noteSoins, setNoteSoins] = useState("");

  function modifierConstante(champ: keyof ConstantesFormulaire, valeur: string) {
    setConstantes((actuelles) => ({ ...actuelles, [champ]: valeur }));
  }

  const dateNaissance = new Date(patientDateNaissance);
  const maintenant = new Date();
  const age = ageAnnees(dateNaissance, maintenant);

  function versNombre(valeur: string): number | undefined {
    if (valeur.trim() === "") return undefined;
    const nombre = Number(valeur);
    return Number.isNaN(nombre) ? undefined : nombre;
  }

  const temperature = versNombre(constantes.temperatureCelsius);
  const pouls = versNombre(constantes.pouls);
  const tensionSystolique = versNombre(constantes.tensionSystolique);
  const tensionDiastolique = versNombre(constantes.tensionDiastolique);
  const frequenceRespiratoire = versNombre(constantes.frequenceRespiratoire);
  const saturationOxygene = versNombre(constantes.saturationOxygene);
  const poids = versNombre(constantes.poidsKg);
  const taille = versNombre(constantes.tailleCm);
  const glycemie = versNombre(constantes.glycemieGL);

  const controleTemperature = temperature !== undefined ? controlerTemperature(temperature) : null;
  const controlePouls = pouls !== undefined ? controlerPouls(pouls, dateNaissance, maintenant) : null;
  const controleTensionSystolique =
    tensionSystolique !== undefined && tensionDiastolique !== undefined
      ? controlerTensionSystolique(tensionSystolique, tensionDiastolique, dateNaissance, maintenant)
      : null;
  const controleTensionDiastolique =
    tensionDiastolique !== undefined ? controlerTensionDiastolique(tensionDiastolique) : null;
  const controleFrequenceRespiratoire =
    frequenceRespiratoire !== undefined
      ? controlerFrequenceRespiratoire(frequenceRespiratoire, dateNaissance, maintenant)
      : null;
  const controleSaturation = saturationOxygene !== undefined ? controlerSaturationOxygene(saturationOxygene) : null;
  const controlePoids = poids !== undefined ? controlerPoids(poids) : null;
  const controleTaille = taille !== undefined ? controlerTaille(taille) : null;
  const controleGlycemie = glycemie !== undefined ? controlerGlycemie(glycemie) : null;
  const imc = calculerIMC(poids ?? null, taille ?? null);
  const controleIMC = imc !== null ? controlerIMC(imc) : null;

  const tousLesControles = [
    controleTemperature,
    controlePouls,
    controleTensionSystolique,
    controleTensionDiastolique,
    controleFrequenceRespiratoire,
    controleSaturation,
    controlePoids,
    controleTaille,
    controleGlycemie,
    controleIMC,
  ].filter((controle): controle is ResultatControleConstante => controle !== null);

  const uneValeurRefusee = tousLesControles.some((controle) => controle.statut === "refus");
  const uneValeurEnAlerte = tousLesControles.some((controle) => controle.statut === "alerte");
  const blocageConstantesNonResolu = uneValeurRefusee || (uneValeurEnAlerte && !confirmerAlerte);
  const peutEnregistrer = noteSoins.trim().length > 0 && !blocageConstantesNonResolu;

  const erreurConsentement =
    state.error !== null && state.error.toLowerCase().includes("consentement");

  if (state.success) {
    return (
      <Card>
        <div className="flex flex-col gap-4">
          <Alert level="success" title="Prise en charge enregistree">
            Les constantes et la note de soins de {patientNomComplet} ont bien
            ete enregistrees.
          </Alert>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/app/medecin/soins"
              className="text-[13px] font-semibold text-accent hover:underline"
            >
              Retour a la liste d&apos;attente
            </Link>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card
      title={`Prise en charge de ${patientNomComplet}`}
      description={
        patientIdentifiantSante
          ? `Identifiant sante : ${patientIdentifiantSante} · ${age} an${age > 1 ? "s" : ""}`
          : undefined
      }
    >
      <form action={formAction} aria-busy={pending} className="flex flex-col gap-5">
        <input type="hidden" name="patientId" value={patientId} />
        <input type="hidden" name="rendezVousId" value={rendezVousId} />

        <BandeauAllergies allergies={patientAllergies} />

        {state.error ? (
          erreurConsentement ? (
            <Alert level="warning" title="Consentement necessaire">
              {state.error} Demandez au patient de vous accorder l&apos;acces
              a son dossier depuis son espace patient, puis reessayez.
            </Alert>
          ) : (
            <Alert level="critical" title="Prise en charge non enregistree">
              {state.error}
            </Alert>
          )
        ) : null}

        <SelectField
          label="Priorite de tri"
          name="prioriteTri"
          required
          options={PRIORITES_TRI.map((priorite) => ({
            value: priorite,
            label: LIBELLES_PRIORITE_TRI[priorite],
          }))}
          value={prioriteTri}
          onChange={(event) => setPrioriteTri(event.target.value as PrioriteTri)}
        />

        <div className="flex flex-col gap-3">
          <p className="flex flex-wrap items-baseline gap-1.5 text-[18px] font-semibold text-encre">
            Constantes
            <span className="text-[13px] font-normal text-encre-attenuee">(facultatif)</span>
          </p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <ChampConstante
              label="Temperature"
              name="temperatureCelsius"
              unite="°C"
              valeur={constantes.temperatureCelsius}
              onChange={(valeur) => modifierConstante("temperatureCelsius", valeur)}
              controle={controleTemperature}
            />
            <ChampConstante
              label="Pouls"
              name="pouls"
              unite="bpm"
              valeur={constantes.pouls}
              onChange={(valeur) => modifierConstante("pouls", valeur)}
              controle={controlePouls}
            />
            <ChampConstante
              label="Frequence respiratoire"
              name="frequenceRespiratoire"
              unite="/min"
              valeur={constantes.frequenceRespiratoire}
              onChange={(valeur) => modifierConstante("frequenceRespiratoire", valeur)}
              controle={controleFrequenceRespiratoire}
            />
            <ChampConstante
              label="Tension systolique"
              name="tensionSystolique"
              unite="mmHg"
              valeur={constantes.tensionSystolique}
              onChange={(valeur) => modifierConstante("tensionSystolique", valeur)}
              controle={controleTensionSystolique}
            />
            <ChampConstante
              label="Tension diastolique"
              name="tensionDiastolique"
              unite="mmHg"
              valeur={constantes.tensionDiastolique}
              onChange={(valeur) => modifierConstante("tensionDiastolique", valeur)}
              controle={controleTensionDiastolique}
            />
            <ChampConstante
              label="Saturation en oxygene"
              name="saturationOxygene"
              unite="%"
              valeur={constantes.saturationOxygene}
              onChange={(valeur) => modifierConstante("saturationOxygene", valeur)}
              controle={controleSaturation}
            />
            <ChampConstante
              label="Poids"
              name="poidsKg"
              unite="kg"
              valeur={constantes.poidsKg}
              onChange={(valeur) => modifierConstante("poidsKg", valeur)}
              controle={controlePoids}
            />
            <ChampConstante
              label="Taille"
              name="tailleCm"
              unite="cm"
              valeur={constantes.tailleCm}
              onChange={(valeur) => modifierConstante("tailleCm", valeur)}
              controle={controleTaille}
            />
            <ChampConstante
              label="Glycemie capillaire"
              name="glycemieGL"
              unite="g/L"
              valeur={constantes.glycemieGL}
              onChange={(valeur) => modifierConstante("glycemieGL", valeur)}
              controle={controleGlycemie}
            />
          </div>

          {imc !== null ? (
            <p
              className={
                controleIMC && controleIMC.statut === "alerte"
                  ? "text-[13px] text-vigilance"
                  : "text-[13px] text-encre-secondaire"
              }
            >
              IMC calcule : {imc.toFixed(1)}
              {controleIMC && controleIMC.statut === "alerte" ? ` (${controleIMC.message})` : ""}
            </p>
          ) : null}

          {uneValeurEnAlerte ? (
            <div className="flex flex-col gap-2">
              <Alert level="warning" title="Valeur(s) inhabituelle(s)">
                Au moins une constante saisie est en dehors de la plage
                habituelle. Verifiez la saisie, ou confirmez pour
                l&apos;enregistrer telle quelle.
              </Alert>
              <label className="flex items-center gap-2 text-[13px] font-semibold text-encre">
                <input
                  type="checkbox"
                  name="confirmerAlerteConstantes"
                  checked={confirmerAlerte}
                  onChange={(event) => setConfirmerAlerte(event.target.checked)}
                />
                Confirmer les valeurs saisies malgre l&apos;avertissement
              </label>
            </div>
          ) : null}
        </div>

        <ChampNoteSoins value={noteSoins} onChange={setNoteSoins} />

        <Button type="submit" variant="primary" className="w-fit" disabled={pending || !peutEnregistrer}>
          {pending ? "Enregistrement..." : "Enregistrer la prise en charge"}
        </Button>
      </form>
    </Card>
  );
}
