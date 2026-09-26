import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getProfessionnelsGuichet } from "@/modules/facility/rendez-vous-guichet";
import { Alert } from "@/components/ui/Alert";
import { SectionRendezVousGuichet } from "./SectionRendezVousGuichet";

/**
 * Ecran "Prendre un rendez-vous au guichet" (F-RDV-06 du pack), reserve a
 * admin_etablissement (role RECEPTIONIST absent de ce depot, voir
 * src/modules/facility/rendez-vous-guichet.ts pour le detail du perimetre
 * reduit).
 */
export default async function NouveauRendezVousGuichetPage() {
  const professionnels = await getProfessionnelsGuichet();

  return (
    <div className="conteneur-page mx-auto flex flex-col gap-8 px-4 py-8 sm:px-6">
      <Link
        href="/app/etablissement/file-du-jour"
        className="inline-flex w-fit items-center gap-1 text-[13px] font-semibold text-accent hover:underline"
      >
        <ArrowLeft size={14} aria-hidden="true" />
        Retour à la file du jour
      </Link>

      <header className="flex flex-col gap-2">
        <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-accent">Établissement</p>
        <h1 className="text-[28px] font-bold text-titre">Rendez-vous au guichet</h1>
        <p className="max-w-2xl text-[15px] text-encre-secondaire">
          Pour un patient qui se présente ou appelle sans avoir réservé en ligne. Retrouvez d&apos;abord son
          dossier par identifiant santé ou par téléphone et date de naissance exacts, puis choisissez un
          créneau : le rendez-vous est confirmé immédiatement.
        </p>
      </header>

      {professionnels === null ? (
        <Alert level="critical" title="Accès refusé">
          Votre session ne dispose pas des droits nécessaires pour consulter cet écran.
        </Alert>
      ) : (
        <SectionRendezVousGuichet professionnels={professionnels} />
      )}
    </div>
  );
}
