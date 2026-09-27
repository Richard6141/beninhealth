import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { ChevronLeft, ChevronRight, FileText, FlaskConical, Pill, Stethoscope, Syringe } from "lucide-react";
import { getChronologieDossier, type FiltresChronologie } from "@/modules/patient/chronologie";
import { OPTIONS_TYPE_CHRONOLOGIE, type TypeElementChronologie } from "@/modules/patient/chronologie-catalogue";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";

const ICONE_PAR_TYPE: Record<TypeElementChronologie, LucideIcon> = {
  consultation: Stethoscope,
  ordonnance: Pill,
  resultat: FlaskConical,
  vaccination: Syringe,
  document: FileText,
};

function formaterDate(date: string): string {
  try {
    return new Date(date).toLocaleDateString("fr-FR", { year: "numeric", month: "long", day: "numeric" });
  } catch {
    return date;
  }
}

/** Construit l'URL de la page (memes filtres, page differente), pour les liens "Page precedente/suivante". */
function lienPage(filtres: FiltresChronologie, page: number): string {
  const params = new URLSearchParams();
  if (filtres.type) params.set("type", filtres.type);
  if (filtres.annee) params.set("annee", String(filtres.annee));
  if (page > 1) params.set("page", String(page));
  const requete = params.toString();
  return `/app/patient/dossier${requete ? `?${requete}#titre-historique` : "#titre-historique"}`;
}

/**
 * Chronologie unifiee du dossier (F-CIT-03 du pack) : consultations,
 * ordonnances, resultats d'examens, vaccinations et documents, du plus
 * recent au plus ancien, avec filtres (type, annee) et pagination de 20
 * elements par page. Formulaire de filtre en GET (aucun script necessaire,
 * meme convention que /app/ministere/referentiels/cim10) : les filtres
 * vivent dans l'adresse, jamais un etat client.
 *
 * "Voir plus" du pack est rendu ici comme un lien vers la page suivante
 * (voir la limite assumee documentee dans chronologie.ts : chaque module
 * source renvoie l'historique complet du patient, la pagination re-tranche
 * en memoire une liste deja chargee, aucun vrai curseur multi-source).
 */
export async function SectionChronologie({
  searchParams,
}: {
  searchParams: { type?: string; annee?: string; page?: string };
}) {
  const type = OPTIONS_TYPE_CHRONOLOGIE.some((option) => option.value === searchParams.type)
    ? (searchParams.type as TypeElementChronologie)
    : undefined;
  const anneeParsee = Number(searchParams.annee);
  const annee = Number.isInteger(anneeParsee) && searchParams.annee ? anneeParsee : undefined;
  const pageParsee = Number(searchParams.page);
  const page = Number.isInteger(pageParsee) && pageParsee > 0 ? pageParsee : 1;

  const filtres: FiltresChronologie = { type, annee, page };
  const resultat = await getChronologieDossier(filtres);

  return (
    <Card
      description="Consultations, ordonnances, résultats d'examens, vaccinations et documents, du plus récent au plus ancien."
    >
      <form method="get" className="mb-5 flex flex-wrap items-end gap-3" role="search">
        <input type="hidden" name="page" value="1" />
        <div className="flex flex-col gap-1.5">
          <label htmlFor="filtre-type-chronologie" className="text-[13px] font-semibold text-encre-secondaire">
            Type
          </label>
          <select
            id="filtre-type-chronologie"
            name="type"
            defaultValue={type ?? ""}
            className="h-10 rounded-champ border border-bordure-forte bg-surface px-3 text-[14px] text-encre focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2"
          >
            <option value="">Tous les types</option>
            {OPTIONS_TYPE_CHRONOLOGIE.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="filtre-annee-chronologie" className="text-[13px] font-semibold text-encre-secondaire">
            Année
          </label>
          <select
            id="filtre-annee-chronologie"
            name="annee"
            defaultValue={annee ? String(annee) : ""}
            className="h-10 rounded-champ border border-bordure-forte bg-surface px-3 text-[14px] text-encre focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2"
          >
            <option value="">Toutes les années</option>
            {resultat.anneesDisponibles.map((anneeOption) => (
              <option key={anneeOption} value={anneeOption}>
                {anneeOption}
              </option>
            ))}
          </select>
        </div>
        <button
          type="submit"
          className="h-10 rounded-champ border border-bordure-forte bg-surface px-4 text-[14px] font-semibold text-encre transition-colors motion-reduce:transition-none hover:bg-surface-appui focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2"
        >
          Filtrer
        </button>
        {type || annee ? (
          <Link
            href="/app/patient/dossier#titre-historique"
            className="text-[13px] font-semibold text-accent hover:underline"
          >
            Réinitialiser
          </Link>
        ) : null}
      </form>

      {resultat.elements.length > 0 ? (
        <ol className="flex flex-col gap-3">
          {resultat.elements.map((element) => {
            const Icone = ICONE_PAR_TYPE[element.type];
            return (
              <li key={`${element.type}-${element.id}`}>
                <Link
                  href={element.lien}
                  className="flex items-start gap-3 rounded-champ border border-bordure bg-plan px-4 py-3 transition-colors motion-reduce:transition-none hover:border-bordure-forte"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-clair text-accent">
                    <Icone size={16} aria-hidden="true" />
                  </span>
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span
                        className={
                          element.retire
                            ? "truncate text-[14px] font-semibold text-encre-attenuee line-through decoration-2"
                            : "truncate text-[14px] font-semibold text-encre"
                        }
                      >
                        {element.titre}
                      </span>
                      <span className="shrink-0 text-[12px] text-encre-attenuee">{formaterDate(element.date)}</span>
                    </div>
                    <span className="truncate text-[13px] text-encre-secondaire">{element.soustitre}</span>
                    {element.retire && element.mentionRetrait ? (
                      <span className="text-[12px] font-semibold text-critique">{element.mentionRetrait}</span>
                    ) : null}
                  </div>
                  <Badge tone="neutral">{OPTIONS_TYPE_CHRONOLOGIE.find((o) => o.value === element.type)?.label}</Badge>
                </Link>
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="rounded-champ border border-dashed border-bordure-forte bg-plan px-4 py-8 text-center text-[13px] text-encre-attenuee">
          Aucun élément ne correspond à ces filtres pour le moment.
        </p>
      )}

      {resultat.nombrePages > 1 ? (
        <nav
          aria-label="Pagination de la chronologie"
          className="mt-5 flex items-center justify-between border-t border-bordure pt-4 text-[13px]"
        >
          {resultat.page > 1 ? (
            <Link
              href={lienPage(filtres, resultat.page - 1)}
              className="inline-flex items-center gap-1 font-semibold text-accent hover:underline"
            >
              <ChevronLeft size={14} aria-hidden="true" />
              Page précédente
            </Link>
          ) : (
            <span />
          )}
          <span className="text-encre-attenuee">
            Page {resultat.page} sur {resultat.nombrePages} · {resultat.totalElements} élément
            {resultat.totalElements > 1 ? "s" : ""}
          </span>
          {resultat.page < resultat.nombrePages ? (
            <Link
              href={lienPage(filtres, resultat.page + 1)}
              className="inline-flex items-center gap-1 font-semibold text-accent hover:underline"
            >
              Voir plus
              <ChevronRight size={14} aria-hidden="true" />
            </Link>
          ) : (
            <span />
          )}
        </nav>
      ) : null}
    </Card>
  );
}
