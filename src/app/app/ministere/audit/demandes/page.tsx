import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getDemandesPersonnes } from "@/modules/audit/demandes";
import { Alert } from "@/components/ui/Alert";
import { ListeDemandesPersonnes } from "./ListeDemandesPersonnes";

/**
 * Ecran "Traiter les demandes des personnes" (F-AUD-04 du pack), reserve a
 * admin_national (role AUDITOR absent de ce depot, voir
 * src/modules/patient/droits-donnees.ts pour la justification du routage).
 */
export default async function DemandesPersonnesPage() {
  const demandes = await getDemandesPersonnes();

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
        <h1 className="text-[28px] font-bold text-titre">Demandes des personnes</h1>
        <p className="max-w-2xl text-[15px] text-encre-secondaire">
          Demandes de rectification et signalements d&apos;accès suspects, à traiter sous 30 jours.
        </p>
      </header>

      {demandes === null ? (
        <Alert level="critical" title="Accès refusé">
          Votre session n&apos;a pas les droits nécessaires pour traiter les demandes des personnes.
        </Alert>
      ) : (
        <ListeDemandesPersonnes demandes={demandes} />
      )}
    </div>
  );
}
