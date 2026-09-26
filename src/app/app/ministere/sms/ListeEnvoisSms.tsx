import type { EnvoiSmsResume } from "@/modules/notification/sms/dev";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { EtatVide } from "@/components/ui/EtatVide";

function formaterDateHeure(date: string): string {
  try {
    return new Date(date).toLocaleString("fr-FR", { dateStyle: "long", timeStyle: "short" });
  } catch {
    return date;
  }
}

/** Liste des envois SMS simules (F-NOT-02), les plus recents en premier. */
export function ListeEnvoisSms({ envois }: { envois: EnvoiSmsResume[] }) {
  if (envois.length === 0) {
    return (
      <EtatVide
        titre="Aucun envoi pour le moment"
        description="Les SMS simulés (rappels, alertes, codes) apparaîtront ici."
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {envois.map((envoi) => (
        <Card
          key={envoi.id}
          title={envoi.destinataireMasque}
          description={`${envoi.categorie} · ${formaterDateHeure(envoi.dateEnvoi)}`}
          actions={
            <Badge tone={envoi.statut === "differe" ? "warning" : "neutral"}>
              {envoi.statut === "differe" ? "Différé" : "Simulé"}
            </Badge>
          }
        >
          <p className="text-[13px] text-encre">{envoi.texte}</p>
          {envoi.statut === "differe" && envoi.dateProgrammee ? (
            <p className="mt-1 text-[12px] text-encre-attenuee">
              Programmé pour {formaterDateHeure(envoi.dateProgrammee)}
            </p>
          ) : null}
        </Card>
      ))}
    </div>
  );
}
