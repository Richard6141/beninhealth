import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import {
  getHistoriquePatient,
  type FiltresHistorique,
  type TypeEvenementHistorique,
} from "@/modules/clinical/actions";
import { Alert } from "@/components/ui/Alert";
import { ListeHistorique } from "./ListeHistorique";

interface HistoriquePatientPageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    type?: string | string[];
    dateDebut?: string | string[];
    dateFin?: string | string[];
    etablissementId?: string | string[];
    page?: string | string[];
  }>;
}

const TYPES_VALIDES: TypeEvenementHistorique[] = [
  "consultation",
  "prescription",
  "examen",
  "suivi_communautaire",
];

const LIBELLES_TYPE: Record<TypeEvenementHistorique, string> = {
  consultation: "Consultation",
  prescription: "Prescription",
  examen: "Examen",
  suivi_communautaire: "Suivi communautaire",
};

function premiereValeur(valeur: string | string[] | undefined): string {
  if (Array.isArray(valeur)) return valeur[0] ?? "";
  return valeur ?? "";
}

/**
 * Construit la chaine de requete d'un lien de pagination en conservant les
 * filtres actuels, uniquement `page` change.
 */
function lienPage(filtres: FiltresHistorique, page: number): string {
  const params = new URLSearchParams();
  if (filtres.type) params.set("type", filtres.type);
  if (filtres.dateDebut) params.set("dateDebut", filtres.dateDebut);
  if (filtres.dateFin) params.set("dateFin", filtres.dateFin);
  if (filtres.etablissementId) params.set("etablissementId", filtres.etablissementId);
  params.set("page", String(page));
  return `?${params.toString()}`;
}

/**
 * Ecran "Consulter l'historique complet" (F-CLI-09 du pack, P0) : chronologie
 * de tous les evenements cliniques du patient (consultations, prescriptions,
 * examens, visites communautaires), filtrable par type/periode/etablissement,
 * paginee a 25 elements. Formulaire de filtre en GET (aucun JS necessaire,
 * la page se re-rend cote serveur avec les nouveaux searchParams).
 *
 * Limite assumee : n'inclut ni vaccination ni document medical (F-CLI-11 et
 * F-CLI-13, aucun modele de donnees pour ces deux types dans ce depot).
 */
