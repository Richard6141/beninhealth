/**
 * Recherche dans le referentiel des medicaments (F-PRE-03 du pack) : "A partir
 * de 3 caracteres, insensible aux accents et a la casse, sur la DCI et les
 * noms commerciaux ; resultats tries : medicaments essentiels d'abord, puis
 * ordre alphabetique ; 20 resultats maximum."
 *
 * Module pur (pas de "use server", pas d'acces base). Le nom de la
 * presentation (Medicament.nom, souvent une marque dans ce depot) et le
 * dosage / la forme sont aussi cherches : taper "amoxicilline 500" restreint
 * la liste a la presentation voulue (chaque mot saisi doit se retrouver).
 */

export const MIN_CARACTERES_RECHERCHE_MEDICAMENT = 3;
export const MAX_RESULTATS_RECHERCHE_MEDICAMENT = 20;

export interface MedicamentRecherchable {
  nom: string;
  principeActif: string;
  dosage: string;
  forme: string;
  nomsCommerciaux: string[];
  essentiel: boolean;
}

/** Minuscules, sans accents, espaces compactes : la forme sur laquelle se font toutes les comparaisons. */
export function normaliserPourRecherche(texte: string): string {
  return texte
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Vrai quand la saisie compte au moins 3 caracteres, espaces exclus ("a m" ne suffit pas). */
export function termeMedicamentSuffisant(terme: string): boolean {
  return normaliserPourRecherche(terme).replace(/ /g, "").length >= MIN_CARACTERES_RECHERCHE_MEDICAMENT;
}

function texteRecherchable(medicament: MedicamentRecherchable): string {
  return normaliserPourRecherche(
    [
      medicament.principeActif,
      medicament.nom,
      ...medicament.nomsCommerciaux,
      medicament.dosage,
      medicament.forme,
    ].join(" ")
  );
}

/**
 * Medicaments correspondant a la saisie : essentiels d'abord, puis ordre
 * alphabetique (DCI, nom, dosage). Liste vide sous MIN_CARACTERES_RECHERCHE_MEDICAMENT
 * caracteres : jamais de catalogue complet renvoye sans terme.
 */
export function rechercherMedicaments<T extends MedicamentRecherchable>(
  catalogue: readonly T[],
  terme: string,
  limite: number = MAX_RESULTATS_RECHERCHE_MEDICAMENT
): T[] {
  if (!termeMedicamentSuffisant(terme)) {
    return [];
  }

  const termeNormalise = normaliserPourRecherche(terme);

  const mots = termeNormalise.split(" ");
  const maximum = Math.min(Math.max(Math.trunc(limite), 1), MAX_RESULTATS_RECHERCHE_MEDICAMENT);

  return catalogue
    .filter((medicament) => {
      const texte = texteRecherchable(medicament);
      const motsDuTexte = texte.split(" ");

      return mots.every((mot) =>
        // Un mot purement numerique ("1", "500") doit correspondre a un mot
        // ENTIER du texte, jamais a une sous-chaine : sinon "1" retrouverait
        // a tort "120 mg/5 ml" en cherchant "paracetamol 1 g" (dosage "1 g").
        // Un mot alphabetique reste cherche en sous-chaine (utile pour taper
        // "amox" et retrouver "amoxicilline").
        /^[0-9]+$/.test(mot) ? motsDuTexte.includes(mot) : texte.includes(mot)
      );
    })
    .sort((a, b) => {
      if (a.essentiel !== b.essentiel) return a.essentiel ? -1 : 1;

      return (
        normaliserPourRecherche(a.principeActif).localeCompare(normaliserPourRecherche(b.principeActif), "fr") ||
        normaliserPourRecherche(a.nom).localeCompare(normaliserPourRecherche(b.nom), "fr") ||
        normaliserPourRecherche(a.dosage).localeCompare(normaliserPourRecherche(b.dosage), "fr", { numeric: true })
      );
    })
    .slice(0, maximum);
}
