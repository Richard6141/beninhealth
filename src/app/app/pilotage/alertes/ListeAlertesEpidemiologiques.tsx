import { AlertTriangle } from "lucide-react";
import type { AlerteEpidemiologique } from "@/modules/pilotage/alertes";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { EtatVide } from "@/components/ui/EtatVide";
import { FormulaireRevueAlerte } from "./FormulaireRevueAlerte";

function formaterDateHeure(date: string): string {
  try {
    return new Date(date).toLocaleString("fr-FR", { dateStyle: "long", timeStyle: "short" });
  } catch {
    return date;
  }
}

const LIBELLES_STATUT: Record<AlerteEpidemiologique["statut"], string> = {
  nouvelle: "Nouvelle",
  vue: "Vue",
  fermee: "Fermée",
};

const TONE_STATUT: Record<AlerteEpidemiologique["statut"], "warning" | "info" | "neutral"> = {
  nouvelle: "warning",
  vue: "info",
  fermee: "neutral",
};

/** Liste des alertes epidemiologiques (F-PIL-06), les plus recentes en premier. */
export function ListeAlertesEpidemiologiques({ alertes }: { alertes: AlerteEpidemiologique[] }) {
  if (alertes.length === 0) {
    return (
      <EtatVide
        titre="Aucune alerte pour le moment"
        description="Un signal apparaîtra ici dès qu'un groupe de maladies dépassera le seuil sur une zone sanitaire."
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {alertes.map((alerte) => (
        <Card
          key={alerte.id}
          title={`${alerte.groupeMaladiesLibelle} · ${alerte.zoneSanitaireNom}`}
          description={`Semaine ${alerte.semaine} · ${formaterDateHeure(alerte.dateCreation)}`}
          actions={<Badge tone={TONE_STATUT[alerte.statut]}>{LIBELLES_STATUT[alerte.statut]}</Badge>}
        >
          <div className="flex flex-col gap-3">
            <p className="flex items-start gap-2 text-[13px] text-encre">
              <AlertTriangle size={16} className="mt-0.5 shrink-0 text-vigilance" aria-hidden="true" />
              {alerte.casObserves} cas observés (seuil : {alerte.seuilCalcule}).
            </p>

            {alerte.statut === "fermee" ? (
              <div className="rounded-champ border border-bordure bg-plan p-3">
                <p className="mb-1 text-[12px] font-semibold uppercase tracking-[0.05em] text-encre-attenuee">
                  Fermée par {alerte.reviewerNomComplet}
                  {alerte.dateRevue ? ` · ${formaterDateHeure(alerte.dateRevue)}` : ""}
                </p>
                <p className="text-[13px] text-encre-secondaire">{alerte.motifFermeture}</p>
              </div>
            ) : (
              <>
                {alerte.statut === "vue" && alerte.reviewerNomComplet ? (
                  <p className="text-[12px] text-encre-attenuee">
                    Vue par {alerte.reviewerNomComplet}
                    {alerte.dateRevue ? ` · ${formaterDateHeure(alerte.dateRevue)}` : ""}
                  </p>
                ) : null}
                <FormulaireRevueAlerte alerteId={alerte.id} dejaVue={alerte.statut === "vue"} />
              </>
            )}
          </div>
        </Card>
      ))}
    </div>
  );
}
