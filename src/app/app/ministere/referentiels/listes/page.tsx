import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getReferentielSimpleComplet } from "@/modules/administration/referentiels-simples";
import {
  REFERENTIELS_SIMPLES,
  TYPES_REFERENTIEL_SIMPLE,
  estTypeReferentielSimple,
} from "@/modules/administration/referentiels-simples-catalogue";
import { SectionReferentielSimple } from "./SectionReferentielSimple";

interface ListesPageProps {
  searchParams: Promise<{ type?: string | string[] }>;
}

/**
 * Ecran "Listes de reference" (F-ADM-04 du pack : services, types
 * d'etablissement, specialites, motifs de rendez-vous), reserve au ministere
 * (admin_national). Le referentiel affiche se choisit dans l'adresse
 * (?type=specialite), "service" par defaut. Voir
 * src/modules/administration/referentiels-simples.ts pour le detail et les
 * limites (desactivation seule, RG-ADM-20 ; pas de versionnement).
 */
export default async function ListesReferencePage({ searchParams }: ListesPageProps) {
  const { type: typeBrut } = await searchParams;
  const demande = Array.isArray(typeBrut) ? typeBrut[0] : typeBrut;
  const type = estTypeReferentielSimple(demande) ? demande : "service";
  const definition = REFERENTIELS_SIMPLES[type];

  const entrees = await getReferentielSimpleComplet(type);

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
        <h1 className="text-[28px] font-bold text-titre">Listes de référence</h1>
        <nav aria-label="Choisir la liste" className="flex flex-wrap items-center gap-2 text-[13px] font-semibold">
          {TYPES_REFERENTIEL_SIMPLE.map((candidat) => (
            <Link
              key={candidat}
              href={`/app/ministere/referentiels/listes?type=${candidat}`}
              aria-current={candidat === type ? "page" : undefined}
              className={
                candidat === type
                  ? "rounded-champ bg-surface-appui px-3 py-1.5 text-encre"
                  : "rounded-champ px-3 py-1.5 text-accent hover:underline"
              }
            >
              {REFERENTIELS_SIMPLES[candidat].libelle}
            </Link>
          ))}
        </nav>
        <p className="max-w-2xl text-[15px] text-encre-secondaire">{definition.description}</p>
      </header>

      <SectionReferentielSimple type={type} entrees={entrees} />
    </div>
  );
}
