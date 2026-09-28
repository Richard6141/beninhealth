/**
 * File de validation du laboratoire (F-LAB-04 du pack, ecran /labo/validation,
 * servi ici sous /app/medecin/laboratoire/validation comme le reste de
 * l'espace laboratoire). Module pur (pas de "use server", pas d'acces base) :
 * la liste des examens est deja chargee et controlee par
 * getExamensPourLaboratoire (Zero Trust cote Server Action), on ne fait ici
 * que trier et repartir.
 *
 * Seuls les resultats "resultat_saisi" (saisis, pas encore verrouilles par un
 * second professionnel) entrent dans la file. Ils sont repartis en deux
 * groupes selon le principe des quatre yeux (RG-ROL-30) :
 * - aValider : saisis par un AUTRE professionnel, le professionnel connecte
 *   peut les valider ou les renvoyer pour correction ;
 * - saisisParMoi : saisis par le professionnel connecte lui-meme, affiches
 *   pour information seulement (il ne peut pas les valider, le serveur le
 *   refuse de toute facon avec LAB_SELF_VALIDATION).
 * Ordre : urgents d'abord (RG-LAB-40), puis les plus anciennement saisis
 * d'abord (premier saisi, premier valide).
 */

export interface ExamenPourFileValidation {
  statut: string;
  saisiParId: string | null;
  niveauUrgence: string;
  dateResultat: string | null; // ISO
  date: string; // ISO, date de la demande
}

export interface FileValidation<T extends ExamenPourFileValidation> {
  aValider: T[];
  saisisParMoi: T[];
}

export const STATUT_EN_ATTENTE_DE_VALIDATION = "resultat_saisi";

function horodatage(examen: ExamenPourFileValidation): number {
  const reference = examen.dateResultat ?? examen.date;
  const valeur = new Date(reference).getTime();
  return Number.isNaN(valeur) ? Number.POSITIVE_INFINITY : valeur;
}

function comparerPourValidation(a: ExamenPourFileValidation, b: ExamenPourFileValidation): number {
  const urgenceA = a.niveauUrgence === "urgent" ? 0 : 1;
  const urgenceB = b.niveauUrgence === "urgent" ? 0 : 1;
  if (urgenceA !== urgenceB) return urgenceA - urgenceB;
  return horodatage(a) - horodatage(b);
}

/**
 * Construit la file de validation. `idProfessionnelCourant` null (profil
 * introuvable) : aucun resultat n'est considere comme "saisi par moi", mais
 * le serveur reste seul juge au moment de valider.
 */
export function construireFileValidation<T extends ExamenPourFileValidation>(
  examens: readonly T[],
  idProfessionnelCourant: string | null
): FileValidation<T> {
  const enAttente = examens
    .filter((examen) => examen.statut === STATUT_EN_ATTENTE_DE_VALIDATION)
    .sort(comparerPourValidation);

  const estSaisiParMoi = (examen: T) =>
    idProfessionnelCourant !== null && examen.saisiParId === idProfessionnelCourant;

  return {
    aValider: enAttente.filter((examen) => !estSaisiParMoi(examen)),
    saisisParMoi: enAttente.filter(estSaisiParMoi),
  };
}
