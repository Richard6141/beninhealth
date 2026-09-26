import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getJoursFeries } from "@/modules/administration/jours-feries";
import { jourCivilBenin } from "@/modules/administration/jours-feries-calcul";
import { SectionJoursFeries } from "./SectionJoursFeries";

interface JoursFeriesPageProps {
  searchParams: Promise<{ annee?: string | string[] }>;
}

const ANNEE_MIN = 2020;
const ANNEE_MAX = 2100;

/**
 * Ecran "Jours feries" (F-ADM-04 du pack, 5e referentiel concret : voir
 * src/modules/administration/jours-feries.ts pour le detail et les limites),
 * reserve au ministere (admin_national). Un jour ferie actif bloque la prise
 * de rendez-vous ce jour-la (RG-ETA-42). L'annee affichee se choisit dans
 * l'adresse (?annee=2027), par defaut l'annee en cours au Benin.
 */
export default async function JoursFeriesPage({ searchParams }: JoursFeriesPageProps) {
  const { annee: anneeBrute } = await searchParams;
  const texte = Array.isArray(anneeBrute) ? anneeBrute[0] : anneeBrute;
  const anneeCourante = Number(jourCivilBenin(new Date()).slice(0, 4));
  const demandee = Number(texte);
  const annee = Number.isInteger(demandee) && demandee >= ANNEE_MIN && demandee <= ANNEE_MAX ? demandee : anneeCourante;

  const jours = await getJoursFeries(annee);

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
        <h1 className="text-[28px] font-bold text-titre">Jours fériés</h1>
        <p className="max-w-2xl text-[15px] text-encre-secondaire">
          Un jour férié actif n&apos;accepte aucun rendez-vous. Une entrée désactivée rouvre la date sans être
          supprimée.
        </p>
        <nav aria-label="Choisir l'année" className="flex flex-wrap items-center gap-3 text-[13px] font-semibold">
          {annee > ANNEE_MIN ? (
            <Link href={`/app/ministere/referentiels/jours-feries?annee=${annee - 1}`} className="text-accent hover:underline">
              {annee - 1}
            </Link>
          ) : null}
          <span aria-current="page" className="chiffres rounded-champ bg-surface-appui px-3 py-1 text-encre">
            {annee}
          </span>
          {annee < ANNEE_MAX ? (
            <Link href={`/app/ministere/referentiels/jours-feries?annee=${annee + 1}`} className="text-accent hover:underline">
              {annee + 1}
            </Link>
          ) : null}
        </nav>
      </header>

      <SectionJoursFeries annee={annee} jours={jours} />
    </div>
  );
}
