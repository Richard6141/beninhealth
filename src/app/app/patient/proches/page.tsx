import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getMesProches } from "@/modules/proches/actions";
import { ListeProches } from "./ListeProches";
import { BoutonNouveauProche } from "./FormulaireNouveauProche";

/**
 * Ecran "Mes proches" (F-CIT-07/08 du pack, périmètre réduit : voir
 * src/modules/proches/actions.ts pour le détail des limites assumées).
 * Liste des personnes à charge gérées par le citoyen connecté
 * (getMesProches) et formulaire d'ajout d'un enfant mineur
 * (creerPersonneAChargeAction). Chaque carte ouvre le dossier de base de la
 * personne à charge (/app/patient/proches/[id]).
 */
export default async function ProchesPage() {
  const proches = await getMesProches();

  return (
    <div className="conteneur-page mx-auto flex flex-col gap-8 px-4 py-8 sm:px-6">
      <header className="flex flex-col gap-2">
        <Link
          href="/app/patient"
          className="inline-flex w-fit items-center gap-1 text-[13px] font-semibold text-accent hover:underline"
        >
          <ArrowLeft size={14} aria-hidden="true" />
          Retour au tableau de bord
        </Link>
        <h1 className="text-[28px] font-bold text-titre">Mes proches</h1>
        <p className="max-w-2xl text-[15px] text-encre-secondaire">
          Suivez le carnet de santé de vos enfants ou d&apos;une personne dont
          vous vous occupez : consultez leur dossier de base et prenez
          rendez-vous en leur nom.
        </p>
      </header>

      <section aria-labelledby="titre-proches" className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="titre-proches" className="text-[20px] font-bold text-encre">
            Personnes à charge
          </h2>
          <BoutonNouveauProche />
        </div>

        <ListeProches proches={proches} />
      </section>
    </div>
  );
}
