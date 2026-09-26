import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getTutellesActives } from "@/modules/administration/tutelles";
import { SectionTutelles } from "./SectionTutelles";

/**
 * Ecran "Tutelles" (F-CIT-09 du pack, "fin de tutelle a la majorite"),
 * reserve au ministere (admin_national). MVP reduit par le pack lui-meme a
 * une fin manuelle par l'administrateur (voir
 * src/modules/administration/tutelles.ts) : pas de tache planifiee a 18
 * ans, pas de code de reclamation par SMS.
 */
export default async function TutellesPage() {
  const tutelles = await getTutellesActives();

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
        <h1 className="text-[28px] font-bold text-titre">Tutelles actives</h1>
        <p className="max-w-2xl text-[15px] text-encre-secondaire">
          Personnes à charge gérées par un tuteur (dossier « sans compte »). Terminer une tutelle retire
          l&apos;accès du tuteur ; le dossier de la personne concernée n&apos;est jamais supprimé.
        </p>
      </header>

      <SectionTutelles tutelles={tutelles} />
    </div>
  );
}
