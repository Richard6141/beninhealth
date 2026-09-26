import Link from "next/link";
import { ArrowLeft, CalendarPlus } from "lucide-react";
import { getFileDuJourEtablissement } from "@/modules/facility/file-du-jour";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { SectionFileDuJour } from "./SectionFileDuJour";

/**
 * Ecran "File du jour" (F-RDV-04/05 du pack), reserve a admin_etablissement
 * (role RECEPTIONIST absent de ce depot, voir
 * src/modules/facility/file-du-jour.ts pour le detail du perimetre reduit).
 */
export default async function FileDuJourPage() {
  const rendezVous = await getFileDuJourEtablissement();

  return (
    <div className="conteneur-page mx-auto flex flex-col gap-8 px-4 py-8 sm:px-6">
      <Link
        href="/app/etablissement"
        className="inline-flex w-fit items-center gap-1 text-[13px] font-semibold text-accent hover:underline"
      >
        <ArrowLeft size={14} aria-hidden="true" />
        Retour au tableau de bord
      </Link>

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-2">
          <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-accent">Établissement</p>
          <h1 className="text-[28px] font-bold text-titre">File du jour</h1>
          <p className="max-w-2xl text-[15px] text-encre-secondaire">
            Rendez-vous du jour de votre établissement, groupés par statut. Un rendez-vous confirmé dont
            l&apos;heure est dépassée de plus d&apos;une heure sans arrivée est automatiquement marqué « Absent ».
          </p>
        </div>
        <Link href="/app/etablissement/rendez-vous/nouveau">
          <Button type="button" variant="primary" iconBefore={CalendarPlus}>
            Rendez-vous au guichet
          </Button>
        </Link>
      </header>

      {rendezVous === null ? (
        <Alert level="critical" title="Accès refusé">
          Votre session ne dispose pas des droits nécessaires pour consulter cet écran.
        </Alert>
      ) : (
        <SectionFileDuJour rendezVous={rendezVous} />
      )}
    </div>
  );
}
