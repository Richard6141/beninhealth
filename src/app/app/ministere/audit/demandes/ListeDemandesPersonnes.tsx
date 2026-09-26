import { FileWarning } from "lucide-react";
import type { DemandePersonne } from "@/modules/audit/demandes";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { EtatVide } from "@/components/ui/EtatVide";
import { FormulaireTraitement } from "./FormulaireTraitement";

const LIBELLES_TYPE: Record<string, string> = {
  demande_rectification: "Demande de rectification",
  signalement_acces_suspect: "Signalement d'accès suspect",
};

function formaterDateHeure(date: string): string {
  try {
    return new Date(date).toLocaleString("fr-FR", { dateStyle: "long", timeStyle: "short" });
  } catch {
    return date;
  }
}

/** Libelle + ton du badge de delai (objectif F-AUD-04 : reponse sous 30 jours). */
function badgeDelai(demande: DemandePersonne): { texte: string; tone: "good" | "warning" | "critical" } {
  if (demande.traite) {
    return demande.joursRestantsObjectif >= 0
      ? { texte: "Traitée dans les délais", tone: "good" }
      : { texte: `Traitée avec ${Math.abs(demande.joursRestantsObjectif)} j de retard`, tone: "warning" };
  }
  if (demande.joursRestantsObjectif < 0) {
    return { texte: `Délai dépassé de ${Math.abs(demande.joursRestantsObjectif)} j`, tone: "critical" };
  }
  if (demande.joursRestantsObjectif <= 7) {
    return { texte: `${demande.joursRestantsObjectif} j restants`, tone: "warning" };
  }
  return { texte: `${demande.joursRestantsObjectif} j restants`, tone: "good" };
}

/**
 * Liste des demandes des personnes (F-AUD-04), les plus recentes en
 * premier : demande de rectification ou signalement d'acces suspect,
 * chacune avec son statut de traitement.
 */
export function ListeDemandesPersonnes({ demandes }: { demandes: DemandePersonne[] }) {
  if (demandes.length === 0) {
    return (
      <EtatVide
        titre="Aucune demande pour le moment"
        description="Les demandes de rectification et signalements d'accès suspects apparaîtront ici."
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {demandes.map((demande) => {
        const delai = badgeDelai(demande);
        return (
        <Card
          key={demande.journalAuditId}
          title={LIBELLES_TYPE[demande.type] ?? demande.type}
          description={`${demande.demandeurNomComplet} · ${formaterDateHeure(demande.date)}`}
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={demande.traite ? "good" : "warning"}>
                {demande.traite ? "Traitée" : "À traiter"}
              </Badge>
              <Badge tone={delai.tone}>{delai.texte}</Badge>
            </div>
          }
        >
          <div className="flex flex-col gap-3">
            <p className="flex items-start gap-2 text-[13px] text-encre">
              <FileWarning size={16} className="mt-0.5 shrink-0 text-encre-attenuee" aria-hidden="true" />
              {demande.contenu}
            </p>

            {demande.traite ? (
              <div className="rounded-champ border border-bordure bg-plan p-3">
                <p className="mb-1 text-[12px] font-semibold uppercase tracking-[0.05em] text-encre-attenuee">
                  Réponse de {demande.traiteParNomComplet}
                  {demande.dateTraitement ? ` · ${formaterDateHeure(demande.dateTraitement)}` : ""}
                </p>
                <p className="text-[13px] text-encre-secondaire">{demande.reponse}</p>
              </div>
            ) : (
              <FormulaireTraitement journalAuditId={demande.journalAuditId} />
            )}
          </div>
        </Card>
        );
      })}
    </div>
  );
}
