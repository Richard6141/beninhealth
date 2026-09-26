"use client";

import { useActionState, useState } from "react";
import type { ChangeEvent } from "react";
import {
  delivrerPrescriptionAction,
  type LignePourDelivrance,
  type PrescriptionActionState,
} from "@/modules/prescription/actions";
import { MOTIFS_NON_DELIVRANCE_VALEURS, libelleMotifNonDelivrance } from "@/modules/prescription/referentiel-delivrance";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { SelectField } from "@/components/ui/SelectField";
import { TextField } from "@/components/ui/TextField";

const etatInitial: PrescriptionActionState = { error: null, success: false };

interface LigneFormulaire {
  ligneId: string;
  quantiteDelivree: string;
  medicamentDelivreId: string;
  motifNonDelivrance: string;
  numeroLot: string;
  datePeremption: string;
}

function ligneInitiale(ligne: LignePourDelivrance): LigneFormulaire {
  return {
    ligneId: ligne.ligneId,
    // Par defaut, on propose une delivrance complete de la quantite
    // restante : le pharmacien ajuste a la baisse si besoin (rupture de
    // stock, refus du patient...), voir motifNonDelivrance ci-dessous.
    quantiteDelivree: String(ligne.quantiteRestante),
    medicamentDelivreId: ligne.medicamentId,
    motifNonDelivrance: "",
    numeroLot: "",
    datePeremption: "",
  };
}

const optionsMotif = MOTIFS_NON_DELIVRANCE_VALEURS.map((motif) => ({
  value: motif,
  label: libelleMotifNonDelivrance(motif),
}));

/**
 * Formulaire de delivrance ligne a ligne (F-PHA-03 du pack) : pour chaque
 * ligne de la prescription, la quantite reellement remise (0 a la quantite
 * restante), le produit delivre (identique ou substitue, jamais si la ligne
 * est non substituable, RG-PHA-12) et, si la quantite est nulle ou
 * partielle, un motif obligatoire. Les lignes deja entierement delivrees
 * (quantiteRestante = 0, ex. lors d'une correction apres une delivrance
 * partielle anterieure) sont affichees en lecture seule : le formulaire
 * soumet tout de meme une quantite de 0 pour elles, cote serveur exige que
 * chaque ligne de la prescription soit couverte exactement une fois.
 */
