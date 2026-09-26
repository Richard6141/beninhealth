import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Info } from "lucide-react";
import { getSession } from "@/lib/session";
import { getComparaisonTerritoires, listerTerritoiresComparables } from "@/modules/pilotage/tendances";
import {
  INDICATEURS_COMPARABLES,
  NOMBRE_TERRITOIRES_MAXIMUM,
  NOMBRE_TERRITOIRES_MINIMUM,
  PERIODE_MOIS_DEFAUT,
  PERIODE_MOIS_MAXIMUM,
  type FiltresTendances,
  type GranulariteTendance,
} from "@/modules/pilotage/tendances-constantes";
import { trouverDefinitionIndicateur } from "@/modules/pilotage/indicateurs";
import { Alert } from "@/components/ui/Alert";
import { Card } from "@/components/ui/Card";
import { SelectField } from "@/components/ui/SelectField";
import { ComparaisonTerritoires } from "./ComparaisonTerritoires";
import { BoutonTelechargerTendances } from "./BoutonTelechargerTendances";

const PERIODES_MOIS: number[] = [3, 6, 12, PERIODE_MOIS_MAXIMUM];

interface TendancesPageProps {
  searchParams: Promise<{
    indicateur?: string | string[];
    granularite?: string | string[];
    periodeMois?: string | string[];
    territoire?: string | string[];
  }>;
}

function premiereValeur(valeur: string | string[] | undefined): string | undefined {
  return Array.isArray(valeur) ? valeur[0] : valeur;
}

function toutesLesValeurs(valeur: string | string[] | undefined): string[] {
  if (valeur === undefined) return [];
  return Array.isArray(valeur) ? valeur : [valeur];
}

