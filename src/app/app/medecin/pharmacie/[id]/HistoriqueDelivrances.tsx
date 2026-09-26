"use client";

import { useActionState, useState } from "react";
import type { ChangeEvent } from "react";
import {
  annulerDelivranceAction,
  type DelivranceResume,
  type PrescriptionActionState,
} from "@/modules/prescription/actions";
import {
  LONGUEUR_MIN_MOTIF_ANNULATION_DELIVRANCE,
  libelleMotifNonDelivrance,
  millisecondesRestantesAnnulation,
} from "@/modules/prescription/referentiel-delivrance";
import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

const etatInitial: PrescriptionActionState = { error: null, success: false };

function formaterDateHeure(date: string): string {
  try {
    return new Date(date).toLocaleString("fr-FR", { dateStyle: "long", timeStyle: "short" });
  } catch {
    return date;
  }
}

/** "Xh Ymin" a partir d'une duree en millisecondes, pour l'affichage du temps restant avant expiration (RG-PHA-13). */
function formaterDureeRestante(ms: number): string {
  const minutesTotal = Math.floor(ms / 60000);
  const heures = Math.floor(minutesTotal / 60);
  const minutes = minutesTotal % 60;
  return heures > 0 ? `${heures} h ${minutes} min` : `${minutes} min`;
}

function CarteDelivrance({ delivrance }: { delivrance: DelivranceResume }) {
  const [state, formAction, pending] = useActionState(annulerDelivranceAction, etatInitial);
  const [formulaireOuvert, setFormulaireOuvert] = useState(false);
  const [motif, setMotif] = useState("");

  const msRestantes = millisecondesRestantesAnnulation(new Date(delivrance.date));

  return (
    <div className="flex flex-col gap-3 rounded-champ border border-bordure bg-plan p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-[13px] font-semibold text-encre">{formaterDateHeure(delivrance.date)}</p>
          <p className="text-[12px] text-encre-attenuee">Par {delivrance.pharmacienNomComplet}</p>
        </div>
        {delivrance.annulee ? (
          <Badge tone="critical">Annulée</Badge>
        ) : delivrance.peutEtreAnnulee ? (
          <Badge tone="neutral">Annulable encore {formaterDureeRestante(msRestantes)}</Badge>
        ) : (
          <Badge tone="neutral">Délai d&apos;annulation dépassé</Badge>
        )}
      </div>

      <ul className="flex flex-col gap-1">
        {delivrance.lignes.map((ligne, index) => (
          <li key={index} className="text-[13px] text-encre-secondaire">
            <span className="font-semibold text-encre">{ligne.medicamentNom}</span> : {ligne.quantiteDelivree}{" "}
            unité{ligne.quantiteDelivree > 1 ? "s" : ""}
            {ligne.medicamentDelivreNom ? ` (substitué par ${ligne.medicamentDelivreNom})` : ""}
            {ligne.motifNonDelivrance ? ` : ${libelleMotifNonDelivrance(ligne.motifNonDelivrance)}` : ""}
          </li>
        ))}
      </ul>

      {delivrance.annulee && delivrance.motifAnnulation ? (
        <Alert level="warning" title="Délivrance annulée">
          {delivrance.motifAnnulation}
        </Alert>
      ) : null}

      {state.success ? (
        <Alert level="success" title="Annulation enregistrée">
          Les quantités annulées sont de nouveau disponibles à la délivrance.
        </Alert>
      ) : null}
      {state.error ? (
        <Alert level="critical" title="Annulation impossible">
          {state.error}
        </Alert>
      ) : null}

      {delivrance.peutEtreAnnulee && !state.success ? (
        formulaireOuvert ? (
          <form action={formAction} className="flex flex-col gap-2">
            <input type="hidden" name="delivranceId" value={delivrance.id} />
            <textarea
              name="motif"
              required
              rows={2}
              placeholder={`Motif de l'annulation (au moins ${LONGUEUR_MIN_MOTIF_ANNULATION_DELIVRANCE} caractères)`}
              value={motif}
              onChange={(event: ChangeEvent<HTMLTextAreaElement>) => setMotif(event.target.value)}
              className="rounded-champ border border-bordure-forte bg-surface px-3 py-2 text-[14px] text-encre placeholder:text-encre-attenuee transition-colors motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2"
            />
            <div className="flex flex-wrap gap-2">
              <Button
                type="submit"
                variant="danger"
                size="sm"
                disabled={pending || motif.trim().length < LONGUEUR_MIN_MOTIF_ANNULATION_DELIVRANCE}
              >
                {pending ? "Annulation..." : "Confirmer l'annulation"}
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => setFormulaireOuvert(false)}>
                Fermer
              </Button>
            </div>
          </form>
        ) : (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="w-fit"
            onClick={() => setFormulaireOuvert(true)}
          >
            Annuler cette délivrance
          </Button>
        )
      ) : null}
    </div>
  );
}

/**
 * Historique des delivrances deja enregistrees pour une prescription
 * (F-PHA-03) : chacune avec ses lignes et, si applicable, un moyen de
 * l'annuler (RG-PHA-13, fenetre de 24h par la meme pharmacie). Passe la
 * fenetre, l'option d'annulation est grisee au profit d'un badge explicite.
 */
export function HistoriqueDelivrances({ delivrances }: { delivrances: DelivranceResume[] }) {
  if (delivrances.length === 0) {
    return null;
  }

  return (
    <Card title="Délivrances déjà enregistrées">
      <div className="flex flex-col gap-3">
        {delivrances.map((delivrance) => (
          <CarteDelivrance key={delivrance.id} delivrance={delivrance} />
        ))}
      </div>
    </Card>
  );
}