export default async function HistoriquePatientPage({ params, searchParams }: HistoriquePatientPageProps) {
  const { id } = await params;
  const sp = await searchParams;

  const typeBrut = premiereValeur(sp.type);
  const filtres: FiltresHistorique = {
    type: TYPES_VALIDES.includes(typeBrut as TypeEvenementHistorique)
      ? (typeBrut as TypeEvenementHistorique)
      : undefined,
    dateDebut: premiereValeur(sp.dateDebut) || undefined,
    dateFin: premiereValeur(sp.dateFin) || undefined,
    etablissementId: premiereValeur(sp.etablissementId) || undefined,
    page: Number(premiereValeur(sp.page)) || 1,
  };

  const resultat = await getHistoriquePatient(id, filtres);

  if (!resultat) {
    return (
      <div className="conteneur-page mx-auto flex flex-col gap-6 px-4 py-8 sm:px-6">
        <Link
          href={`/app/medecin/patients/${id}`}
          className="inline-flex w-fit items-center gap-1 text-[13px] font-semibold text-accent hover:underline"
        >
          <ArrowLeft size={14} aria-hidden="true" />
          Retour à la fiche patient
        </Link>
        <Alert level="critical" title="Dossier inaccessible">
          Ce patient est introuvable, ou vous n&apos;avez pas (ou plus) d&apos;accès à son dossier.
        </Alert>
      </div>
    );
  }

  const aDesFiltresActifs = Boolean(
    filtres.type || filtres.dateDebut || filtres.dateFin || filtres.etablissementId
  );

  return (
    <div className="conteneur-page mx-auto flex flex-col gap-8 px-4 py-8 sm:px-6">
      <Link
        href={`/app/medecin/patients/${id}`}
        className="inline-flex w-fit items-center gap-1 text-[13px] font-semibold text-accent hover:underline"
      >
        <ArrowLeft size={14} aria-hidden="true" />
        Retour à la fiche patient
      </Link>

      <header className="flex flex-col gap-2">
        <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-accent">
          Espace professionnel
        </p>
        <h1 className="text-[28px] font-bold text-titre">Historique complet</h1>
        <p className="max-w-2xl text-[15px] text-encre-secondaire">
          Chronologie de tous les événements cliniques de ce patient, du plus récent au plus ancien.
        </p>
      </header>

      <form
        method="get"
        className="flex flex-wrap items-end gap-3 rounded-champ border border-bordure bg-plan p-3"
      >
        <div className="flex flex-col gap-1">
          <label htmlFor="filtre-type" className="text-[12px] font-semibold text-encre-secondaire">
            Type
          </label>
          <select
            id="filtre-type"
            name="type"
            defaultValue={filtres.type ?? ""}
            className="h-9 rounded-champ border border-bordure-forte bg-surface px-2.5 text-[13px] text-encre transition-colors motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2"
          >
            <option value="">Tous les types</option>
            {TYPES_VALIDES.map((type) => (
              <option key={type} value={type}>
                {LIBELLES_TYPE[type]}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="filtre-debut" className="text-[12px] font-semibold text-encre-secondaire">
            Depuis le
          </label>
          <input
            id="filtre-debut"
            type="date"
            name="dateDebut"
            defaultValue={filtres.dateDebut ?? ""}
            className="h-9 rounded-champ border border-bordure-forte bg-surface px-2.5 text-[13px] text-encre transition-colors motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="filtre-fin" className="text-[12px] font-semibold text-encre-secondaire">
            Jusqu&apos;au
          </label>
          <input
            id="filtre-fin"
            type="date"
            name="dateFin"
            defaultValue={filtres.dateFin ?? ""}
            className="h-9 rounded-champ border border-bordure-forte bg-surface px-2.5 text-[13px] text-encre transition-colors motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2"
          />
        </div>

        {resultat.etablissementsDisponibles.length > 1 ? (
          <div className="flex flex-col gap-1">
            <label htmlFor="filtre-etablissement" className="text-[12px] font-semibold text-encre-secondaire">
              Établissement
            </label>
            <select
              id="filtre-etablissement"
              name="etablissementId"
              defaultValue={filtres.etablissementId ?? ""}
              className="h-9 rounded-champ border border-bordure-forte bg-surface px-2.5 text-[13px] text-encre transition-colors motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2"
            >
              <option value="">Tous les établissements</option>
              {resultat.etablissementsDisponibles.map((etablissement) => (
                <option key={etablissement.id} value={etablissement.id}>
                  {etablissement.nom}
                </option>
              ))}
            </select>
          </div>
        ) : null}

        <button
          type="submit"
          className="h-9 rounded-champ bg-marine px-4 text-[13px] font-semibold text-white transition-colors motion-reduce:transition-none hover:bg-marine-fonce"
        >
          Filtrer
        </button>
        {aDesFiltresActifs ? (
          <Link
            href={`/app/medecin/patients/${id}/historique`}
            className="text-[13px] font-semibold text-accent hover:underline"
          >
            Réinitialiser
          </Link>
        ) : null}
      </form>

      <div className="flex items-center justify-between gap-2">
        <span className="text-[13px] font-semibold text-encre-secondaire">
          {resultat.total} {resultat.total > 1 ? "événements" : "événement"}
        </span>
        {resultat.nombreDePages > 1 ? (
          <span className="text-[13px] text-encre-attenuee">
            Page {resultat.page} / {resultat.nombreDePages}
          </span>
        ) : null}
      </div>

      <ListeHistorique evenements={resultat.evenements} />

      {resultat.nombreDePages > 1 ? (
        <nav className="flex items-center justify-center gap-2" aria-label="Pagination de l'historique">
          {resultat.page > 1 ? (
            <Link
              href={lienPage(filtres, resultat.page - 1)}
              className="rounded-champ border border-bordure-forte bg-surface px-3 py-1.5 text-[13px] font-semibold text-encre hover:bg-surface-appui"
            >
              Précédent
            </Link>
          ) : null}
          {resultat.page < resultat.nombreDePages ? (
            <Link
              href={lienPage(filtres, resultat.page + 1)}
              className="rounded-champ border border-bordure-forte bg-surface px-3 py-1.5 text-[13px] font-semibold text-encre hover:bg-surface-appui"
            >
              Suivant
            </Link>
          ) : null}
        </nav>
      ) : null}
    </div>
  );
}
