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
      {demandes.map((demande) => (
        <Card
          key={demande.journalAuditId}
          title={LIBELLES_TYPE[demande.type] ?? demande.type}
          description={`${demande.demandeurNomComplet} · ${formaterDateHeure(demande.date)}`}
          actions={
            <Badge tone={demande.traite ? "good" : "warning"}>
              {demande.traite ? "Traitée" : "À traiter"}
            </Badge>
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
      ))}
    </div>
  );
}
