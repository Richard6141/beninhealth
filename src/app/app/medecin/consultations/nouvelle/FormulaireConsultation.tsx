"use client";

import { useActionState, useId, useState } from "react";
import type { ChangeEvent, ReactNode } from "react";
import Link from "next/link";
import {
  enregistrerConsultationAction,
  type BrouillonConsultation,
  type ClinicalActionState,
} from "@/modules/clinical/actions";
import { SelecteurDiagnosticCim10 } from "./SelecteurDiagnosticCim10";
import type { DiagnosticCim10Propose } from "@/modules/administration/referentiel-cim10";
import { Badge } from "@/components/ui/Badge";
import type { PriseEnChargeInfirmiereResume } from "@/modules/soins/actions";
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
import { TextField } from "@/components/ui/TextField";

const etatInitial: ClinicalActionState = { error: null, success: false };

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

/** Convertit un nombre nullable stocke en base en valeur de champ texte, pour pre-remplir un brouillon repris. */
function versChamp(valeur: number | null): string {
  return valeur === null ? "" : String(valeur);
}

interface SourceConstantes {
  temperatureCelsius: number | null;
  pouls: number | null;
  tensionSystolique: number | null;
  tensionDiastolique: number | null;
  frequenceRespiratoire: number | null;
  saturationOxygene: number | null;
  poidsKg: number | null;
  tailleCm: number | null;
  glycemieGL: number | null;
}

/**
 * Source des constantes initiales : un brouillon deja ouvert par ce medecin
 * (RG-CLI-40) a priorite, sinon une prise en charge infirmiere non recuperee
 * (F-CLI-12) pre-remplit une premiere saisie.
 */
function constantesInitiales(
  brouillon: SourceConstantes | null,
  priseEnCharge: SourceConstantes | null
): ConstantesFormulaire {
  const source = brouillon ?? priseEnCharge;
  if (!source) return CONSTANTES_VIDES;

  return {
    temperatureCelsius: versChamp(source.temperatureCelsius),
    pouls: versChamp(source.pouls),
    tensionSystolique: versChamp(source.tensionSystolique),
    tensionDiastolique: versChamp(source.tensionDiastolique),
    frequenceRespiratoire: versChamp(source.frequenceRespiratoire),
    saturationOxygene: versChamp(source.saturationOxygene),
    poidsKg: versChamp(source.poidsKg),
    tailleCm: versChamp(source.tailleCm),
    glycemieGL: versChamp(source.glycemieGL),
  };
}

/** Champ constante vitale : label, unite, hint (plage acceptee) et controle en direct (F-CLI-06). */
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

/**
 * Champ texte multiligne (un element par ligne), meme structure visuelle que
 * TextField : le design system ne fournit pas de composant "textarea" dedie
 * (voir src/app/app/patient/dossier/FormulaireDossier.tsx, meme convention
 * pour allergies/antecedents/maladiesChroniques).
 */
function ChampTexteMultiligne({
  label,
  name,
  hint,
  value,
  onChange,
  required = false,
  rows = 4,
}: {
  label: string;
  name: string;
  hint: string;
  value: string;
  onChange: (valeur: string) => void;
  required?: boolean;
  rows?: number;
}): ReactNode {
  const fieldId = useId();
  const hintId = `${fieldId}-hint`;

  return (
    <div className="flex flex-col gap-1.5">
      <label
        htmlFor={fieldId}
        className="flex flex-wrap items-baseline gap-1.5 text-[18px] font-semibold text-encre"
      >
        {label}
        {required ? (
          <span className="text-critique" aria-hidden="true">
            *
          </span>
        ) : (
          <span className="text-[13px] font-normal text-encre-attenuee">
            (facultatif)
          </span>
        )}
      </label>
      <p id={hintId} className="text-[13px] text-encre-secondaire">
        {hint}
      </p>
      <textarea
        id={fieldId}
        name={name}
        rows={rows}
        required={required}
        aria-describedby={hintId}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-champ border border-bordure-forte bg-surface px-3 py-2 text-[16px] text-encre transition-colors motion-reduce:transition-none placeholder:text-encre-attenuee focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2"
      />
    </div>
  );
}

