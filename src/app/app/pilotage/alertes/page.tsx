import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getAlertesEpidemiologiques } from "@/modules/pilotage/alertes";
import { Alert } from "@/components/ui/Alert";
import { ListeAlertesEpidemiologiques } from "./ListeAlertesEpidemiologiques";

/**
 * Ecran "Alertes épidémiologiques" (F-PIL-06 du pack), réservé à
 * admin_national. Lecture seule : la détection tourne en tâche planifiée
 * horaire, jamais au chargement de cette page (voir
 * src/modules/pilotage/detection-alertes.ts pour le détail du seuil et ses
 * limites assumées).
 */
export default async function AlertesEpidemiologiquesPage() {
  const alertes = await getAlertesEpidemiologiques();

  return (
    <div className="conteneur-page mx-auto flex flex-col gap-8 px-4 py-8 sm:px-6">
      <Link
        href="/app/pilotage"
        className="inline-flex w-fit items-center gap-1 text-[13px] font-semibold text-accent hover:underline"
      >
        <ArrowLeft size={14} aria-hidden="true" />
        Retour au pilotage national
      </Link>

      <header className="flex flex-col gap-2">
        <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-accent">Ministère</p>
        <h1 className="text-[28px] font-bold text-titre">Alertes épidémiologiques</h1>
        <p className="max-w-2xl text-[15px] text-encre-secondaire">
          Signal automatique quand le nombre de cas d&apos;un groupe de maladies, sur une semaine et une
          zone sanitaire, dépasse un seuil par défaut. Un signal à vérifier par un humain, jamais une
          communication automatique. La détection s&apos;exécute automatiquement toutes les heures ; le
          nombre de cas affiché est celui constaté au moment du signal.
        </p>
      </header>

      {alertes === null ? (
        <Alert level="critical" title="Accès refusé">
          Votre session n&apos;a pas les droits nécessaires pour consulter les alertes épidémiologiques.
        </Alert>
      ) : (
        <ListeAlertesEpidemiologiques alertes={alertes} />
      )}
    </div>
  );
}