export default async function TendancesPage({ searchParams }: TendancesPageProps) {
  const session = await getSession();
  if (!session || !session.roles.includes("admin_national")) {
    redirect("/app");
  }

  const territoiresDisponibles = await listerTerritoiresComparables();
  if (territoiresDisponibles === null) {
    redirect("/app");
  }

  const params = await searchParams;

  const indicateurCode = INDICATEURS_COMPARABLES.some((indicateur) => indicateur.code === premiereValeur(params.indicateur))
    ? (premiereValeur(params.indicateur) as string)
    : INDICATEURS_COMPARABLES[0].code;

  const granuliteBrute = premiereValeur(params.granularite);
  const granularite: GranulariteTendance = granuliteBrute === "mois" ? "mois" : "semaine";

  const periodeMoisBrute = Number(premiereValeur(params.periodeMois));
  const periodeMois = PERIODES_MOIS.includes(periodeMoisBrute) ? periodeMoisBrute : PERIODE_MOIS_DEFAUT;

  const idsDisponibles = new Set(territoiresDisponibles.map((territoire) => territoire.id));
  let territoireIds = toutesLesValeurs(params.territoire).filter((id) => idsDisponibles.has(id));
  if (territoireIds.length === 0) {
    // Premiere visite (aucun filtre dans l'URL) : preselectionner les 2 premiers territoires par ordre alphabetique, pour ne pas afficher un ecran vide, tout en laissant l'utilisateur changer librement.
    territoireIds = territoiresDisponibles.slice(0, NOMBRE_TERRITOIRES_MINIMUM).map((territoire) => territoire.id);
  }

  const filtres: FiltresTendances = { indicateurCode, granularite, periodeMois, territoireIds };
  const selectionValide = territoireIds.length >= NOMBRE_TERRITOIRES_MINIMUM;
  const resultat = selectionValide ? await getComparaisonTerritoires(filtres) : null;
  const definitionIndicateur = trouverDefinitionIndicateur(indicateurCode);

  return (
    <div className="conteneur-page mx-auto flex flex-col gap-8 px-4 py-8 sm:px-6 lg:px-8">
      <Link href="/app/pilotage" className="inline-flex w-fit items-center gap-1 text-[13px] font-semibold text-accent hover:underline">
        <ArrowLeft size={14} aria-hidden="true" />
        Retour au centre national de pilotage
      </Link>

      <header className="flex flex-col gap-2 rounded-carte border border-bordure bg-surface px-6 py-6 shadow-[var(--ombre-carte)] sm:px-8">
        <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-accent">Ministère de la Santé</p>
        <h1 className="text-[28px] font-bold text-titre">Tendances et comparaisons</h1>
        <p className="max-w-2xl text-[15px] text-encre-secondaire">
          Comparez l&apos;évolution d&apos;un indicateur entre 2 et {NOMBRE_TERRITOIRES_MAXIMUM} départements, par semaine
          ou par mois, sur une période allant jusqu&apos;à {PERIODE_MOIS_MAXIMUM} mois.
        </p>
      </header>

      <form method="get" className="flex flex-col gap-5 rounded-champ border border-bordure bg-plan p-4">
        <div className="grid gap-4 sm:grid-cols-3">
          <SelectField
            label="Indicateur"
            name="indicateur"
            defaultValue={indicateurCode}
            options={INDICATEURS_COMPARABLES.map((indicateur) => ({ value: indicateur.code, label: `${indicateur.libelle} (${indicateur.code})` }))}
          />
          <SelectField
            label="Granularité"
            name="granularite"
            defaultValue={granularite}
            options={[
              { value: "semaine", label: "Par semaine" },
              { value: "mois", label: "Par mois" },
            ]}
          />
          <SelectField
            label="Période"
            name="periodeMois"
            defaultValue={String(periodeMois)}
            options={PERIODES_MOIS.map((mois) => ({ value: String(mois), label: `${mois} derniers mois` }))}
          />
        </div>

        {definitionIndicateur ? (
          <p className="flex items-start gap-1.5 text-[12px] text-encre-attenuee">
            <Info size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
            {definitionIndicateur.definition}
          </p>
        ) : null}

        <fieldset className="flex flex-col gap-2">
          <legend className="text-[13px] font-semibold text-encre">
            Territoires à comparer ({NOMBRE_TERRITOIRES_MINIMUM} à {NOMBRE_TERRITOIRES_MAXIMUM})
          </legend>
          <div className="grid gap-x-4 gap-y-2 sm:grid-cols-3 lg:grid-cols-4">
            {territoiresDisponibles.map((territoire) => (
              <label key={territoire.id} className="flex items-center gap-2 text-[13px] text-encre">
                <input
                  type="checkbox"
                  name="territoire"
                  value={territoire.id}
                  defaultChecked={territoireIds.includes(territoire.id)}
                  className="h-4 w-4 rounded-[3px] border-bordure-forte accent-marine"
                />
                {territoire.nom}
              </label>
            ))}
          </div>
        </fieldset>

        <button
          type="submit"
          className="h-9 w-fit rounded-champ bg-accent px-4 text-[13px] font-semibold text-surface transition-colors motion-reduce:transition-none hover:opacity-90"
        >
          Mettre à jour
        </button>
      </form>

      {!selectionValide ? (
        <Alert level="warning" title="Sélection incomplète">
          Choisissez entre {NOMBRE_TERRITOIRES_MINIMUM} et {NOMBRE_TERRITOIRES_MAXIMUM} départements à comparer.
        </Alert>
      ) : resultat === null ? (
        <Alert level="critical" title="Comparaison impossible">
          La sélection demandée n&apos;a pas pu être calculée (territoires invalides ou droits insuffisants).
        </Alert>
      ) : (
        <Card
          title={`${resultat.indicateur.libelle} (${resultat.indicateur.code})`}
          description={`${resultat.granularite === "mois" ? "Par mois" : "Par semaine"} · ${resultat.periodeMois} derniers mois`}
          actions={<BoutonTelechargerTendances filtres={filtres} />}
        >
          <ComparaisonTerritoires territoires={resultat.territoires} points={resultat.points} />
        </Card>
      )}

      <p className="text-center text-[12px] text-encre-attenuee">
        Données agrégées et anonymisées (valeurs inférieures à 5 masquées « &lt; 5 »).
      </p>
    </div>
  );
}
