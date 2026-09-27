import Link from "next/link";
import { ShieldAlert } from "lucide-react";
import type { FiltresJournalAudit, ResultatJournalAudit } from "@/modules/audit/actions";
import { Card } from "@/components/ui/Card";
import { ExportCsvJournalAudit } from "./ExportCsvJournalAudit";

function formaterDateHeure(date: string): string {
  try {
    return new Date(date).toLocaleString("fr-FR", { dateStyle: "long", timeStyle: "short" });
  } catch {
    return date;
  }
}

function construireRequete(filtres: FiltresJournalAudit, page: number): string {
  const params = new URLSearchParams();
  params.set("dateDebut", filtres.dateDebut);
  params.set("dateFin", filtres.dateFin);
  if (filtres.acteur) params.set("acteur", filtres.acteur);
  if (filtres.patientIdentifiantSante) params.set("patient", filtres.patientIdentifiantSante);
  if (filtres.action) params.set("action", filtres.action);
  if (filtres.etablissementId) params.set("etablissementId", filtres.etablissementId);
  params.set("page", String(page));
  return `?${params.toString()}`;
}

const styleChampFiltre =
  "h-9 rounded-champ border border-bordure-forte bg-surface px-2.5 text-[13px] text-encre transition-colors motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2";

/**
 * Ecran de recherche dans le journal d'audit (F-AUD-01 du pack), partage
 * entre /app/etablissement/audit (admin_etablissement, scope impose a son
 * etablissement) et /app/ministere/audit (admin_national, tous
 * etablissements). Formulaire de filtre en GET (aucun JS necessaire, meme
 * pattern que /app/medecin/patients/[id]/historique) : la page se re-rend
 * cote serveur avec les nouveaux searchParams.
 */