export interface FormulaireConsultationProps {
  patientId: string;
  patientNomComplet: string;
  patientIdentifiantSante: string;
  patientAllergies: string[];
  patientDateNaissance: string | null;
  rendezVousId: string;
  /** Brouillon deja ouvert pour ce patient par ce medecin (RG-CLI-40), ou null pour une premiere saisie. */
  brouillon: BrouillonConsultation | null;
  /** Prise en charge infirmiere non recuperee (F-CLI-12), ignoree si un brouillon existe deja. */
  priseEnCharge: PriseEnChargeInfirmiereResume | null;
}

/**
 * Bandeau d'allergies du patient (F-CLI-04 du pack) : doit rester visible en
 * permanence pendant que le professionnel documente la consultation, jamais
 * uniquement consultable via un clic separe.
 */
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

/**
 * Formulaire de brouillon de consultation (F-CLI-05/06/07 du pack), une fois
 * le patient determine (via query param patientId/rendezVousId, selection
 * dans SelecteurPatient, ou reprise d'un brouillon existant transmis par
 * src/app/app/medecin/consultations/nouvelle/page.tsx). Deux boutons
 * partagent la meme Server Action (enregistrerConsultationAction) : "Enregistrer
 * le brouillon" (intent=brouillon, presque tout facultatif) et "Valider la
 * consultation" (intent=valider, exige motif+conclusion, verrouille le
 * contenu). Tous les champs sont geres en etat local controle : les Server
 * Actions declenchees via une vraie soumission de formulaire reinitialisent
 * les champs non controles apres coup (comportement standard de React 19),
 * ce qui ferait perdre la saisie a l'ecran malgre un enregistrement reussi.
 */