export function FormulaireDelivrance({
  prescriptionId,
  lignes,
}: {
  prescriptionId: string;
  lignes: LignePourDelivrance[];
}) {
  const [state, formAction, pending] = useActionState(delivrerPrescriptionAction, etatInitial);
  const [valeurs, setValeurs] = useState<LigneFormulaire[]>(() => lignes.map(ligneInitiale));

  function modifier(ligneId: string, champ: keyof Omit<LigneFormulaire, "ligneId">, valeur: string) {
    setValeurs((actuelles) =>
      actuelles.map((ligne) => (ligne.ligneId === ligneId ? { ...ligne, [champ]: valeur } : ligne))
    );
  }

  // Le champ interne "ligneId" correspond a "lignePrescriptionId" cote
  // serveur (delivrerPrescriptionAction) : renomme ici, au seul point de
  // serialisation, plutot que dans tout le composant.
  const lignesJSON = JSON.stringify(
    valeurs.map(({ ligneId, ...reste }) => ({ lignePrescriptionId: ligneId, ...reste }))
  );

  const blocageMotifManquant = lignes.some((ligne) => {
    const valeur = valeurs.find((candidate) => candidate.ligneId === ligne.ligneId);
    if (!valeur) return false;
    const quantiteSaisie = Number(valeur.quantiteDelivree);
    return (
      Number.isFinite(quantiteSaisie) &&
      quantiteSaisie < ligne.quantiteRestante &&
      valeur.motifNonDelivrance.length === 0
    );
  });

  if (state.success) {
    return (
      <Alert level="success" title="Délivrance enregistrée">
        La délivrance a bien été enregistrée et le statut de la prescription a été mis à jour.
      </Alert>
    );
  }

  return (
    <Card
      title="Enregistrer une délivrance"
      description="Indiquez, pour chaque ligne, la quantité réellement remise au patient."
    >
      <form action={formAction} aria-busy={pending} className="flex flex-col gap-6">
        <input type="hidden" name="prescriptionId" value={prescriptionId} />
        <input type="hidden" name="lignesJSON" value={lignesJSON} />

        {state.error ? (
          <Alert level="critical" title="Délivrance impossible">
            {state.error}
          </Alert>
        ) : null}

        <div className="flex flex-col gap-5">
          {lignes.map((ligne) => {
            const valeur = valeurs.find((candidate) => candidate.ligneId === ligne.ligneId);
            if (!valeur) return null;

            const dejaComplete = ligne.quantiteRestante === 0;
            const quantiteSaisie = Number(valeur.quantiteDelivree);
            const partielleOuNulle =
              Number.isFinite(quantiteSaisie) && quantiteSaisie < ligne.quantiteRestante;

            const optionsSubstitution = [
              { value: ligne.medicamentId, label: `${ligne.medicamentNom} (tel que prescrit)` },
              ...ligne.substitutsPossibles.map((substitut) => ({
                value: substitut.id,
                label: `${substitut.nom} (${substitut.dosage}, ${substitut.forme}, générique)`,
              })),
            ];

            return (
              <div
                key={ligne.ligneId}
                className="flex flex-col gap-3 rounded-champ border border-bordure bg-plan p-4"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-[15px] font-bold text-encre">{ligne.medicamentNom}</span>
                  <span className="text-[13px] text-encre-attenuee">
                    {ligne.dosage}, {ligne.forme}
                  </span>
                </div>
                <p className="text-[13px] text-encre-secondaire">{ligne.posologie}</p>
                <p className="text-[12px] text-encre-attenuee">
                  Prescrit : {ligne.quantitePrescrite} · Déjà délivré : {ligne.quantiteDejaLivree} · Restant :{" "}
                  {ligne.quantiteRestante}
                </p>

                {dejaComplete ? (
                  <Alert level="info" title="Ligne déjà entièrement délivrée">
                    Aucune action nécessaire pour cette ligne.
                  </Alert>
                ) : (
                  <>
                    <TextField
                      label="Quantité délivrée"
                      type="number"
                      min={0}
                      max={ligne.quantiteRestante}
                      required
                      hint={`De 0 à ${ligne.quantiteRestante}.`}
                      value={valeur.quantiteDelivree}
                      onChange={(event: ChangeEvent<HTMLInputElement>) =>
                        modifier(ligne.ligneId, "quantiteDelivree", event.target.value)
                      }
                    />

                    {ligne.nonSubstituable ? (
                      <p className="text-[13px] font-semibold text-vigilance">
                        Ligne non substituable : uniquement {ligne.medicamentNom}.
                      </p>
                    ) : (
                      <SelectField
                        label="Produit délivré"
                        options={optionsSubstitution}
                        value={valeur.medicamentDelivreId}
                        onChange={(event: ChangeEvent<HTMLSelectElement>) =>
                          modifier(ligne.ligneId, "medicamentDelivreId", event.target.value)
                        }
                      />
                    )}

                    {partielleOuNulle ? (
                      <SelectField
                        label="Motif (quantité nulle ou partielle)"
                        required
                        placeholder="Choisir un motif"
                        options={optionsMotif}
                        value={valeur.motifNonDelivrance}
                        onChange={(event: ChangeEvent<HTMLSelectElement>) =>
                          modifier(ligne.ligneId, "motifNonDelivrance", event.target.value)
                        }
                      />
                    ) : null}

                    <div className="grid gap-4 sm:grid-cols-2">
                      <TextField
                        label="Numéro de lot"
                        value={valeur.numeroLot}
                        onChange={(event: ChangeEvent<HTMLInputElement>) =>
                          modifier(ligne.ligneId, "numeroLot", event.target.value)
                        }
                      />
                      <TextField
                        label="Date de péremption"
                        type="date"
                        value={valeur.datePeremption}
                        onChange={(event: ChangeEvent<HTMLInputElement>) =>
                          modifier(ligne.ligneId, "datePeremption", event.target.value)
                        }
                      />
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>

        <Button type="submit" variant="primary" className="w-fit" disabled={pending || blocageMotifManquant}>
          {pending ? "Enregistrement..." : "Confirmer la délivrance"}
        </Button>
      </form>
    </Card>
  );
}
