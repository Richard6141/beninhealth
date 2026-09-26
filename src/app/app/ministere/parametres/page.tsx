import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getFonctionnalitesActivables, getParametres } from "@/modules/administration/parametres";
import { SectionParametres } from "./SectionParametres";

/**
 * Ecran "Paramètres et fonctionnalités activables" (F-ADM-07 du pack),
 * réservé au ministère (admin_national) : voir
 * src/modules/administration/parametres.ts pour le détail du périmètre
 * (infrastructure complète, aucune constante existante encore branchée
 * dessus).
 */
export default async function ParametresPage() {
  const [fonctionnalites, parametres] = await Promise.all([
    getFonctionnalitesActivables(),
    getParametres(),
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
        <h1 className="text-[28px] font-bold text-titre">Paramètres de la plateforme</h1>
        <p className="max-w-2xl text-[15px] text-encre-secondaire">
          Fonctionnalités activables et seuils numériques. Chaque modification est journalisée et
          prend effet immédiatement, sans redéploiement.
        </p>
      </header>

      <SectionParametres fonctionnalites={fonctionnalites} parametres={parametres} />
    </div>
  );
}
