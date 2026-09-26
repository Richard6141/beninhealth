import { AlertTriangle } from "lucide-react";
import type { SignalementAnomalie } from "@/modules/audit/anomalies";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { EtatVide } from "@/components/ui/EtatVide";
import { FormulaireCloture } from "./FormulaireCloture";

function formaterDateHeure(date: string): string {
  try {
    return new Date(date).toLocaleString("fr-FR", { dateStyle: "long", timeStyle: "short" });
  } catch {
    return date;
  }
}

/** Liste des signalements d'anomalies d'acces (F-AUD-03), les plus recents en premier. */
export function ListeSignalementsAnomalies({ signalements }: { signalements: SignalementAnomalie[] }) {
  if (signalements.length === 0) {
    return (
      <EtatVide
        titre="Aucune anomalie détectée"
        description="Les signalements automatiques apparaîtront ici dès qu'une règle sera dépassée."
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {signalements.map((signalement) => (
        <Card
          key={signalement.id}
          title={signalement.utilisateurNomComplet}
          description={`${signalement.regle} · ${formaterDateHeure(signalement.dateDetection)}`}
          actions={
            <Badge tone={signalement.statut === "nouveau" ? "warning" : "neutral"}>
              {signalement.statut === "nouveau" ? "Nouveau" : "Fermé"}
            </Badge>
          }
        >
          <div className="flex flex-col gap-3">
            <p className="flex items-start gap-2 text-[13px] text-encre">
              <AlertTriangle size={16} className="mt-0.5 shrink-0 text-vigilance" aria-hidden="true" />
              {signalement.detail}
            </p>

            {signalement.statut === "ferme" ? (
              <div className="rounded-champ border border-bordure bg-plan p-3">
                <p className="mb-1 text-[12px] font-semibold uppercase tracking-[0.05em] text-encre-attenuee">
                  Fermé par {signalement.reviewerNomComplet}
                  {signalement.dateRevue ? ` · ${formaterDateHeure(signalement.dateRevue)}` : ""}
                </p>
                <p className="text-[13px] text-encre-secondaire">{signalement.commentaire}</p>
              </div>
            ) : (
              <FormulaireCloture signalementId={signalement.id} />
            )}
          </div>
        </Card>
      ))}
    </div>
  );
}
