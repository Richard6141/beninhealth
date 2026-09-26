import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getFicheEtablissement } from "@/modules/facility/gestion-fiche";
import { Alert } from "@/components/ui/Alert";
import { Card } from "@/components/ui/Card";
import { FormulaireFicheEtablissement } from "./FormulaireFicheEtablissement";

/**
 * Ecran "Gérer la fiche de son établissement" (F-ETA-03 du pack), reserve a
 * admin_etablissement. getFicheEtablissement derive toujours l'etablissement
 * de la session (Zero Trust), jamais d'un id transmis par le client.
 */
export default async function FicheEtablissementPage() {
  const fiche = await getFicheEtablissement();

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
        <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-accent">
          Établissement
        </p>
        <h1 className="text-[28px] font-bold text-titre">Fiche de l&apos;établissement</h1>
        <p className="max-w-2xl text-[15px] text-encre-secondaire">
          Coordonnées, capacité et services proposés par votre établissement.
        </p>
      </header>

      {fiche === null ? (
        <Alert level="critical" title="Accès refusé">
          Votre session n&apos;a pas les droits nécessaires pour consulter cet écran.
        </Alert>
      ) : (
        <Card>
          <FormulaireFicheEtablissement fiche={fiche} />
        </Card>
      )}
    </div>
  );
}
