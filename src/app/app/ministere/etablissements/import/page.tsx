import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { ImportEtablissementsCsv } from "./ImportEtablissementsCsv";

/**
 * Ecran "Importer des etablissements par CSV" (F-ADM-02 du pack, P1 du pack,
 * seul manque reel sur une fiche par ailleurs FAIT). Voir
 * src/modules/administration/import-etablissements{-regles,}.ts pour le
 * detail des regles de validation et la decision de perimetre (pas de
 * compte administrateur provisionne par l'import, statut "brouillon").
 */
export default function ImportEtablissementsPage() {
  return (
    <div className="conteneur-page mx-auto flex flex-col gap-8 px-4 py-8 sm:px-6">
      <Link
        href="/app/ministere/etablissements"
        className="inline-flex w-fit items-center gap-1 text-[13px] font-semibold text-accent hover:underline"
      >
        <ArrowLeft size={14} aria-hidden="true" />
        Retour au referentiel des etablissements
      </Link>

      <header className="flex flex-col gap-2">
        <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-accent">Ministere</p>
        <h1 className="text-[28px] font-bold text-titre">Importer des etablissements par CSV</h1>
        <p className="max-w-2xl text-[15px] text-encre-secondaire">
          Chargez en une fois plusieurs etablissements dans le referentiel. Chaque ligne est
          verifiee (type, capacite, coordonnees, departement/commune) avant tout import definitif ;
          les lignes invalides sont exclues et detaillees, jamais silencieusement ignorees. Les
          etablissements crees sont au statut « brouillon » : rattachez-leur un administrateur puis
          activez-les depuis le referentiel pour les rendre visibles des citoyens.
        </p>
      </header>

      <ImportEtablissementsCsv />
    </div>
  );
}
