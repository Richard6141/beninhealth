"use client";

import { useActionState, useEffect, useId, useState } from "react";
import { useRouter } from "next/navigation";
import { ShieldQuestion } from "lucide-react";
import {
  approuverFusionAction,
  refuserFusionAction,
  type DecisionFusionActionState,
  type FusionEnAttenteResume,
} from "@/modules/patient/fusion-doublons";
import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

const etatInitial: DecisionFusionActionState = { error: null, success: false };

function formaterDate(date: string): string {
  try {
    return new Date(date).toLocaleString("fr-FR", { dateStyle: "long", timeStyle: "short" });
  } catch {
    return date;
  }
}

const LIBELLE_ECART: Record<string, string> = { sexe: "sexe différent", date_naissance: "date de naissance différente" };

function ColonneIdentite({ titre, cote }: { titre: string; cote: FusionEnAttenteResume["principal"] }) {
  return (
    <div className="flex flex-1 flex-col gap-1 rounded-champ border border-bordure bg-surface p-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-encre-attenuee">{titre}</p>
      <p className="chiffres text-[12px] text-encre-secondaire">{cote.identifiantSante}</p>
      <p className="text-[15px] font-semibold text-encre">{cote.nomComplet}</p>
      <p className="text-[13px] text-encre-secondaire">
        Né(e) le {formaterDate(cote.dateNaissance).split(" à")[0]}, {cote.sexe === "M" ? "homme" : "femme"}
      </p>
    </div>
  );
}

function LigneFusionEnAttente({ demande }: { demande: FusionEnAttenteResume }) {
  const router = useRouter();
  const [approbation, actionApprobation, pendingApprobation] = useActionState(approuverFusionAction, etatInitial);
  const [refus, actionRefus, pendingRefus] = useActionState(refuserFusionAction, etatInitial);
  const [refusOuvert, setRefusOuvert] = useState(false);
  const motifId = useId();

  useEffect(() => {
    if (approbation.success || refus.success) router.refresh();
  }, [approbation.success, refus.success, router]);

  if (approbation.success) {
    return (
      <Alert level="success" title="Fusion approuvée">
        Les données du dossier absorbé ont été déplacées vers le dossier conservé.
      </Alert>
    );
  }
  if (refus.success) {
    return (
      <Alert level="info" title="Fusion refusée">
        Aucune donnée n&apos;a été déplacée. La paire peut de nouveau être examinée.
      </Alert>
    );
  }

  return (
    <Card>
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap gap-1.5">
            {demande.ecarts.map((ecart) => (
              <Badge key={ecart} tone="warning">
                {LIBELLE_ECART[ecart] ?? ecart}
              </Badge>
            ))}
          </div>
          <p className="text-[12px] text-encre-attenuee">
            Demandé par {demande.demandePar} le {formaterDate(demande.dateDemande)}
            {demande.estDemandeParMoi ? " (vous)" : ""}
          </p>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row">
          <ColonneIdentite titre="Dossier conservé" cote={demande.principal} />
          <ColonneIdentite titre="Dossier absorbé" cote={demande.secondaire} />
        </div>

        <p className="text-[13px] text-encre-secondaire">
          <span className="font-semibold text-encre">Justification :</span> {demande.justification}
        </p>

        {demande.estDemandeParMoi ? (
          <Alert level="info" title="Confirmation d'un autre administrateur requise">
            Vous avez demandé cette fusion : elle doit être confirmée par un autre administrateur (RG-ADM-41).
          </Alert>
        ) : (
          <>
            {approbation.error ? (
              <Alert level="critical" title="Approbation refusée">
                {approbation.error}
              </Alert>
            ) : null}
            {refus.error ? (
              <Alert level="critical" title="Refus impossible">
                {refus.error}
              </Alert>
            ) : null}

            <div className="flex flex-wrap gap-2">
              <form action={actionApprobation}>
                <input type="hidden" name="fusionId" value={demande.id} />
                <Button type="submit" variant="primary" size="sm" disabled={pendingApprobation || pendingRefus}>
                  {pendingApprobation ? "Approbation..." : "Approuver et fusionner"}
                </Button>
              </form>
              {refusOuvert ? (
                <form action={actionRefus} className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-end">
                  <input type="hidden" name="fusionId" value={demande.id} />
                  <div className="flex flex-1 flex-col gap-1">
                    <label htmlFor={motifId} className="text-[12px] font-semibold text-encre">
                      Motif du refus
                    </label>
                    <input
                      id={motifId}
                      name="motif"
                      required
                      minLength={5}
                      className="h-10 rounded-champ border border-bordure-forte bg-surface px-3 text-[14px] text-encre"
                    />
                  </div>
                  <Button type="submit" variant="danger" size="sm" disabled={pendingRefus}>
                    {pendingRefus ? "Refus..." : "Confirmer le refus"}
                  </Button>
                </form>
              ) : (
                <Button type="button" variant="secondary" size="sm" onClick={() => setRefusOuvert(true)} disabled={pendingApprobation}>
                  Refuser
                </Button>
              )}
            </div>
          </>
        )}
      </div>
    </Card>
  );
}

/** Fusions en attente d'une seconde approbation (RG-ADM-41 : sexe ou date de naissance différents). */
export function SectionFusionsEnAttente({ demandes }: { demandes: FusionEnAttenteResume[] }) {
  if (demandes.length === 0) return null;

  return (
    <section aria-labelledby="titre-fusions-attente" className="flex flex-col gap-4">
      <h2 id="titre-fusions-attente" className="flex items-center gap-2 text-[20px] font-bold text-encre">
        <ShieldQuestion size={20} aria-hidden="true" />
        Fusions en attente d&apos;une seconde approbation ({demandes.length})
      </h2>
      <div className="flex flex-col gap-4">
        {demandes.map((demande) => (
          <LigneFusionEnAttente key={demande.id} demande={demande} />
        ))}
      </div>
    </section>
  );
}