export function FormulaireConsultation({
  patientId,
  patientNomComplet,
  patientIdentifiantSante,
  patientAllergies,
  patientDateNaissance,
  rendezVousId,
  brouillon,
  priseEnCharge,
}: FormulaireConsultationProps) {
  const [state, formAction, pending] = useActionState(
    enregistrerConsultationAction,
    etatInitial
  );
  const [constantes, setConstantes] = useState<ConstantesFormulaire>(() =>
    constantesInitiales(brouillon, brouillon ? null : priseEnCharge)
  );
  const [confirmerAlerte, setConfirmerAlerte] = useState(false);
  const [motif, setMotif] = useState(brouillon?.motif ?? "");
  const [symptomes, setSymptomes] = useState(brouillon ? brouillon.symptomes.join("\n") : "");
  const [observations, setObservations] = useState(brouillon?.observations ?? "");
  const [conclusion, setConclusion] = useState(brouillon?.conclusion ?? "");
  // F-CLI-06/RG-CLI-52 : diagnostic principal codifie CIM-10, sa certitude,
  // et 0 a 5 diagnostics secondaires. Reconstruit depuis le brouillon repris
  // a partir de son code/libelle deja valides cote serveur ("sensible" reste
  // celui du brouillon, recalcule par le serveur a chaque enregistrement).
  const [diagnosticPrincipal, setDiagnosticPrincipal] = useState<DiagnosticCim10Propose | null>(() =>
    brouillon?.diagnosticPrincipalCode
      ? {
          code: brouillon.diagnosticPrincipalCode,
          libelle: brouillon.diagnosticPrincipalLibelle ?? brouillon.diagnosticPrincipalCode,
          groupeMaladie: "",
          sensible: brouillon.sensible,
        }
      : null
  );
  const [certitude, setCertitude] = useState<"confirme" | "suspecte">(
    brouillon?.diagnosticPrincipalCertitude === "suspecte" ? "suspecte" : "confirme"
  );
  const [diagnosticsSecondaires, setDiagnosticsSecondaires] = useState<{ code: string; libelle: string }[]>(
    brouillon?.diagnosticsSecondaires ?? []
  );

  // L'action renvoie l'id de la consultation enregistree (creation ou mise a
  // jour) : sert a la fois de valeur pour le champ cache consultationId des
  // enregistrements suivants et de condition d'activation de "Valider" /
  // des raccourcis "Prescrire"/"Demander un examen".
  const consultationIdActuel = state.consultationId ?? brouillon?.id ?? null;
  const consultationValidee = state.success && state.valide === true;

  const erreurConsentement =
    state.error !== null && state.error.toLowerCase().includes("consentement");

  function modifierConstante(champ: keyof ConstantesFormulaire, valeur: string) {
    setConstantes((actuelles) => ({ ...actuelles, [champ]: valeur }));
  }

  const dateNaissance = patientDateNaissance ? new Date(patientDateNaissance) : null;
  const maintenant = new Date();
  const age = dateNaissance ? ageAnnees(dateNaissance, maintenant) : null;

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
  const peutValider =
    consultationIdActuel !== null &&
    motif.trim().length > 0 &&
    conclusion.trim().length > 0 &&
    diagnosticPrincipal !== null &&
    !blocageConstantesNonResolu;

  // RG-CLI-52 : un code du chapitre symptomes (R00-R99) impose la certitude
  // "suspecte" a l'ecran aussi, coherent avec ce que le serveur imposerait de
  // toute facon (voir estChapitreSymptome dans clinical/actions.ts).
  const estChapitreSymptomeAffiche = diagnosticPrincipal ? /^R\d{2}/.test(diagnosticPrincipal.code) : false;
  const certitudeAffichee = estChapitreSymptomeAffiche ? "suspecte" : certitude;

  if (consultationValidee) {
    return (
      <Card>
        <div className="flex flex-col gap-4">
          <Alert level="success" title="Consultation validee">
            La consultation de {patientNomComplet} a bien ete validee et
            verrouillee dans son dossier.
          </Alert>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/app/medecin/rendez-vous"
              className="text-[13px] font-semibold text-accent hover:underline"
            >
              Retour a mes rendez-vous
            </Link>
            <Link
              href="/app/medecin/consultations"
              className="text-[13px] font-semibold text-accent hover:underline"
            >
              Voir l&apos;historique des consultations
            </Link>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card
      title={`Consultation de ${patientNomComplet}`}
      description={
        patientIdentifiantSante
          ? `Identifiant sante : ${patientIdentifiantSante}${age !== null ? ` · ${age} an${age > 1 ? "s" : ""}` : ""}`
          : undefined
      }
    >
      <form action={formAction} aria-busy={pending} className="flex flex-col gap-5">
        <input type="hidden" name="patientId" value={patientId} />
        <input type="hidden" name="rendezVousId" value={rendezVousId} />
        <input type="hidden" name="consultationId" value={consultationIdActuel ?? ""} />
        <input
          type="hidden"
          name="priseEnChargeId"
          value={!brouillon && priseEnCharge ? priseEnCharge.id : ""}
        />
        <input type="hidden" name="diagnosticPrincipalCode" value={diagnosticPrincipal?.code ?? ""} />
        <input type="hidden" name="diagnosticPrincipalCertitude" value={diagnosticPrincipal ? certitudeAffichee : ""} />
        <input
          type="hidden"
          name="diagnosticsSecondaires"
          value={JSON.stringify(diagnosticsSecondaires.map((diagnostic) => diagnostic.code))}
        />

        <BandeauAllergies allergies={patientAllergies} />

        {consultationIdActuel ? (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-champ border border-bordure bg-plan px-3 py-2">
            <p className="text-[13px] font-semibold text-encre">
              {state.success ? "Brouillon enregistré." : "Brouillon en cours."}
            </p>
            <div className="flex flex-wrap gap-3">
              <Link
                href={`/app/medecin/examens/nouvelle?consultationId=${encodeURIComponent(consultationIdActuel)}`}
                className="text-[13px] font-semibold text-accent hover:underline"
              >
                Demander un examen
              </Link>
              <Link
                href={`/app/medecin/prescriptions/nouvelle?consultationId=${encodeURIComponent(consultationIdActuel)}`}
                className="text-[13px] font-semibold text-accent hover:underline"
              >
                Prescrire
              </Link>
              <Link
                href={`/app/medecin/references/nouvelle?consultationId=${encodeURIComponent(consultationIdActuel)}`}
                className="text-[13px] font-semibold text-accent hover:underline"
              >
                Creer une reference
              </Link>
            </div>
          </div>
        ) : null}

        {state.error ? (
          erreurConsentement ? (
            <Alert level="warning" title="Consentement necessaire">
              {state.error} Demandez au patient de vous accorder l&apos;acces
              a son dossier depuis son espace patient (section « Gerer mes
              autorisations d&apos;acces »), puis reessayez.
            </Alert>
          ) : (
            <Alert level="critical" title="Consultation non enregistree">
              {state.error}
            </Alert>
          )
        ) : null}

        <TextField
          label="Motif de la consultation"
          name="motif"
          value={motif}
          onChange={(event: ChangeEvent<HTMLInputElement>) => setMotif(event.target.value)}
          maxLength={200}
          hint="Obligatoire pour valider la consultation, facultatif pour un simple brouillon (200 caracteres maximum)."
        />

        <ChampTexteMultiligne
          label="Symptomes"
          name="symptomes"
          hint="Un symptome par ligne (ex. fievre, toux, douleur abdominale)."
          value={symptomes}
          onChange={setSymptomes}
        />

        <div className="flex flex-col gap-3">
          <p className="flex flex-wrap items-baseline gap-1.5 text-[18px] font-semibold text-encre">
            Constantes
            <span className="text-[13px] font-normal text-encre-attenuee">(facultatif)</span>
          </p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <ChampConstante
              label="Température"
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
              label="Fréquence respiratoire"
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
              label="Saturation en oxygène"
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
              label="Glycémie capillaire"
              name="glycemieGL"
              unite="g/L"
              valeur={constantes.glycemieGL}
              onChange={(valeur) => modifierConstante("glycemieGL", valeur)}
              controle={controleGlycemie}
            />
          </div>

          {imc !== null ? (
            <p className={controleIMC && controleIMC.statut === "alerte" ? "text-[13px] text-vigilance" : "text-[13px] text-encre-secondaire"}>
              IMC calculé : {imc.toFixed(1)}
              {controleIMC && controleIMC.statut === "alerte" ? ` (${controleIMC.message})` : ""}
            </p>
          ) : null}

          {uneValeurEnAlerte ? (
            <div className="flex flex-col gap-2">
              <Alert level="warning" title="Valeur(s) inhabituelle(s)">
                Au moins une constante saisie est en dehors de la plage habituelle. Vérifiez la
                saisie, ou confirmez pour l&apos;enregistrer telle quelle.
              </Alert>
              <label className="flex items-center gap-2 text-[13px] font-semibold text-encre">
                <input
                  type="checkbox"
                  name="confirmerAlerteConstantes"
                  checked={confirmerAlerte}
                  onChange={(event) => setConfirmerAlerte(event.target.checked)}
                />
                Confirmer les valeurs saisies malgré l&apos;avertissement
              </label>
            </div>
          ) : null}
        </div>

        <ChampTexteMultiligne
          label="Observations"
          name="observations"
          hint="Observations cliniques relevees pendant la consultation."
          value={observations}
          onChange={setObservations}
        />

        <div className="flex flex-col gap-2">
          <p className="flex flex-wrap items-baseline gap-1.5 text-[18px] font-semibold text-encre">
            Diagnostic principal (CIM-10)
            <span className="text-critique" aria-hidden="true">
              *
            </span>
          </p>
          <p className="text-[13px] text-encre-secondaire">
            Obligatoire pour valider. S&apos;il n&apos;est pas encore etabli, choisissez un code de symptome
            (ex. R50.9 Fievre, sans precision) : la certitude passe alors automatiquement a &laquo; suspecte &raquo;.
          </p>

          {diagnosticPrincipal ? (
            <div className="flex flex-col gap-3 rounded-champ border border-bordure-forte bg-surface px-3 py-2">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-col gap-0.5">
                  <p className="text-[15px] font-semibold text-encre">
                    <span className="chiffres">{diagnosticPrincipal.code}</span> : {diagnosticPrincipal.libelle}
                  </p>
                  {diagnosticPrincipal.sensible ? (
                    <p className="text-[12px] font-semibold text-vigilance">
                      Cette consultation sera protegee (confidentialite renforcee).
                    </p>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={() => setDiagnosticPrincipal(null)}
                  className="text-[13px] font-semibold text-accent hover:underline"
                >
                  Changer de diagnostic
                </button>
              </div>

              <fieldset className="flex flex-wrap items-center gap-4">
                <legend className="text-[13px] font-semibold text-encre-secondaire">Certitude</legend>
                {(["confirme", "suspecte"] as const).map((valeur) => (
                  <label key={valeur} className="flex items-center gap-1.5 text-[13px] text-encre">
                    <input
                      type="radio"
                      name="certitude-affichage"
                      checked={certitudeAffichee === valeur}
                      disabled={estChapitreSymptomeAffiche}
                      onChange={() => setCertitude(valeur)}
                    />
                    {valeur === "confirme" ? "Confirme" : "Suspecte"}
                  </label>
                ))}
                {estChapitreSymptomeAffiche ? (
                  <span className="text-[12px] text-encre-attenuee">Impose par le code de symptome choisi.</span>
                ) : null}
              </fieldset>
            </div>
          ) : (
            <SelecteurDiagnosticCim10
              codesExclus={diagnosticsSecondaires.map((diagnostic) => diagnostic.code)}
              onChoisir={setDiagnosticPrincipal}
            />
          )}
        </div>

        <div className="flex flex-col gap-2">
          <p className="text-[15px] font-semibold text-encre">
            Diagnostics secondaires
            <span className="ml-1.5 text-[13px] font-normal text-encre-attenuee">(facultatif, 5 au maximum)</span>
          </p>

          {diagnosticsSecondaires.length > 0 ? (
            <ul className="flex flex-wrap gap-2">
              {diagnosticsSecondaires.map((diagnostic) => (
                <li key={diagnostic.code}>
                  <Badge tone="neutral">
                    <span className="chiffres">{diagnostic.code}</span> : {diagnostic.libelle}
                    <button
                      type="button"
                      onClick={() =>
                        setDiagnosticsSecondaires((liste) => liste.filter((item) => item.code !== diagnostic.code))
                      }
                      aria-label={`Retirer le diagnostic secondaire ${diagnostic.libelle}`}
                      className="ml-1.5 font-bold"
                    >
                      x
                    </button>
                  </Badge>
                </li>
              ))}
            </ul>
          ) : null}

          {diagnosticsSecondaires.length < 5 ? (
            <SelecteurDiagnosticCim10
              codesExclus={[
                ...(diagnosticPrincipal ? [diagnosticPrincipal.code] : []),
                ...diagnosticsSecondaires.map((diagnostic) => diagnostic.code),
              ]}
              onChoisir={(diagnostic) =>
                setDiagnosticsSecondaires((liste) => [...liste, { code: diagnostic.code, libelle: diagnostic.libelle }])
              }
              placeholder="Ajouter un diagnostic secondaire"
            />
          ) : null}
        </div>

        <ChampTexteMultiligne
          label="Conclusion"
          name="conclusion"
          hint="Diagnostic ou conclusion de la consultation. Obligatoire pour valider."
          value={conclusion}
          onChange={setConclusion}
        />

        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="submit"
            name="intent"
            value="brouillon"
            variant="secondary"
            className="w-fit"
            disabled={pending || blocageConstantesNonResolu}
          >
            {pending ? "Enregistrement..." : "Enregistrer le brouillon"}
          </Button>
          <Button
            type="submit"
            name="intent"
            value="valider"
            variant="primary"
            className="w-fit"
            disabled={pending || !peutValider}
          >
            {pending ? "Validation..." : "Valider la consultation"}
          </Button>
          {!peutValider && consultationIdActuel ? (
            <span className="text-[13px] text-encre-attenuee">
              Motif, diagnostic principal et conclusion sont nécessaires pour valider.
            </span>
          ) : null}
        </div>
      </form>
    </Card>
  );
}
