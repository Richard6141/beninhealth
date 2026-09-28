/**
 * Lien "Itineraire" vers un etablissement de sante (F-CIT-02, meme patron que
 * la fiche publique F-ETA-02, src/app/etablissements/[id]/page.tsx) : un
 * simple lien externe vers Google Maps construit a partir des coordonnees GPS
 * de l'etablissement, deja publiques dans l'annuaire. Aucune carte embarquee,
 * aucun appel reseau cote serveur, aucune donnee du patient transmise : seule
 * la destination figure dans l'URL, le point de depart est laisse a
 * l'application de carte du citoyen (sa position, s'il l'autorise).
 *
 * Difference assumee avec F-ETA-02 : la fiche publique pointe vers une
 * recherche de lieu (`/maps/search/`), ce module vers le calcul d'itineraire
 * lui-meme (`/maps/dir/`, parametre `destination`), plus proche du libelle
 * "Itineraire" affiche au citoyen. Les deux formes sont documentees par
 * Google (Maps URLs, `api=1`) et ne demandent aucune cle.
 *
 * Module pur (pas de "use server") : importable depuis une page serveur comme
 * depuis un test, sans session ni base.
 */

const BASE_ITINERAIRE = "https://www.google.com/maps/dir/?api=1&destination=";

function coordonneeValide(valeur: number | null | undefined, limite: number): valeur is number {
  return typeof valeur === "number" && Number.isFinite(valeur) && Math.abs(valeur) <= limite;
}

/**
 * URL d'itineraire vers ces coordonnees, ou null si elles sont absentes,
 * invalides ou au point (0, 0) (valeur par defaut typique d'une saisie
 * manquante, jamais un etablissement reel au Benin) : dans ce cas l'appelant
 * n'affiche simplement pas de lien plutot qu'un lien vers un point faux.
 */
export function lienItineraire(
  latitude: number | null | undefined,
  longitude: number | null | undefined
): string | null {
  if (!coordonneeValide(latitude, 90) || !coordonneeValide(longitude, 180)) {
    return null;
  }

  if (latitude === 0 && longitude === 0) {
    return null;
  }

  return `${BASE_ITINERAIRE}${latitude},${longitude}`;
}
