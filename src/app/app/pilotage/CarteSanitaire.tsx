import Link from "next/link";
import type { CarteSanitaire as DonneesCarte } from "@/modules/pilotage/carte-constantes";
import {
  COULEURS_CLASSES,
  COULEUR_SANS_DONNEE,
  DEPARTEMENTS_SVG,
  HAUTEUR_VUE,
  LARGEUR_VUE_CARTE,
  NOMBRE_CLASSES,
  legendeDesClasses,
  normaliserNomDepartement,
} from "@/modules/pilotage/carte-regles";
import { INDICATEURS_COMPARABLES } from "@/modules/pilotage/tendances-constantes";

/**
 * Carte sanitaire (F-PIL-03) : carte choroplethe des 12 departements pour un
 * indicateur agrege. Rendue cote serveur (SVG statique, aucun script ni tuile
 * externe). La couleur n'est jamais le seul support : legende chiffree,
 * infobulle native de chaque departement et tableau equivalent en dessous.
 */

function texteValeur(valeur: number | "< 5"): string {
  return valeur === "< 5" ? "< 5" : valeur.toLocaleString("fr-FR");
}

function lien(periode: string, indicateur: string, couche: boolean): string {
  const parametres = new URLSearchParams({ periode, indicateur });
  if (couche) parametres.set("couche", "etablissements");
  return `/app/pilotage?${parametres.toString()}`;
}

export function CarteSanitaire({ carte, couche }: { carte: DonneesCarte; couche: boolean }) {
  const legende = legendeDesClasses(carte.maximum);
  const parCle = new Map(carte.departements.map((departement) => [normaliserNomDepartement(departement.nom), departement]));

  return (
    <div className="flex flex-col gap-4">
      <div role="group" aria-label="Choisir l'indicateur de la carte" className="flex flex-wrap gap-1">
        {INDICATEURS_COMPARABLES.map((indicateur) => {
          const selectionne = indicateur.code === carte.indicateur.code;
          return (
            <Link
              key={indicateur.code}
              href={lien(carte.periode, indicateur.code, couche)}
              aria-current={selectionne ? "true" : undefined}
              title={indicateur.libelle}
              className={
                selectionne
                  ? "rounded-champ bg-accent px-2.5 py-1 text-[12px] font-semibold text-surface"
                  : "rounded-champ border border-bordure px-2.5 py-1 text-[12px] font-semibold text-encre-secondaire hover:text-encre"
              }
            >
              {indicateur.code}
            </Link>
          );
        })}
      </div>
      <p className="text-[13px] font-semibold text-encre">{carte.indicateur.libelle}</p>

      <svg
        viewBox={`0 0 ${LARGEUR_VUE_CARTE} ${HAUTEUR_VUE}`}
        role="img"
        aria-labelledby="titre-carte-sanitaire desc-carte-sanitaire"
        className="mx-auto h-auto w-full max-w-[380px]"
      >
        <title id="titre-carte-sanitaire">{`Carte des départements du Bénin : ${carte.indicateur.libelle}`}</title>
        <desc id="desc-carte-sanitaire">
          Chaque département est coloré selon cinq classes, du plus clair (valeur faible) au plus foncé (valeur élevée).
          Le tableau sous la carte donne les mêmes valeurs.
        </desc>
        {DEPARTEMENTS_SVG.map((contour) => {
          const departement = parCle.get(contour.cle);
          const sansEtablissement = !departement || departement.nombreEtablissements === 0;
          const remplissage = sansEtablissement ? COULEUR_SANS_DONNEE : COULEURS_CLASSES[departement.classe];
          const texte = departement
            ? `${departement.nom} : ${texteValeur(departement.valeur)}${sansEtablissement ? " (aucun établissement)" : ` (classe ${departement.classe + 1} sur ${NOMBRE_CLASSES})`}`
            : contour.nom;
          return (
            <path key={contour.cle} d={contour.d} fill={remplissage} stroke="#ffffff" strokeWidth={1} strokeLinejoin="round">
              <title>{texte}</title>
            </path>
          );
        })}
        {DEPARTEMENTS_SVG.map((contour) => {
          const departement = parCle.get(contour.cle);
          const sombre = departement && departement.nombreEtablissements > 0 && departement.classe >= 3;
          return (
            <text
              key={`nom-${contour.cle}`}
              x={contour.centre.x}
              y={contour.centre.y}
              textAnchor="middle"
              fontSize={8}
              fontWeight={600}
              fill={sombre ? "#ffffff" : "#1f2a37"}
              pointerEvents="none"
            >
              {contour.nom}
            </text>
          );
        })}
        {carte.etablissements?.map((etablissement) => (
          <circle key={etablissement.id} cx={etablissement.x} cy={etablissement.y} r={2.2} fill="#ffffff" stroke="#0b2b4c" strokeWidth={1}>
            <title>{`${etablissement.nom} (${etablissement.type})`}</title>
          </circle>
        ))}
      </svg>

      <div className="flex flex-col gap-2">
        <p className="text-[12px] font-semibold text-encre-secondaire">Légende ({carte.indicateur.code}, valeur sur la période)</p>
        <ul className="flex flex-wrap gap-x-4 gap-y-1.5">
          {legende.map((classe) => (
            <li key={classe.classe} className="flex items-center gap-1.5 text-[12px] text-encre-secondaire">
              <span aria-hidden="true" className="inline-block h-3 w-5 rounded-sm border border-bordure" style={{ backgroundColor: classe.couleur }} />
              <span className="chiffres">{classe.libelle}</span>
            </li>
          ))}
          <li className="flex items-center gap-1.5 text-[12px] text-encre-secondaire">
            <span aria-hidden="true" className="inline-block h-3 w-5 rounded-sm border border-bordure" style={{ backgroundColor: COULEUR_SANS_DONNEE }} />
            Aucun établissement
          </li>
        </ul>
        <p className="text-[12px] text-encre-attenuee">
          Les valeurs de 1 à 4 sont affichées « &lt; 5 » et classées dans la nuance la plus claire.
        </p>
        <Link
          href={lien(carte.periode, carte.indicateur.code, !couche)}
          className="w-fit text-[13px] font-semibold text-accent hover:underline"
        >
          {couche ? "Masquer les établissements" : "Afficher les établissements"}
        </Link>
      </div>

      <details className="rounded-champ border border-bordure bg-plan px-3 py-2">
        <summary className="cursor-pointer text-[13px] font-semibold text-encre">Voir les valeurs en tableau</summary>
        <table className="mt-2 w-full text-[13px]">
          <caption className="sr-only">{`Valeur de ${carte.indicateur.libelle} par département`}</caption>
          <thead>
            <tr className="text-left text-encre-attenuee">
              <th scope="col" className="py-1 pr-2 font-semibold">Département</th>
              <th scope="col" className="py-1 pr-2 text-right font-semibold">Valeur</th>
              <th scope="col" className="py-1 text-right font-semibold">Établissements</th>
            </tr>
          </thead>
          <tbody>
            {carte.departements.map((departement) => (
              <tr key={departement.id} className="border-t border-bordure">
                <th scope="row" className="py-1 pr-2 text-left font-normal text-encre">{departement.nom}</th>
                <td className="chiffres py-1 pr-2 text-right font-semibold text-encre">{texteValeur(departement.valeur)}</td>
                <td className="chiffres py-1 text-right text-encre-secondaire">{departement.nombreEtablissements}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}
