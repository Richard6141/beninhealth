/**
 * Masquage des petits effectifs (section 14.1 du pack), applique a la
 * LECTURE des agregats (jamais au stockage : AgregatQuotidien garde toujours
 * la valeur exacte, RG-PIL-01, pour permettre un recalcul correct plus tard).
 *
 * RG-PIL-02 : une valeur de 1 a 4 est affichee/exportee "< 5" ; un taux
 * calcule sur un denominateur < 20 est affiche "effectif insuffisant" ; 0 est
 * affiche 0.
 * RG-PIL-03 : masquage complementaire : dans un tableau avec total, si une
 * seule cellule d'une ligne est masquee, une deuxieme cellule (la plus
 * petite parmi celles encore visibles) DOIT aussi etre masquee, pour
 * empecher de retrouver la valeur masquee par soustraction du total.
 */

export type ValeurMasquee = number | "< 5";

/** RG-PIL-02, un seul compte. */
export function masquerPetitEffectif(valeur: number): ValeurMasquee {
  if (valeur > 0 && valeur < 5) return "< 5";
  return valeur;
}

/** RG-PIL-02, un taux (numerateur/denominateur x100), avec le seuil de denominateur. */
export function masquerTaux(numerateur: number, denominateur: number): string {
  if (denominateur < 20) return "effectif insuffisant";
  const taux = (numerateur / denominateur) * 100;
  return `${taux.toFixed(1)} %`;
}

/**
 * RG-PIL-02, une moyenne calculee sur un petit nombre de mesures : avec
 * moins de 5 mesures, afficher une moyenne reviendrait a reveler le delai
 * exact d'un patient (n=1) ou presque (n=2 a 4), meme principe que
 * masquerPetitEffectif applique a un compte. IND-11 (pilotage/agregation.ts).
 */
export function masquerDelaiMoyen(sommeMinutes: number, nombreMesures: number): string {
  if (nombreMesures === 0) return "aucune mesure";
  if (nombreMesures < 5) return "< 5 mesures";
  return `${Math.round(sommeMinutes / nombreMesures)} min`;
}

export interface CelluleLigne {
  cle: string;
  valeur: number;
}

/**
 * Applique RG-PIL-02 puis RG-PIL-03 a une ligne de tableau avec total
 * (ex. une ligne "diagnostic" avec une colonne par sexe). Retourne les
 * memes cles, avec la valeur d'origine ou "< 5" si masquee.
 *
 * Si aucune cellule ou plus d'une cellule sont deja masquees par RG-PIL-02,
 * RG-PIL-03 ne s'applique pas (rien a proteger dans le premier cas, la
 * soustraction ne permet deja plus de retrouver une valeur unique dans le
 * second).
 */
export function masquerLigneAvecTotal(cellules: CelluleLigne[]): Record<string, ValeurMasquee> {
  const resultat: Record<string, ValeurMasquee> = {};
  const masqueesDepart = new Set<string>();

  for (const cellule of cellules) {
    const valeurMasquee = masquerPetitEffectif(cellule.valeur);
    resultat[cellule.cle] = valeurMasquee;
    if (valeurMasquee === "< 5") masqueesDepart.add(cellule.cle);
  }

  if (masqueesDepart.size === 1) {
    const candidats = cellules
      .filter((cellule) => !masqueesDepart.has(cellule.cle))
      .sort((a, b) => a.valeur - b.valeur);
    const deuxiemeCellule = candidats[0];
    if (deuxiemeCellule) {
      resultat[deuxiemeCellule.cle] = "< 5";
    }
  }

  return resultat;
}
