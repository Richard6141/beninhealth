import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { rechercherJournalAudit, type FiltresJournalAudit } from "@/modules/audit/actions";
import { Alert } from "@/components/ui/Alert";
import { ListeJournalAudit } from "../../etablissement/audit/ListeJournalAudit";

interface AuditPageProps {
  searchParams: Promise<{
    dateDebut?: string | string[];
    dateFin?: string | string[];
    acteur?: string | string[];
    patient?: string | string[];
    action?: string | string[];
    etablissementId?: string | string[];
    page?: string | string[];
  }>;
}

function premiereValeur(valeur: string | string[] | undefined): string {
  if (Array.isArray(valeur)) return valeur[0] ?? "";
  return valeur ?? "";
}

function dateISO(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Ecran "Rechercher dans le journal d'audit" (F-AUD-01 du pack), reserve au
 * ministere (admin_national), visibilite sur tous les etablissements
 * (adaptation documentee dans src/modules/audit/actions.ts : le pack imagine
 * un role AUDITOR distinct, absent de ce depot ; admin_national en est
 * l'equivalent le plus proche).
 */
export default async function AuditMinisterePage({ searchParams }: AuditPageProps) {
  const params = await searchParams;
  const aujourdHui = new Date();
  const ilYA7Jours = new Date(aujourdHui.getTime() - 7 * 24 * 60 * 60 * 1000);

  const filtres: FiltresJournalAudit = {
    dateDebut: premiereValeur(params.dateDebut) || dateISO(ilYA7Jours),
    dateFin: premiereValeur(params.dateFin) || dateISO(aujourdHui),
    acteur: premiereValeur(params.acteur) || undefined,
    patientIdentifiantSante: premiereValeur(params.patient) || undefined,
    action: premiereValeur(params.action) || undefined,
    etablissementId: premiereValeur(params.etablissementId) || undefined,
    page: Number(premiereValeur(params.page)) || 1,
  };

  const resultat = await rechercherJournalAudit(filtres);

  return (
    <div className="conteneur-page mx-auto flex flex-col gap-8 px-4 py-8 sm:px-6">
      <Link
        href="/app/ministere"
        className="inline-flex w-fit items-center gap-1 text-[13px] font-semibold text-accent hover:underline"
      >
        <ArrowLeft size={14} aria-hidden="true" />
        Retour au tableau de bord
      </Link>

      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-accent">Ministère</p>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/app/ministere/audit/urgences"
              className="text-[13px] font-semibold text-accent hover:underline"
            >
              Accès d&apos;urgence à revoir
            </Link>
            <Link
              href="/app/ministere/audit/demandes"
              className="text-[13px] font-semibold text-accent hover:underline"
            >
              Demandes des personnes
            </Link>
            <Link
              href="/app/ministere/audit/anomalies"
              className="text-[13px] font-semibold text-accent hover:underline"
            >
              Anomalies d&apos;accès
            </Link>
            <Link
              href="/app/ministere/audit/integrite"
              className="text-[13px] font-semibold text-accent hover:underline"
            >
              Vérifier l&apos;intégrité
            </Link>
          </div>
        </div>
        <h1 className="text-[28px] font-bold text-titre">Journal d&apos;audit</h1>
        <p className="max-w-2xl text-[15px] text-encre-secondaire">
          Historique des actions tracées sur l&apos;ensemble de la plateforme, filtrable par période, acteur,
          patient, établissement et type d&apos;action.
        </p>
      </header>

      {resultat === null ? (
        <Alert level="critical" title="Recherche impossible">
          La période demandée dépasse 31 jours, ou votre session n&apos;a pas les droits nécessaires.
        </Alert>
      ) : (
        <ListeJournalAudit resultat={resultat} filtres={filtres} basePath="/app/ministere/audit" />
      )}
    </div>
  );
}
