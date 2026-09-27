import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { detecterDoublonsPatients, getFusionsActives, getFusionsEnAttente } from "@/modules/patient/fusion-doublons";
import { SectionDoublons } from "./SectionDoublons";
import { SectionFusionsActives } from "./SectionFusionsActives";
import { SectionFusionsEnAttente } from "./SectionFusionsEnAttente";

/**
 * Ecran "Fusionner des dossiers en doublon" (F-ADM-06 du pack), reserve au
 * ministere (admin_national) : un doublon peut avoir ete cree dans deux
 * etablissements differents, jamais visible d'un seul admin_etablissement
 * (voir src/modules/patient/fusion-doublons.ts pour le detail de la
 * detection et de la fusion).
 */
export default async function DoublonsPatientsPage() {
  const [candidats, fusionsEnAttente, fusionsActives] = await Promise.all([
    detecterDoublonsPatients(),
    getFusionsEnAttente(),
    getFusionsActives(),
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

      <header className="flex flex-col gap-2">
        <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-accent">Ministère</p>
        <h1 className="text-[28px] font-bold text-titre">Dossiers patient en doublon</h1>
        <p className="max-w-2xl text-[15px] text-encre-secondaire">
          Paires de dossiers dont le nom, le prénom et la date de naissance correspondent exactement.
          Fusionner déplace tout le contenu du dossier doublon vers le dossier conservé, sans jamais
          rien supprimer.
        </p>
      </header>

      <SectionFusionsEnAttente demandes={fusionsEnAttente ?? []} />

      <section aria-labelledby="titre-candidats" className="flex flex-col gap-4">
        <h2 id="titre-candidats" className="text-[20px] font-bold text-encre">
          Doublons probables
        </h2>
        <SectionDoublons candidats={candidats} />
      </section>

      <SectionFusionsActives fusions={fusionsActives ?? []} />
    </div>
  );
}
