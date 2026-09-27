"use client";

import { useActionState, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import Link from "next/link";
import { Trash2 } from "lucide-react";
import {
  creerPrescriptionAction,
  type MedicamentOption,
  type PrescriptionActionState,
} from "@/modules/prescription/actions";
import {
  allergieCorrespondante,
  LONGUEUR_MIN_JUSTIFICATION_FORCAGE,
} from "@/modules/prescription/referentiel-allergies";
import {
  avertissementPourLigne,
  libelleAvertissement,
  type LigneComparable,
} from "@/modules/prescription/controles-doublons";
import {
  ageMinimumNonAtteint,
  libelleAgeMinimum,
  grossesseIncompatible,
  dureeAntibiotiqueExcessive,
} from "@/modules/prescription/controles-securite";
import {
  UNITES_POSOLOGIE,
  VOIES_POSOLOGIE,
  FREQUENCES_POSOLOGIE,
  LIBELLES_VOIE_POSOLOGIE,
  LIBELLES_FREQUENCE_POSOLOGIE,
  precisionAutreManquante,
  composerPosologie,
  type UnitePosologie,
  type VoiePosologie,
  type FrequencePosologie,
} from "@/modules/prescription/posologie";
import {
  AGE_POIDS_REQUIS_ANS,
  DUREE_TRAITEMENT_MAX_JOURS,
  FENETRE_POIDS_JOURS,
  MESSAGE_POIDS_MANQUANT,
  NOMBRE_LIGNES_MAX,
} from "@/modules/prescription/regles-ordonnance";
import {
  MOTIF_NON_SUBSTITUABLE_MAX,
  MOTIF_NON_SUBSTITUABLE_MIN,
  validerNonSubstituable,
} from "@/modules/prescription/non-substituable";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { IconButton } from "@/components/ui/IconButton";
import { SelectField } from "@/components/ui/SelectField";
import { TextField } from "@/components/ui/TextField";
import { SelecteurMedicament } from "./SelecteurMedicament";

const etatInitial: PrescriptionActionState = { error: null, success: false };

type ChampLigne =
  | "medicamentId"
  | "dose"
  | "voieAutre"
  | "frequenceAutre"
  | "quantite"
  | "dureeTraitementJours"
  | "motifNonSubstituable";

// F-PRE-03, version reduite : options courtes plutot qu'un champ texte libre
// pour la posologie (voir src/modules/prescription/posologie.ts).
const optionsUnite = UNITES_POSOLOGIE.map((code) => ({
  value: code,
  label: code === "comprime" ? "comprimé" : code,
}));
const optionsVoie = VOIES_POSOLOGIE.map((code) => ({
  value: code,
  label: code === "autre" ? "Autre" : LIBELLES_VOIE_POSOLOGIE[code],
}));
const optionsFrequence = FREQUENCES_POSOLOGIE.map((code) => ({
  value: code,
  label: code === "autre" ? "Autre" : LIBELLES_FREQUENCE_POSOLOGIE[code],
}));

interface LigneFormulaire {
  cle: number;
  medicamentId: string;
  dose: string;
  unite: UnitePosologie;
  voie: VoiePosologie;
  voieAutre: string;
  frequence: FrequencePosologie;
  frequenceAutre: string;
  quantite: string;
  dureeTraitementJours: string;
  forcerAlerteAllergie: boolean;
  justificationForcage: string;
  confirmerAvertissement: boolean;
  forcerAlerteAge: boolean;
  forcerAlerteGrossesse: boolean;
  confirmerAvertissementDuree: boolean;
  nonSubstituable: boolean;
  motifNonSubstituable: string;
}

function ligneVide(cle: number): LigneFormulaire {
  return {
    cle,
    medicamentId: "",
    dose: "",
    unite: UNITES_POSOLOGIE[0],
    voie: VOIES_POSOLOGIE[0],
    voieAutre: "",
    frequence: FREQUENCES_POSOLOGIE[0],
    frequenceAutre: "",
    quantite: "",
    dureeTraitementJours: "",
    forcerAlerteAllergie: false,
    justificationForcage: "",
    confirmerAvertissement: false,
    forcerAlerteAge: false,
    forcerAlerteGrossesse: false,
    confirmerAvertissementDuree: false,
    nonSubstituable: false,
    motifNonSubstituable: "",
  };
}

/**
 * Champs saisis d'une ligne qui survivent a un changement de medicament : la
 * posologie et la duree restent, les confirmations (forcage allergie, age,
 * grossesse, avertissements) reviennent a leur valeur initiale, car elles
 * portaient sur l'ancien medicament.
 */
function champsSansMedicament(ligne: LigneFormulaire) {
  return {
    dose: ligne.dose,
    unite: ligne.unite,
    voie: ligne.voie,
    voieAutre: ligne.voieAutre,
    frequence: ligne.frequence,
    frequenceAutre: ligne.frequenceAutre,
    quantite: ligne.quantite,
    dureeTraitementJours: ligne.dureeTraitementJours,
  };
}

/** Champs de posologie d'une ligne, avec dose convertie en nombre (NaN si vide/invalide). */
function champsPosologie(ligne: LigneFormulaire) {
  return {
    dose: Number(ligne.dose),
    unite: ligne.unite,
    voie: ligne.voie,
    voieAutre: ligne.voieAutre,
    frequence: ligne.frequence,
    frequenceAutre: ligne.frequenceAutre,
  };
}

/** Posologie composee si dose et precisions "autre" sont valides, sinon null (voir posologie.ts). */
function apercuPosologie(ligne: LigneFormulaire): string | null {
  const champs = champsPosologie(ligne);
  if (!ligne.dose.trim() || Number.isNaN(champs.dose) || champs.dose <= 0) return null;
  if (precisionAutreManquante(champs)) return null;
  return composerPosologie(champs);
}

/** Bandeau d'allergies du patient (F-CLI-04 du pack) : visible en permanence, pas seulement au clic. */
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

export interface FormulairePrescriptionProps {
  consultationId: string;
  patientAllergies: string[];
  patientDateNaissanceISO: string;
  patientSexe: string;
  patientGrossesseEnCours: boolean;
  patientPoidsRequis: boolean;
  patientPoidsRecentKg: number | null;
  patientTraitementsActifs: LigneComparable[];
  /** RG-PRE-30 : re-authentification deja effectuee il y a moins de 5 minutes, mot de passe non redemande. */
  reauthentificationRecente: boolean;
}

/**
 * Formulaire de creation d'une prescription (Phase 5) : une ou plusieurs
 * lignes de medicaments, ajoutees/retirees dynamiquement. Les lignes vivent
 * en etat local React (tableau structure) puisqu'un FormData standard ne
 * transporte pas de tableau : elles sont serialisees en JSON dans le champ
 * cache lignesJSON juste avant la soumission, format attendu par
 * creerPrescriptionAction.
 */
export function FormulairePrescription({
  consultationId,
  patientAllergies,
  patientDateNaissanceISO,
  patientSexe,
  patientGrossesseEnCours,
  patientPoidsRequis,
  patientPoidsRecentKg,
  patientTraitementsActifs,
  reauthentificationRecente,
}: FormulairePrescriptionProps) {
  const [state, formAction, pending] = useActionState(
    creerPrescriptionAction,
    etatInitial
  );
  const [lignes, setLignes] = useState<LigneFormulaire[]>([ligneVide(0)]);
  const [motDePasseSignature, setMotDePasseSignature] = useState("");
  const prochaineCleRef = useRef(1);
  const patientDateNaissance = new Date(patientDateNaissanceISO);

  // F-PRE-03 : le catalogue n'est plus charge en entier. Chaque medicament
  // retenu par la recherche est conserve ici, pour les controles de securite
  // immediats (allergie, doublon, age, grossesse, duree) qui le retrouvent par id.
  const [medicamentsConnus, setMedicamentsConnus] = useState<Record<string, MedicamentOption>>({});
  const medicaments = Object.values(medicamentsConnus);

  function ajouterLigne() {
    setLignes((actuelles) => [...actuelles, ligneVide(prochaineCleRef.current++)]);
  }

  function retirerLigne(cle: number) {
    setLignes((actuelles) =>
      actuelles.length > 1 ? actuelles.filter((ligne) => ligne.cle !== cle) : actuelles
    );
  }

  function modifierLigne(cle: number, champ: ChampLigne, valeur: string) {
    setLignes((actuelles) =>
      actuelles.map((ligne) => (ligne.cle === cle ? { ...ligne, [champ]: valeur } : ligne))
    );
  }

  /** Retient le medicament choisi pour la ligne et efface les confirmations donnees pour le precedent. */
  function choisirMedicament(cle: number, medicament: MedicamentOption) {
    setMedicamentsConnus((actuels) => ({ ...actuels, [medicament.id]: medicament }));
    setLignes((actuelles) =>
      actuelles.map((ligne) =>
        ligne.cle === cle ? { ...ligneVide(cle), ...champsSansMedicament(ligne), medicamentId: medicament.id } : ligne
      )
    );
  }

  function effacerMedicament(cle: number) {
    setLignes((actuelles) =>
      actuelles.map((ligne) =>
        ligne.cle === cle ? { ...ligneVide(cle), ...champsSansMedicament(ligne), medicamentId: "" } : ligne
      )
    );
  }

  function modifierUnite(cle: number, valeur: UnitePosologie) {
    setLignes((actuelles) =>
      actuelles.map((ligne) => (ligne.cle === cle ? { ...ligne, unite: valeur } : ligne))
    );
  }

  function modifierVoie(cle: number, valeur: VoiePosologie) {
    setLignes((actuelles) =>
      actuelles.map((ligne) => (ligne.cle === cle ? { ...ligne, voie: valeur } : ligne))
    );
  }

  function modifierFrequence(cle: number, valeur: FrequencePosologie) {
    setLignes((actuelles) =>
      actuelles.map((ligne) => (ligne.cle === cle ? { ...ligne, frequence: valeur } : ligne))
    );
  }

  function basculerForcage(cle: number, valeur: boolean) {
    setLignes((actuelles) =>
      actuelles.map((ligne) => (ligne.cle === cle ? { ...ligne, forcerAlerteAllergie: valeur } : ligne))
    );
  }

  function modifierJustification(cle: number, valeur: string) {
    setLignes((actuelles) =>
      actuelles.map((ligne) => (ligne.cle === cle ? { ...ligne, justificationForcage: valeur } : ligne))
    );
  }

  function basculerConfirmation(cle: number, valeur: boolean) {
    setLignes((actuelles) =>
      actuelles.map((ligne) => (ligne.cle === cle ? { ...ligne, confirmerAvertissement: valeur } : ligne))
    );
  }

  function basculerForcageAge(cle: number, valeur: boolean) {
    setLignes((actuelles) =>
      actuelles.map((ligne) => (ligne.cle === cle ? { ...ligne, forcerAlerteAge: valeur } : ligne))
    );
  }

  function basculerForcageGrossesse(cle: number, valeur: boolean) {
    setLignes((actuelles) =>
      actuelles.map((ligne) => (ligne.cle === cle ? { ...ligne, forcerAlerteGrossesse: valeur } : ligne))
    );
  }

  function basculerNonSubstituable(cle: number, valeur: boolean) {
    setLignes((actuelles) =>
      actuelles.map((ligne) =>
        ligne.cle === cle
          ? { ...ligne, nonSubstituable: valeur, motifNonSubstituable: valeur ? ligne.motifNonSubstituable : "" }
          : ligne
      )
    );
  }

  function basculerConfirmationDuree(cle: number, valeur: boolean) {
    setLignes((actuelles) =>
      actuelles.map((ligne) => (ligne.cle === cle ? { ...ligne, confirmerAvertissementDuree: valeur } : ligne))
    );
  }

  /** Allergie du patient correspondant au medicament choisi pour cette ligne, ou null (F-PRE-02). */
  function allergieDeLaLigne(medicamentId: string): string | null {
    const medicament = medicaments.find((candidat) => candidat.id === medicamentId);
    if (!medicament || patientAllergies.length === 0) return null;
    return allergieCorrespondante(medicament, patientAllergies);
  }

  /**
   * Avertissement "doublon"/"meme classe" pour la ligne identifiee par cle
   * (F-PRE-02) : compare au traitements actifs du patient et aux autres
   * lignes de cette meme ordonnance en cours de saisie.
   */
  function avertissementDeLaLigne(cle: number, medicamentId: string) {
    const medicament = medicaments.find((candidat) => candidat.id === medicamentId);
    if (!medicament) return null;

    const autresLignes: LigneComparable[] = [
      ...patientTraitementsActifs,
      ...lignes
        .filter((autre) => autre.cle !== cle)
        .map((autre) => medicaments.find((candidat) => candidat.id === autre.medicamentId))
        .filter((autre): autre is MedicamentOption => autre !== undefined),
    ];

    return avertissementPourLigne(medicament, autresLignes);
  }

  /** Age minimum (en mois) non atteint pour le medicament choisi sur cette ligne, ou null (F-PRE-02). */
  function ageMinimumDeLaLigne(medicamentId: string): number | null {
    const medicament = medicaments.find((candidat) => candidat.id === medicamentId);
    if (!medicament) return null;
    return ageMinimumNonAtteint(medicament, { dateNaissance: patientDateNaissance });
  }

  /** Vrai si le medicament choisi sur cette ligne est contre-indique pour la grossesse en cours de la patiente. */
  function grossesseIncompatibleDeLaLigne(medicamentId: string): boolean {
    const medicament = medicaments.find((candidat) => candidat.id === medicamentId);
    if (!medicament) return false;
    return grossesseIncompatible(medicament, { sexe: patientSexe, grossesseEnCours: patientGrossesseEnCours });
  }

  /** Vrai si la duree de traitement saisie depasse 30 jours pour un antibiotique (F-PRE-02). */
  function dureeExcessiveDeLaLigne(ligne: LigneFormulaire): boolean {
    const medicament = medicaments.find((candidat) => candidat.id === ligne.medicamentId);
    const duree = Number(ligne.dureeTraitementJours);
    if (!medicament || Number.isNaN(duree)) return false;
    return dureeAntibiotiqueExcessive(medicament, duree);
  }

  const blocageAllergieNonResolu = lignes.some((ligne) => {
    const allergie = allergieDeLaLigne(ligne.medicamentId);
    if (!allergie) return false;
    return (
      !ligne.forcerAlerteAllergie ||
      ligne.justificationForcage.trim().length < LONGUEUR_MIN_JUSTIFICATION_FORCAGE
    );
  });

  const blocageAvertissementNonResolu = lignes.some((ligne) => {
    const avertissement = avertissementDeLaLigne(ligne.cle, ligne.medicamentId);
    return avertissement !== null && !ligne.confirmerAvertissement;
  });

  const blocageAgeNonResolu = lignes.some((ligne) => {
    if (ageMinimumDeLaLigne(ligne.medicamentId) === null) return false;
    return (
      !ligne.forcerAlerteAge ||
      ligne.justificationForcage.trim().length < LONGUEUR_MIN_JUSTIFICATION_FORCAGE
    );
  });

  const blocageGrossesseNonResolu = lignes.some((ligne) => {
    if (!grossesseIncompatibleDeLaLigne(ligne.medicamentId)) return false;
    return (
      !ligne.forcerAlerteGrossesse ||
      ligne.justificationForcage.trim().length < LONGUEUR_MIN_JUSTIFICATION_FORCAGE
    );
  });

  const blocageDureeNonResolu = lignes.some(
    (ligne) => dureeExcessiveDeLaLigne(ligne) && !ligne.confirmerAvertissementDuree
  );

  // RG-PRE-02 (sous 12 ans, poids obligatoire) et borne de duree : revalides
  // cote serveur, l'ecran evite seulement une soumission vouee a l'echec.
  const blocagePoidsManquant = patientPoidsRequis && patientPoidsRecentKg === null;
  const blocageDureeAuDessusDuMaximum = lignes.some(
    (ligne) => Number(ligne.dureeTraitementJours) > DUREE_TRAITEMENT_MAX_JOURS
  );
  const limiteDeLignesAtteinte = lignes.length >= NOMBRE_LIGNES_MAX;

  // F-PRE-03 : dose renseignee et positive, et precision "autre" fournie
  // quand voie/frequence vaut "autre" (revalide de toute facon cote serveur).
  const blocagePosologieIncomplete = lignes.some((ligne) => apercuPosologie(ligne) === null);
  const blocageMedicamentNonChoisi = lignes.some((ligne) => ligne.medicamentId === "");
  // F-PRE-01 : "non substituable" coche sans motif suffisant (revalide cote serveur).
  const blocageMotifNonSubstituable = lignes.some(
    (ligne) => !validerNonSubstituable(ligne.nonSubstituable, ligne.motifNonSubstituable).ok
  );

  const lignesJSON = JSON.stringify(
    lignes.map(
      ({
        medicamentId,
        dose,
        unite,
        voie,
        voieAutre,
        frequence,
        frequenceAutre,
        quantite,
        dureeTraitementJours,
        forcerAlerteAllergie,
        justificationForcage,
        confirmerAvertissement,
        forcerAlerteAge,
        forcerAlerteGrossesse,
        confirmerAvertissementDuree,
        nonSubstituable,
        motifNonSubstituable,
      }) => ({
        medicamentId,
        dose,
        unite,
        voie,
        voieAutre,
        frequence,
        frequenceAutre,
        quantite,
        dureeTraitementJours,
        forcerAlerteAllergie,
        justificationForcage,
        confirmerAvertissement,
        forcerAlerteAge,
        forcerAlerteGrossesse,
        confirmerAvertissementDuree,
        nonSubstituable,
        motifNonSubstituable,
      })
    )
  );

  if (state.success) {
    return (
      <Card>
        <div className="flex flex-col gap-4">
          <Alert level="success" title="Prescription enregistree">
            La prescription a bien ete enregistree.
          </Alert>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/app/medecin/consultations"
              className="text-[13px] font-semibold text-accent hover:underline"
            >
              Retour a l&apos;historique des consultations
            </Link>
            <Link
              href="/app/medecin/prescriptions"
              className="text-[13px] font-semibold text-accent hover:underline"
            >
              Voir l&apos;historique des prescriptions
            </Link>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card
      title="Lignes de prescription"
      description="Ajoutez au moins un medicament, avec sa posologie, sa quantite et la duree du traitement."
    >
      <form action={formAction} aria-busy={pending} className="flex flex-col gap-6">
        <input type="hidden" name="consultationId" value={consultationId} />
        <input type="hidden" name="lignesJSON" value={lignesJSON} />

        <BandeauAllergies allergies={patientAllergies} />

        {patientPoidsRequis ? (
          patientPoidsRecentKg === null ? (
            <Alert level="critical" title="Poids manquant">
              {MESSAGE_POIDS_MANQUANT}
            </Alert>
          ) : (
            <Alert level="info" title={`Poids retenu : ${patientPoidsRecentKg} kg`}>
              Patient de moins de {AGE_POIDS_REQUIS_ANS} ans : poids releve depuis moins de {FENETRE_POIDS_JOURS} jours.
            </Alert>
          )
        ) : null}

        {state.error ? (
          <Alert level="critical" title="Prescription non enregistree">
            {state.error}
          </Alert>
        ) : null}

        <div className="flex flex-col gap-5">
          {lignes.map((ligne, index) => (
            <div
              key={ligne.cle}
              className="flex flex-col gap-4 rounded-champ border border-bordure bg-plan p-4"
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-[13px] font-semibold uppercase tracking-[0.08em] text-encre-attenuee">
                  Medicament {index + 1}
                </p>
                <IconButton
                  icon={Trash2}
                  label="Retirer ce medicament"
                  danger
                  disabled={lignes.length <= 1}
                  onClick={() => retirerLigne(ligne.cle)}
                />
              </div>

              <SelecteurMedicament
                medicamentChoisi={medicamentsConnus[ligne.medicamentId] ?? null}
                onChoisir={(medicament) => choisirMedicament(ligne.cle, medicament)}
                onEffacer={() => effacerMedicament(ligne.cle)}
              />

              {/*
                F-PRE-03 du pack, version reduite : dose/unite/voie/frequence
                separes plutot qu'un champ texte libre unique. Composes en une
                chaine formatee a l'enregistrement (composerPosologie), qui
                reste ce qui est stocke (LignePrescription.posologie, un
                simple String) : pas de nouveau champ structure en base ce
                soir, le schema est deja en pleine activite concurrente
                ailleurs (migration analytics F-PIL-07).
              */}
              <div className="flex flex-col gap-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <TextField
                    label="Dose"
                    type="number"
                    min={0}
                    step="any"
                    required
                    placeholder="Ex. 500"
                    value={ligne.dose}
                    onChange={(event: ChangeEvent<HTMLInputElement>) =>
                      modifierLigne(ligne.cle, "dose", event.target.value)
                    }
                  />
                  <SelectField
                    label="Unité"
                    required
                    options={optionsUnite}
                    value={ligne.unite}
                    onChange={(event: ChangeEvent<HTMLSelectElement>) =>
                      modifierUnite(ligne.cle, event.target.value as UnitePosologie)
                    }
                  />
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <SelectField
                    label="Voie d'administration"
                    required
                    options={optionsVoie}
                    value={ligne.voie}
                    onChange={(event: ChangeEvent<HTMLSelectElement>) =>
                      modifierVoie(ligne.cle, event.target.value as VoiePosologie)
                    }
                  />
                  {ligne.voie === "autre" ? (
                    <TextField
                      label="Précisez la voie"
                      required
                      placeholder="Ex. sous-cutanée"
                      value={ligne.voieAutre}
                      onChange={(event: ChangeEvent<HTMLInputElement>) =>
                        modifierLigne(ligne.cle, "voieAutre", event.target.value)
                      }
                    />
                  ) : null}
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <SelectField
                    label="Fréquence"
                    required
                    options={optionsFrequence}
                    value={ligne.frequence}
                    onChange={(event: ChangeEvent<HTMLSelectElement>) =>
                      modifierFrequence(ligne.cle, event.target.value as FrequencePosologie)
                    }
                  />
                  {ligne.frequence === "autre" ? (
                    <TextField
                      label="Précisez la fréquence"
                      required
                      placeholder="Ex. toutes les 8 heures"
                      value={ligne.frequenceAutre}
                      onChange={(event: ChangeEvent<HTMLInputElement>) =>
                        modifierLigne(ligne.cle, "frequenceAutre", event.target.value)
                      }
                    />
                  ) : null}
                </div>

                {apercuPosologie(ligne) ? (
                  <p className="text-[13px] text-encre-secondaire">
                    Posologie enregistrée :{" "}
                    <span className="font-semibold text-encre">{apercuPosologie(ligne)}</span>
                  </p>
                ) : null}
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <TextField
                  label="Quantite"
                  type="number"
                  min={1}
                  required
                  value={ligne.quantite}
                  onChange={(event: ChangeEvent<HTMLInputElement>) =>
                    modifierLigne(ligne.cle, "quantite", event.target.value)
                  }
                />
                <TextField
                  label="Duree du traitement"
                  type="number"
                  min={1}
                  max={DUREE_TRAITEMENT_MAX_JOURS}
                  unit="jours"
                  required
                  value={ligne.dureeTraitementJours}
                  onChange={(event: ChangeEvent<HTMLInputElement>) =>
                    modifierLigne(ligne.cle, "dureeTraitementJours", event.target.value)
                  }
                />
              </div>

              <div className="flex flex-col gap-3">
                <label className="flex items-center gap-2 text-[13px] font-semibold text-encre">
                  <input
                    type="checkbox"
                    checked={ligne.nonSubstituable}
                    onChange={(event) => basculerNonSubstituable(ligne.cle, event.target.checked)}
                  />
                  Non substituable (la pharmacie ne pourra pas délivrer de générique)
                </label>
                {ligne.nonSubstituable ? (
                  <TextField
                    label="Motif de non substitution"
                    required
                    maxLength={MOTIF_NON_SUBSTITUABLE_MAX}
                    hint={`Au moins ${MOTIF_NON_SUBSTITUABLE_MIN} caractères. Visible par le patient et la pharmacie.`}
                    placeholder="Ex. index thérapeutique étroit, intolérance à un excipient"
                    value={ligne.motifNonSubstituable}
                    onChange={(event: ChangeEvent<HTMLInputElement>) =>
                      modifierLigne(ligne.cle, "motifNonSubstituable", event.target.value)
                    }
                  />
                ) : null}
              </div>

              {(() => {
                const allergie = allergieDeLaLigne(ligne.medicamentId);
                if (!allergie) return null;

                return (
                  <div className="flex flex-col gap-3">
                    <Alert level="critical" title="Alerte allergie bloquante">
                      Le patient est declare allergique a « {allergie} », ce
                      qui correspond a ce medicament. Retirez cette ligne, ou
                      forcez la prescription ci-dessous avec une
                      justification (trace dans le journal d&apos;audit).
                    </Alert>
                    <label className="flex items-center gap-2 text-[13px] font-semibold text-encre">
                      <input
                        type="checkbox"
                        checked={ligne.forcerAlerteAllergie}
                        onChange={(event) => basculerForcage(ligne.cle, event.target.checked)}
                      />
                      Forcer cette prescription malgre l&apos;alerte
                    </label>
                    {ligne.forcerAlerteAllergie ? (
                      <TextField
                        label="Justification du forcage"
                        required
                        hint={`Au moins ${LONGUEUR_MIN_JUSTIFICATION_FORCAGE} caracteres, visible dans l'audit.`}
                        value={ligne.justificationForcage}
                        onChange={(event: ChangeEvent<HTMLInputElement>) =>
                          modifierJustification(ligne.cle, event.target.value)
                        }
                      />
                    ) : null}
                  </div>
                );
              })()}

              {(() => {
                const avertissement = avertissementDeLaLigne(ligne.cle, ligne.medicamentId);
                if (!avertissement) return null;

                return (
                  <div className="flex flex-col gap-3">
                    <Alert level="warning" title="Avertissement">
                      {libelleAvertissement(avertissement)}
                    </Alert>
                    <label className="flex items-center gap-2 text-[13px] font-semibold text-encre">
                      <input
                        type="checkbox"
                        checked={ligne.confirmerAvertissement}
                        onChange={(event) => basculerConfirmation(ligne.cle, event.target.checked)}
                      />
                      Confirmer malgre l&apos;avertissement
                    </label>
                  </div>
                );
              })()}

              {(() => {
                const ageMinimumMois = ageMinimumDeLaLigne(ligne.medicamentId);
                if (ageMinimumMois === null) return null;

                return (
                  <div className="flex flex-col gap-3">
                    <Alert level="critical" title="Alerte age bloquante">
                      Ce medicament est contre-indique avant{" "}
                      {libelleAgeMinimum(ageMinimumMois)}. Retirez cette ligne,
                      ou forcez la prescription ci-dessous avec une
                      justification (tracee dans le journal d&apos;audit).
                    </Alert>
                    <label className="flex items-center gap-2 text-[13px] font-semibold text-encre">
                      <input
                        type="checkbox"
                        checked={ligne.forcerAlerteAge}
                        onChange={(event) => basculerForcageAge(ligne.cle, event.target.checked)}
                      />
                      Forcer cette prescription malgre l&apos;alerte
                    </label>
                    {ligne.forcerAlerteAge ? (
                      <TextField
                        label="Justification du forcage"
                        required
                        hint={`Au moins ${LONGUEUR_MIN_JUSTIFICATION_FORCAGE} caracteres, visible dans l'audit.`}
                        value={ligne.justificationForcage}
                        onChange={(event: ChangeEvent<HTMLInputElement>) =>
                          modifierJustification(ligne.cle, event.target.value)
                        }
                      />
                    ) : null}
                  </div>
                );
              })()}

              {grossesseIncompatibleDeLaLigne(ligne.medicamentId) ? (
                <div className="flex flex-col gap-3">
                  <Alert level="critical" title="Alerte grossesse bloquante">
                    Ce medicament est contre-indique pendant la grossesse, or
                    la patiente a une grossesse en cours declaree. Retirez
                    cette ligne, ou forcez la prescription ci-dessous avec une
                    justification (tracee dans le journal d&apos;audit).
                  </Alert>
                  <label className="flex items-center gap-2 text-[13px] font-semibold text-encre">
                    <input
                      type="checkbox"
                      checked={ligne.forcerAlerteGrossesse}
                      onChange={(event) => basculerForcageGrossesse(ligne.cle, event.target.checked)}
                    />
                    Forcer cette prescription malgre l&apos;alerte
                  </label>
                  {ligne.forcerAlerteGrossesse ? (
                    <TextField
                      label="Justification du forcage"
                      required
                      hint={`Au moins ${LONGUEUR_MIN_JUSTIFICATION_FORCAGE} caracteres, visible dans l'audit.`}
                      value={ligne.justificationForcage}
                      onChange={(event: ChangeEvent<HTMLInputElement>) =>
                        modifierJustification(ligne.cle, event.target.value)
                      }
                    />
                  ) : null}
                </div>
              ) : null}

              {dureeExcessiveDeLaLigne(ligne) ? (
                <div className="flex flex-col gap-3">
                  <Alert level="warning" title="Avertissement">
                    Duree de traitement superieure a 30 jours pour un
                    antibiotique.
                  </Alert>
                  <label className="flex items-center gap-2 text-[13px] font-semibold text-encre">
                    <input
                      type="checkbox"
                      checked={ligne.confirmerAvertissementDuree}
                      onChange={(event) => basculerConfirmationDuree(ligne.cle, event.target.checked)}
                    />
                    Confirmer malgre l&apos;avertissement
                  </label>
                </div>
              ) : null}
            </div>
          ))}
        </div>

        <div className="flex flex-col gap-2">
          <Button
            type="button"
            variant="secondary"
            className="w-fit"
            onClick={ajouterLigne}
            disabled={limiteDeLignesAtteinte}
          >
            Ajouter un medicament
          </Button>
          <p className="text-[13px] text-encre-attenuee">
            {lignes.length} ligne{lignes.length > 1 ? "s" : ""} sur {NOMBRE_LIGNES_MAX} au maximum.
          </p>
        </div>

        <TextField
          label="Instructions"
          name="instructions"
          hint="Instructions generales pour le patient ou le pharmacien (facultatif)."
        />

        {/*
          RG-PRE-30 du pack : la signature exige une re-authentification,
          sauf si elle a eu lieu depuis moins de 5 minutes
          (reauthentificationRecente, prescription/reauthentification.ts).
        */}
        {!reauthentificationRecente ? (
          <TextField
            label="Mot de passe (signature de l'ordonnance)"
            name="motDePasseSignature"
            type="password"
            required
            autoComplete="current-password"
            hint="Confirmez votre identite pour signer cette prescription."
            value={motDePasseSignature}
            onChange={(event: ChangeEvent<HTMLInputElement>) => setMotDePasseSignature(event.target.value)}
          />
        ) : (
          <p className="text-[13px] text-encre-attenuee">
            Ré-authentification déjà effectuée il y a moins de 5 minutes (RG-PRE-30), mot de passe
            non redemandé.
          </p>
        )}

        <Button
          type="submit"
          variant="primary"
          className="w-fit"
          disabled={
            pending ||
            blocageAllergieNonResolu ||
            blocageAvertissementNonResolu ||
            blocagePosologieIncomplete ||
            blocageMedicamentNonChoisi ||
            blocageMotifNonSubstituable ||
            blocageAgeNonResolu ||
            blocageGrossesseNonResolu ||
            blocageDureeNonResolu ||
            blocagePoidsManquant ||
            blocageDureeAuDessusDuMaximum ||
            (!reauthentificationRecente && motDePasseSignature.length === 0)
          }
        >
          {pending ? "Signature en cours..." : "Signer la prescription"}
        </Button>
      </form>
    </Card>
  );
}
