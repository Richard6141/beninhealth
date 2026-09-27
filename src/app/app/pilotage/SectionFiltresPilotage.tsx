import { SEXES_FILTRE, TRANCHES_AGE_FILTRE, type FiltresPilotage } from "@/modules/pilotage/filtres-pilotage";
import { LIBELLES_TYPE_ETABLISSEMENT, TYPES_ETABLISSEMENT_TRAITES } from "@/modules/administration/etablissements-regles";
import type { PeriodeTableauBord } from "@/modules/pilotage/lecture";

/**
 * Barre de filtres du centre national de pilotage (F-PIL-02, ordre impose
 * point 1 du pack) : territoire, type d'etablissement, sexe, tranche d'age,
 * en plus de la periode deja geree par des liens. Formulaire natif (GET,
 * sans script), reflete dans l'URL pour partager une vue.
 */

export function SectionFiltresPilotage({
  filtres,
  departements,
  periode,
  indicateurCarte,
  coucheEtablissements,
}: {
  filtres: FiltresPilotage;
  departements: { id: string; nom: string }[];
  periode: PeriodeTableauBord;
  indicateurCarte: string;
  coucheEtablissements: boolean;
}) {
  return (
    <form method="get" action="/app/pilotage" className="flex flex-wrap items-end gap-3 rounded-champ border border-bordure bg-plan p-3">
      <input type="hidden" name="periode" value={periode} />
      <input type="hidden" name="indicateur" value={indicateurCarte} />
      {coucheEtablissements ? <input type="hidden" name="couche" value="etablissements" /> : null}

      <label className="flex flex-col gap-1 text-[12px] font-semibold text-encre-secondaire">
        Territoire
        <select name="territoire" defaultValue={filtres.departementId ?? ""} className="rounded-champ border border-bordure bg-surface px-2 py-1.5 text-[13px] text-encre">
          <option value="">Tout le pays</option>
          {departements.map((departement) => (
            <option key={departement.id} value={departement.id}>{departement.nom}</option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1 text-[12px] font-semibold text-encre-secondaire">
        Type d&apos;établissement
        <select name="type" defaultValue={filtres.typeEtablissement ?? ""} className="rounded-champ border border-bordure bg-surface px-2 py-1.5 text-[13px] text-encre">
          <option value="">Tous les types</option>
          {TYPES_ETABLISSEMENT_TRAITES.map((type) => (
            <option key={type} value={type}>{LIBELLES_TYPE_ETABLISSEMENT[type]}</option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1 text-[12px] font-semibold text-encre-secondaire">
        Sexe
        <select name="sexe" defaultValue={filtres.sexe ?? ""} className="rounded-champ border border-bordure bg-surface px-2 py-1.5 text-[13px] text-encre">
          <option value="">Tous</option>
          {SEXES_FILTRE.map((sexe) => (
            <option key={sexe.code} value={sexe.code}>{sexe.libelle}</option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1 text-[12px] font-semibold text-encre-secondaire">
        Tranche d&apos;âge
        <select name="age" defaultValue={filtres.trancheAge ?? ""} className="rounded-champ border border-bordure bg-surface px-2 py-1.5 text-[13px] text-encre">
          <option value="">Toutes</option>
          {TRANCHES_AGE_FILTRE.map((tranche) => (
            <option key={tranche} value={tranche}>{tranche}</option>
          ))}
        </select>
      </label>

      <button type="submit" className="rounded-champ bg-accent px-3 py-1.5 text-[13px] font-semibold text-surface">
        Appliquer
      </button>
      <a href={`/app/pilotage?periode=${periode}&indicateur=${indicateurCarte}`} className="text-[13px] font-semibold text-encre-secondaire hover:text-encre">
        Réinitialiser les filtres
      </a>
    </form>
  );
}
