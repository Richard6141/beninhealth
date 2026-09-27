import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getDemandesRendezVousAccueil } from "@/modules/facility/demandes-accueil";
import { Alert } from "@/components/ui/Alert";
import { SectionDemandesRendezVous } from "./SectionDemandesRendezVous";

/**
 * Ecran "Demandes de rendez-vous" (F-RDV-03 du pack), reserve a
 * admin_etablissement qui tient le role d'accueil (RECEPTIONIST absent de ce
 * depot). Voir src/modules/facility/demandes-accueil.ts.
 */
export default async function DemandesRendezVousPage() {
  const demandes = await getDemandesRendezVousAccueil();

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
        <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-accent">Établissement</p>
        <h1 className="text-[28px] font-bold text-titre">Demandes de rendez-vous</h1>
        <p className="max-w-2xl text-[15px] text-encre-secondaire">
          Confirmez ou refusez les demandes en attente, dans l&apos;ordre des rendez-vous. Une demande sans
          réponse expire 24 heures après son dépôt, ou 1 heure avant le créneau si celui-ci arrive avant. Le
          patient est prévenu de chaque décision.
        </p>
      </header>

      {demandes === null ? (
        <Alert level="critical" title="Accès refusé">
          Votre session ne dispose pas des droits nécessaires pour consulter cet écran.
        </Alert>
      ) : (
        <SectionDemandesRendezVous demandes={demandes} />
      )}
    </div>
  );
}