export function ListeJournalAudit({
  resultat,
  filtres,
  basePath,
}: {
  resultat: ResultatJournalAudit;
  filtres: FiltresJournalAudit;
  basePath: string;
}) {
  const aDesFiltresOptionnels = Boolean(
    filtres.acteur || filtres.patientIdentifiantSante || filtres.action || filtres.etablissementId
  );

  return (
    <div className="flex flex-col gap-6">
      {resultat.etablissementImpose ? (
        <p className="text-[13px] font-semibold text-encre-secondaire">
          Résultats limités à votre établissement : {resultat.etablissementImpose}.
        </p>
      ) : null}

      <form method="get" className="flex flex-wrap items-end gap-3 rounded-champ border border-bordure bg-plan p-3">
        <div className="flex flex-col gap-1">
          <label htmlFor="filtre-debut" className="text-[12px] font-semibold text-encre-secondaire">
            Depuis le <span className="text-critique">*</span>
          </label>
          <input
            id="filtre-debut"
            type="date"
            name="dateDebut"
            required
            defaultValue={filtres.dateDebut}
            className={styleChampFiltre}
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="filtre-fin" className="text-[12px] font-semibold text-encre-secondaire">
            Jusqu&apos;au <span className="text-critique">*</span>
          </label>
          <input
            id="filtre-fin"
            type="date"
            name="dateFin"
            required
            defaultValue={filtres.dateFin}
            className={styleChampFiltre}
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="filtre-acteur" className="text-[12px] font-semibold text-encre-secondaire">
            Acteur
          </label>
          <input
            id="filtre-acteur"
            type="text"
            name="acteur"
            defaultValue={filtres.acteur ?? ""}
            placeholder="Nom, prénom, email"
            className={styleChampFiltre}
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="filtre-patient" className="text-[12px] font-semibold text-encre-secondaire">
            Patient
          </label>
          <input
            id="filtre-patient"
            type="text"
            name="patient"
            defaultValue={filtres.patientIdentifiantSante ?? ""}
            placeholder="Identifiant santé"
            className={styleChampFiltre}
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="filtre-action" className="text-[12px] font-semibold text-encre-secondaire">
            Action
          </label>
          <select id="filtre-action" name="action" defaultValue={filtres.action ?? ""} className={styleChampFiltre}>
            <option value="">Toutes les actions</option>
            {resultat.actionsDisponibles.map((action) => (
              <option key={action} value={action}>
                {action}
              </option>
            ))}
          </select>
        </div>

        {resultat.etablissementsDisponibles.length > 0 ? (
          <div className="flex flex-col gap-1">
            <label htmlFor="filtre-etablissement" className="text-[12px] font-semibold text-encre-secondaire">
              Établissement
            </label>
            <select
              id="filtre-etablissement"
              name="etablissementId"
              defaultValue={filtres.etablissementId ?? ""}
              className={styleChampFiltre}
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
          Rechercher
        </button>
        {aDesFiltresOptionnels ? (
          <Link
            href={`${basePath}?dateDebut=${filtres.dateDebut}&dateFin=${filtres.dateFin}`}
            className="text-[13px] font-semibold text-accent hover:underline"
          >
            Réinitialiser les filtres
          </Link>
        ) : null}
      </form>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-[13px] font-semibold text-encre-secondaire">
          {resultat.total} {resultat.total > 1 ? "entrées" : "entrée"}
        </span>
        {resultat.nombreDePages > 1 ? (
          <span className="text-[13px] text-encre-attenuee">
            Page {resultat.page} / {resultat.nombreDePages}
          </span>
        ) : null}
      </div>

      {resultat.total > 0 ? <ExportCsvJournalAudit filtres={filtres} /> : null}

      {resultat.entrees.length === 0 ? (
        <Card>
          <div className="flex flex-col items-center gap-2 rounded-champ border border-dashed border-bordure-forte bg-surface px-4 py-10 text-center">
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-accent-clair text-accent">
              <ShieldAlert size={20} aria-hidden="true" />
            </span>
            <p className="text-[14px] font-semibold text-encre">Aucune entrée pour cette recherche</p>
            <p className="max-w-[40ch] text-[13px] text-encre-attenuee">
              Essayez d&apos;élargir la période ou de retirer un filtre.
            </p>
          </div>
        </Card>
      ) : (
        <Card className="overflow-hidden p-0 sm:p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] border-collapse text-[13px]">
              <thead>
                <tr className="bg-surface-appui">
                  <th scope="col" className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-encre-attenuee">
                    Date
                  </th>
                  <th scope="col" className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-encre-attenuee">
                    Acteur
                  </th>
                  <th scope="col" className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-encre-attenuee">
                    Établissement
                  </th>
                  <th scope="col" className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-encre-attenuee">
                    Action
                  </th>
                  <th scope="col" className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-encre-attenuee">
                    Concerne
                  </th>
                  <th scope="col" className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-encre-attenuee">
                    Justification
                  </th>
                </tr>
              </thead>
              <tbody>
                {resultat.entrees.map((entree) => (
                  <tr key={entree.id} className="border-t border-bordure align-top">
                    <td className="whitespace-nowrap px-4 py-3 text-encre-secondaire">
                      {formaterDateHeure(entree.date)}
                    </td>
                    <td className="px-4 py-3 font-semibold text-encre">
                      {entree.acteurNomComplet}
                      {entree.acteurRole ? (
                        <span className="block font-normal text-encre-attenuee">{entree.acteurRole}</span>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-encre-secondaire">{entree.etablissementNom ?? "-"}</td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <code className="text-[12px] text-encre">{entree.action}</code>
                    </td>
                    <td className="px-4 py-3 text-encre-secondaire">
                      <code className="text-[12px]">{entree.donneeConcernee}</code>
                    </td>
                    <td className="max-w-[28ch] px-4 py-3 text-encre-secondaire">{entree.justification}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {resultat.nombreDePages > 1 ? (
        <nav className="flex items-center justify-center gap-2" aria-label="Pagination du journal d'audit">
          {resultat.page > 1 ? (
            <Link
              href={`${basePath}${construireRequete(filtres, resultat.page - 1)}`}
              className="rounded-champ border border-bordure-forte bg-surface px-3 py-1.5 text-[13px] font-semibold text-encre hover:bg-surface-appui"
            >
              Précédent
            </Link>
          ) : null}
          {resultat.page < resultat.nombreDePages ? (
            <Link
              href={`${basePath}${construireRequete(filtres, resultat.page + 1)}`}
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
