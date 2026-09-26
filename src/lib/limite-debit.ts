/**
 * Limitation de debit generique, en memoire, par cle (typiquement une
 * adresse IP). Utilise pour RG-PRE-41 (30 verifications d'ordonnance par
 * minute et par adresse IP, F-PRE-06).
 *
 * Limite assumee, deja documentee ailleurs dans ce depot pour des besoins
 * similaires (ex. jetons de telechargement F-CIT-06) : store en memoire du
 * processus, donc par instance de serveur. Suffisant pour ce depot
 * (deploiement mono-processus), pas adapte tel quel a un deploiement
 * multi-instance sans etat partage (Redis ou equivalent).
 */

interface CompteurFenetre {
  debutFenetre: number;
  compte: number;
}

const compteursParCle = new Map<string, CompteurFenetre>();

/** Retire les entrees dont la fenetre est perimee, appele paresseusement (pas de tache planifiee dediee). */
function nettoyerCompteursExpires(dureeFenetreMs: number, maintenant: number): void {
  for (const [cle, compteur] of compteursParCle) {
    if (maintenant - compteur.debutFenetre > dureeFenetreMs) {
      compteursParCle.delete(cle);
    }
  }
}

/**
 * Incremente le compteur de `cle` et indique si la limite est depassee.
 * Fenetre glissante approximee par une fenetre fixe qui se reinitialise
 * (suffisant pour une protection anti-abus simple, pas un besoin de
 * precision a la milliseconde).
 */
export function verifierEtIncrementerDebit(
  cle: string,
  limiteParFenetre: number,
  dureeFenetreMs: number
): { autorise: boolean; restant: number } {
  const maintenant = Date.now();
  if (compteursParCle.size > 10000) {
    nettoyerCompteursExpires(dureeFenetreMs, maintenant);
  }

  const compteur = compteursParCle.get(cle);
  if (!compteur || maintenant - compteur.debutFenetre > dureeFenetreMs) {
    compteursParCle.set(cle, { debutFenetre: maintenant, compte: 1 });
    return { autorise: true, restant: limiteParFenetre - 1 };
  }

  if (compteur.compte >= limiteParFenetre) {
    return { autorise: false, restant: 0 };
  }

  compteur.compte += 1;
  return { autorise: true, restant: limiteParFenetre - compteur.compte };
}
