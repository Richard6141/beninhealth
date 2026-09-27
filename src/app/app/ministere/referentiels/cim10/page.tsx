import Link from "next/link";
import { ArrowLeft, Search } from "lucide-react";
import { getReferentielCim10Complet } from "@/modules/administration/referentiel-cim10";
import { Button } from "@/components/ui/Button";
import { SectionReferentielCim10 } from "./SectionReferentielCim10";

interface Cim10PageProps {
  searchParams: Promise<{ q?: string | string[] }>;
}

/**
 * Ecran "Diagnostics CIM-10" (F-ADM-04 et F-CLI-06 du pack), reserve au
 * ministere (admin_national) : sous-liste de diagnostics avec groupe de
 * maladies (section 18.6) et caractere sensible (RG-CLI-53). La recherche par
 * code ou libelle se fait dans l'adresse (?q=paludisme). Voir
 * src/modules/administration/referentiel-cim10.ts pour le detail et les
 * limites.
 */
export default async function ReferentielCim10Page({ searchParams }: Cim10PageProps) {
  const { q } = await searchParams;
  const recherche = (Array.isArray(q) ? q[0] : q)?.trim().slice(0, 60) ?? "";

  const diagnostics = await getReferentielCim10Complet(recherche);

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
        <h1 className="text-[28px] font-bold text-titre">Diagnostics CIM-10</h1>
        <p className="max-w-2xl text-[15px] text-encre-secondaire">
          Sous-liste de diagnostics proposée aux médecins. Un diagnostic sensible protège la consultation qui le porte.
          Contenu de démonstration, à valider par les autorités sanitaires avant tout usage réel.
        </p>
        <form method="get" className="flex w-full max-w-lg items-center gap-2" role="search">
          <label htmlFor="recherche-cim10" className="sr-only">
            Rechercher par code ou libellé
          </label>
          <input
            id="recherche-cim10"
            type="search"
            name="q"
            defaultValue={recherche}
            placeholder="Code ou libellé, par exemple paludisme ou B50"
            className="h-10 w-full rounded-champ border border-bordure-forte bg-surface px-3 text-[14px] text-encre placeholder:text-encre-attenuee focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2"
          />
          <Button type="submit" variant="secondary" size="sm">
            <Search size={14} aria-hidden="true" className="mr-1.5" />
            Rechercher
          </Button>
        </form>
      </header>

      <SectionReferentielCim10 diagnostics={diagnostics} />
    </div>
  );
}
