import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getEtablissementsAdmin, getReferentielTerritoire } from "@/modules/administration/etablissements";
import { EtatVide } from "@/components/ui/EtatVide";
import { CreationEtablissementModal } from "../CreationEtablissementModal";
import { SectionEtablissementsAdmin } from "./SectionEtablissementsAdmin";

/**
 * Ecran "Gérer le référentiel des établissements" (F-ADM-02 du pack),
 * réservé au ministère (admin_national) : voir
 * src/modules/administration/etablissements.ts pour le détail du périmètre
 * (pas d'import CSV, pas de contrôle de contenance géographique).
 */
export default async function EtablissementsAdminPage() {
  const [etablissements, departements] = await Promise.all([
    getEtablissementsAdmin(),
    getReferentielTerritoire(),
  ]);

  return (
    <div className="conteneur-page mx-auto flex flex-col gap-8 px-4 py-8 sm:px-6">
      <Link
        href="/app/ministere"
        className="inline-flex w-fit items-center gap-1 text-[13px] font-semibold text-accent hover:underline"
      >
        <ArrowLeft size={14} aria-hidden="true" />
        Retour au tableau de bord
      </Link>

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-2">
          <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-accent">Ministère</p>
          <h1 className="text-[28px] font-bold text-titre">Référentiel des établissements</h1>
          <p className="max-w-2xl text-[15px] text-encre-secondaire">
            Territoire, hiérarchie et cycle de vie de chaque établissement. Fermer un établissement
            annule ses rendez-vous futurs (les patients concernés sont notifiés) et conserve toutes
            ses données cliniques : il n&apos;est jamais supprimé.
          </p>
        </div>
        <CreationEtablissementModal />
      </header>

      {etablissements.length === 0 ? (
        <EtatVide
          titre="Aucun établissement"
          description="Utilisez le bouton « Créer un établissement » ci-dessus pour en ajouter un."
        />
      ) : (
        <SectionEtablissementsAdmin etablissements={etablissements} departements={departements} />
      )}
    </div>
  );
}
