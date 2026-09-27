import type { EnvoiSmsResume } from "@/modules/notification/sms/dev";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { NOMBRE_MAXIMUM_TENTATIVES } from "@/modules/notification/sms/livraison";
import { EtatVide } from "@/components/ui/EtatVide";

function formaterDateHeure(date: string): string {
  try {
    return new Date(date).toLocaleString("fr-FR", { dateStyle: "long", timeStyle: "short" });
  } catch {
    return date;
  }
}

const PRESENTATION_STATUT: Record<string, { libelle: string; ton: "neutral" | "warning" | "critical" | "good" }> = {
  simule: { libelle: "Simulé", ton: "neutral" },
  envoye: { libelle: "Envoyé", ton: "good" },
  differe: { libelle: "Différé", ton: "warning" },
  en_attente: { libelle: "En attente de reprise", ton: "warning" },
  echec: { libelle: "Échec", ton: "critical" },
};

/** Liste des envois SMS (F-NOT-02, RG-NOT-03), les plus recents en premier. Un envoi en echec est visible ici. */
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
            <Badge tone={(PRESENTATION_STATUT[envoi.statut] ?? PRESENTATION_STATUT.simule).ton}>
              {(PRESENTATION_STATUT[envoi.statut] ?? { libelle: envoi.statut }).libelle}
            </Badge>
          }
        >
          <p className="text-[13px] text-encre">{envoi.texte}</p>
          {envoi.statut === "differe" && envoi.dateProgrammee ? (
            <p className="mt-1 text-[12px] text-encre-attenuee">
              Programmé pour {formaterDateHeure(envoi.dateProgrammee)}
            </p>
          ) : null}
          {envoi.statut === "en_attente" && envoi.prochaineTentativeLe ? (
            <p className="mt-1 text-[12px] text-encre-attenuee">
              Tentative {envoi.tentatives} sur {NOMBRE_MAXIMUM_TENTATIVES} échouée, prochaine reprise le {formaterDateHeure(envoi.prochaineTentativeLe)}
            </p>
          ) : null}
          {envoi.statut === "echec" ? (
            <p role="alert" className="mt-1 text-[12px] font-semibold text-critique">
              Échec après {envoi.tentatives} tentatives{envoi.derniereErreur ? ` : ${envoi.derniereErreur}` : ""}
            </p>
          ) : null}
        </Card>
      ))}
    </div>
  );
}
