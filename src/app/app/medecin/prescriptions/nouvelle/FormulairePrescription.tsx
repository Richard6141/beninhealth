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
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { IconButton } from "@/components/ui/IconButton";
import { SelectField } from "@/components/ui/SelectField";
import { TextField } from "@/components/ui/TextField";

const etatInitial: PrescriptionActionState = { error: null, success: false };

type ChampLigne = "medicamentId" | "posologie" | "quantite" | "dureeTraitementJours";

interface LigneFormulaire {
  cle: number;
  medicamentId: string;
  posologie: string;
  quantite: string;
  dureeTraitementJours: string;
  forcerAlerteAllergie: boolean;
  justificationForcage: string;
  confirmerAvertissement: boolean;
}

function ligneVide(cle: number): LigneFormulaire {
  return {
    cle,
    medicamentId: "",
    posologie: "",
    quantite: "",
    dureeTraitementJours: "",
    forcerAlerteAllergie: false,
    justificationForcage: "",
    confirmerAvertissement: false,
  };
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
  medicaments: MedicamentOption[];
  patientAllergies: string[];
  patientTraitementsActifs: LigneComparable[];
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
  medicaments,
  patientAllergies,
  patientTraitementsActifs,
}: FormulairePrescriptionProps) {
  const [state, formAction, pending] = useActionState(
    creerPrescriptionAction,
    etatInitial
  );
  const [lignes, setLignes] = useState<LigneFormulaire[]>([ligneVide(0)]);
  const prochaineCleRef = useRef(1);

  const optionsMedicaments = medicaments.map((medicament) => ({
    value: medicament.id,
    label: `${medicament.nom} (${medicament.dosage}, ${medicament.forme})`,
  }));

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

  const lignesJSON = JSON.stringify(
    lignes.map(
      ({
        medicamentId,
        posologie,
        quantite,
        dureeTraitementJours,
        forcerAlerteAllergie,
        justificationForcage,
        confirmerAvertissement,
      }) => ({
        medicamentId,
        posologie,
        quantite,
        dureeTraitementJours,
        forcerAlerteAllergie,
        justificationForcage,
        confirmerAvertissement,
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

              <SelectField
                label="Medicament"
                required
                options={optionsMedicaments}
                placeholder="Choisir un medicament"
                value={ligne.medicamentId}
                onChange={(event: ChangeEvent<HTMLSelectElement>) =>
                  modifierLigne(ligne.cle, "medicamentId", event.target.value)
                }
              />

              <TextField
                label="Posologie"
                required
                placeholder="Ex. 1 comprime matin et soir"
                value={ligne.posologie}
                onChange={(event: ChangeEvent<HTMLInputElement>) =>
                  modifierLigne(ligne.cle, "posologie", event.target.value)
                }
              />

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
                  unit="jours"
                  required
                  value={ligne.dureeTraitementJours}
                  onChange={(event: ChangeEvent<HTMLInputElement>) =>
                    modifierLigne(ligne.cle, "dureeTraitementJours", event.target.value)
                  }
                />
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
            </div>
          ))}
        </div>

        <Button type="button" variant="secondary" className="w-fit" onClick={ajouterLigne}>
          Ajouter un medicament
        </Button>

        <TextField
          label="Instructions"
          name="instructions"
          hint="Instructions generales pour le patient ou le pharmacien (facultatif)."
        />

        <Button
          type="submit"
          variant="primary"
          className="w-fit"
          disabled={pending || blocageAllergieNonResolu || blocageAvertissementNonResolu}
        >
          {pending ? "Enregistrement en cours..." : "Enregistrer la prescription"}
        </Button>
      </form>
    </Card>
  );
}
