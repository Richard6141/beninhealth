/**
 * Regles du referentiel des etablissements (F-ADM-02 du pack). Module pur
 * (pas de "use server", aucun acces base) : gardes testees une par une,
 * appliquees par etablissements.ts avant toute ecriture.
 */

/** Les quatre types que la plateforme traite aujourd'hui (voir referentiels-simples-catalogue.ts). */
export const TYPES_ETABLISSEMENT_TRAITES = ["centre_sante", "hopital", "laboratoire", "pharmacie"] as const;
export type TypeEtablissementTraite = (typeof TYPES_ETABLISSEMENT_TRAITES)[number];

export const LIBELLES_TYPE_ETABLISSEMENT: Record<TypeEtablissementTraite, string> = {
  centre_sante: "Centre de santé",
  hopital: "Hôpital",
  laboratoire: "Laboratoire",
  pharmacie: "Pharmacie",
};

export const CAPACITE_MAXIMALE = 100000;
export const NOMBRE_MAXIMUM_SERVICES = 40;
export const LONGUEUR_MAXIMALE_SERVICE = 80;

/** Emprise du Benin (marge comprise) : un point hors de ce rectangle n'est jamais un etablissement du pays. */
export const EMPRISE_BENIN = { latitudeMin: 6.1, latitudeMax: 12.5, longitudeMin: 0.7, longitudeMax: 3.95 } as const;

export function verifierCoordonnees(latitude: number, longitude: number): string | null {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return "Les coordonnées GPS doivent être des nombres.";
  }
  if (
    latitude < EMPRISE_BENIN.latitudeMin ||
    latitude > EMPRISE_BENIN.latitudeMax ||
    longitude < EMPRISE_BENIN.longitudeMin ||
    longitude > EMPRISE_BENIN.longitudeMax
  ) {
    return "Ces coordonnées sont hors du Bénin (latitude entre 6,1 et 12,5, longitude entre 0,7 et 3,95).";
  }
  return null;
}

export type Anneau = readonly (readonly [number, number])[];

export interface GeometrieTerritoire {
  nom: string;
  type: "Polygon" | "MultiPolygon";
  /** Polygon : liste d'anneaux ; MultiPolygon : liste de polygones. */
  coordonnees: readonly Anneau[] | readonly (readonly Anneau[])[];
}

/** Test du rayon (nombre de croisements) : le point (x, y) est-il dans l'anneau ? */
function pointDansAnneau(x: number, y: number, anneau: Anneau): boolean {
  let dedans = false;
  for (let i = 0, j = anneau.length - 1; i < anneau.length; j = i, i += 1) {
    const [xi, yi] = anneau[i];
    const [xj, yj] = anneau[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) dedans = !dedans;
  }
  return dedans;
}

/** Un polygone : dans l'anneau exterieur et hors de chaque trou. */
function pointDansPolygone(x: number, y: number, anneaux: readonly Anneau[]): boolean {
  if (anneaux.length === 0 || !pointDansAnneau(x, y, anneaux[0])) return false;
  return anneaux.slice(1).every((trou) => !pointDansAnneau(x, y, trou));
}

/** Le point (longitude, latitude) est-il a l'interieur du territoire ? */
export function pointDansTerritoire(longitude: number, latitude: number, territoire: GeometrieTerritoire): boolean {
  if (territoire.type === "Polygon") {
    return pointDansPolygone(longitude, latitude, territoire.coordonnees as readonly Anneau[]);
  }
  return (territoire.coordonnees as readonly (readonly Anneau[])[]).some((polygone) => pointDansPolygone(longitude, latitude, polygone));
}

/** Minuscules sans accents, pour rapprocher "Ouémé" de "Oueme" (noms du referentiel et des contours). */
export function normaliserNomTerritoire(nom: string): string {
  return nom
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Le point doit etre a l'interieur du departement de la commune choisie
 * (F-ADM-02 : "le point doit etre a l'interieur de la commune choisie"). Maille
 * assumee : le departement, la plus fine dont le depot embarque les contours
 * (aucun contour de commune ni de zone sanitaire). Sans contour connu pour ce
 * departement, aucun refus n'est invente : le controle est alors ignore.
 */
export function verifierPointDansDepartement(
  latitude: number,
  longitude: number,
  departementNom: string,
  geometries: readonly GeometrieTerritoire[]
): string | null {
  const cle = normaliserNomTerritoire(departementNom);
  const geometrie = geometries.find((candidate) => normaliserNomTerritoire(candidate.nom) === cle);
  if (!geometrie) return null;
  return pointDansTerritoire(longitude, latitude, geometrie)
    ? null
    : `Ces coordonnées ne sont pas dans le département ${departementNom} : vérifiez le point ou la commune choisie.`;
}

/** Zone de texte, une ligne par service, sans doublon ni ligne vide. Renvoie la liste ou un message d'erreur. */
export function analyserServices(brut: string): { services: string[] } | { erreur: string } {
  const services: string[] = [];
  for (const ligne of brut.split(/\r?\n/)) {
    const service = ligne.trim();
    if (service.length === 0) continue;
    if (service.length > LONGUEUR_MAXIMALE_SERVICE) {
      return { erreur: `Un service ne peut pas dépasser ${LONGUEUR_MAXIMALE_SERVICE} caractères.` };
    }
    if (!services.some((existant) => existant.toLowerCase() === service.toLowerCase())) services.push(service);
  }
  if (services.length > NOMBRE_MAXIMUM_SERVICES) {
    return { erreur: `Au plus ${NOMBRE_MAXIMUM_SERVICES} services.` };
  }
  return { services };
}

/**
 * Changer le type d'un etablissement ne doit jamais rendre incoherentes des
 * donnees deja rattachees : un laboratoire qui a recu des examens, une
 * pharmacie qui a delivre des ordonnances ne peuvent plus changer de type.
 */
export function verifierChangementType(
  ancien: string,
  nouveau: string,
  rattaches: { examensRecus: number; delivrancesFaites: number }
): string | null {
  if (ancien === nouveau) return null;
  if (ancien === "laboratoire" && rattaches.examensRecus > 0) {
    return "Ce laboratoire a déjà reçu des examens : son type ne peut plus changer.";
  }
  if (ancien === "pharmacie" && rattaches.delivrancesFaites > 0) {
    return "Cette pharmacie a déjà délivré des ordonnances : son type ne peut plus changer.";
  }
  return null;
}
