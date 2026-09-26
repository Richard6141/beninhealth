import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getSignalementsAnomalies } from "@/modules/audit/anomalies";
import { Alert } from "@/components/ui/Alert";
import { ListeSignalementsAnomalies } from "./ListeSignalementsAnomalies";

/**
 * Ecran "Détection d'anomalies d'accès" (F-AUD-04 du pack), reserve a
 * admin_national. Detection relancee a chaque chargement (voir
 * src/modules/audit/anomalies.ts pour le detail des 4 regles implementees
 * et les 3 laissees de cote).
 */
export default async function AnomaliesAccesPage() {
  const signalements = await getSignalementsAnomalies();

  return (
    <div className="conteneur-page mx-auto flex flex-col gap-8 px-4 py-8 sm:px-6">
      <Link
        href="/app/ministere/audit"
        className="inline-flex w-fit items-center gap-1 text-[13px] font-semibold text-accent hover:underline"
      >
        <ArrowLeft size={14} aria-hidden="true" />
        Retour au journal d&apos;audit
      </Link>

      <header className="flex flex-col gap-2">
        <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-accent">Ministère</p>
        <h1 className="text-[28px] font-bold text-titre">Anomalies d&apos;accès</h1>
        <p className="max-w-2xl text-[15px] text-encre-secondaire">
          Signalements automatiques : accès d&apos;urgence fréquents, connexions multi-IP, dossiers
          distincts élevés, nom de famille identique entre le professionnel et le patient consulté.
        </p>
      </header>

      {signalements === null ? (
        <Alert level="critical" title="Accès refusé">
          Votre session n&apos;a pas les droits nécessaires pour consulter les anomalies d&apos;accès.
        </Alert>
      ) : (
        <ListeSignalementsAnomalies signalements={signalements} />
      )}
    </div>
  );
}
