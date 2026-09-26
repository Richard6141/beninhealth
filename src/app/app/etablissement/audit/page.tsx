import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { rechercherJournalAudit, type FiltresJournalAudit } from "@/modules/audit/actions";
import { Alert } from "@/components/ui/Alert";
import { ListeJournalAudit } from "./ListeJournalAudit";

interface AuditPageProps {
  searchParams: Promise<{
    dateDebut?: string | string[];
    dateFin?: string | string[];
    acteur?: string | string[];
    patient?: string | string[];
    action?: string | string[];
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
 * Ecran "Rechercher dans le journal d'audit" (F-AUD-01 du pack), reserve a
 * l'administrateur d'etablissement, scope a son propre etablissement
 * (adaptation documentee dans src/modules/audit/actions.ts : le pack imagine
 * un role AUDITOR distinct, absent de ce depot).
 */
export default async function AuditEtablissementPage({ searchParams }: AuditPageProps) {
  const params = await searchParams;
  const aujourdHui = new Date();
  const ilYA7Jours = new Date(aujourdHui.getTime() - 7 * 24 * 60 * 60 * 1000);

  const filtres: FiltresJournalAudit = {
    dateDebut: premiereValeur(params.dateDebut) || dateISO(ilYA7Jours),
    dateFin: premiereValeur(params.dateFin) || dateISO(aujourdHui),
    acteur: premiereValeur(params.acteur) || undefined,
    patientIdentifiantSante: premiereValeur(params.patient) || undefined,
    action: premiereValeur(params.action) || undefined,
    page: Number(premiereValeur(params.page)) || 1,
  };

  const resultat = await rechercherJournalAudit(filtres);

  return (
    <div className="conteneur-page mx-auto flex flex-col gap-8 px-4 py-8 sm:px-6">
      <Link
        href="/app/etablissement"
        className="inline-flex w-fit items-center gap-1 text-[13px] font-semibold text-accent hover:underline"
      >
        <ArrowLeft size={14} aria-hidden="true" />
        Retour au tableau de bord
      </Link>

      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-accent">Établissement</p>
          <Link
            href="/app/etablissement/audit/urgences"
            className="text-[13px] font-semibold text-accent hover:underline"
          >
            Accès d&apos;urgence à revoir
          </Link>
        </div>
        <h1 className="text-[28px] font-bold text-titre">Journal d&apos;audit</h1>
        <p className="max-w-2xl text-[15px] text-encre-secondaire">
          Historique des actions tracées pour le personnel de votre établissement, filtrable par période, acteur,
          patient et type d&apos;action.
        </p>
      </header>

      {resultat === null ? (
        <Alert level="critical" title="Recherche impossible">
          La période demandée dépasse 31 jours, ou votre session n&apos;a pas les droits nécessaires.
        </Alert>
      ) : (
        <ListeJournalAudit resultat={resultat} filtres={filtres} basePath="/app/etablissement/audit" />
      )}
    </div>
  );
}
