/**
 * Rafraichissement periodique du compteur de notifications non lues
 * (F-NOT-01 du pack : mise a jour a 60 s). Logique pure, sans React ni DOM,
 * pour rester testable ; ClocheNotifications s'en sert dans un useEffect.
 */

export interface OptionsRafraichissement {
  intervalleMs: number;
  /** Faux quand l'onglet est cache : aucune requete inutile en arriere-plan. */
  estVisible: () => boolean;
}

export interface RafraichissementCompteur {
  /** Lecture immediate (ex. quand l'onglet redevient visible). */
  rafraichir: () => Promise<void>;
  arreter: () => void;
}

export function demarrerRafraichissementCompteur(
  lire: () => Promise<number>,
  surResultat: (compte: number) => void,
  { intervalleMs, estVisible }: OptionsRafraichissement
): RafraichissementCompteur {
  let actif = true;

  const rafraichir = async () => {
    if (!actif || !estVisible()) return;
    try {
      const compte = await lire();
      // Un resultat qui arrive apres l'arret (demontage du composant) est ignore.
      if (actif) surResultat(compte);
    } catch {
      // Compteur purement informatif : un echec reseau ne doit rien casser, le prochain tour reessaie.
    }
  };

  const minuteur = setInterval(() => {
    void rafraichir();
  }, intervalleMs);

  return {
    rafraichir,
    arreter: () => {
      actif = false;
      clearInterval(minuteur);
    },
  };
}
