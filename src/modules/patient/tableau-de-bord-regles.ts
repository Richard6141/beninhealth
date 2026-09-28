/**
 * Regles pures du tableau de bord citoyen (F-CIT-02), sans session ni base :
 * testables directement, importables depuis la page serveur.
 *
 * Selecteur de personne (moi / personne a charge) : ce module ne decide
 * JAMAIS d'un acces. Il se contente de lire le parametre d'URL `personne` et
 * de construire des liens. L'acces reel au dossier d'une personne a charge
 * reste verifie a chaque lecture par les fonctions Zero Trust deja en place
 * dans src/modules/proches/actions.ts (getProcheParId, getRendezVousDuProche,
 * via procheAutorise : Consentement actif du citoyen connecte sur un patient
 * "sans_compte"). Un identifiant fabrique a la main dans l'URL aboutit donc a
 * une page introuvable, exactement comme /app/patient/proches/[id].
 */

export const CHEMIN_TABLEAU_DE_BORD = "/app/patient";
export const PARAMETRE_PERSONNE = "personne";

/** Borne defensive sur la longueur d'un identifiant (cuid/uuid bien plus courts) : evite de propager une valeur absurde jusqu'a la base. */
const LONGUEUR_MAX_IDENTIFIANT = 64;
const FORME_IDENTIFIANT = /^[A-Za-z0-9_-]+$/;

/**
 * Identifiant de personne a charge demande dans l'URL, ou null pour "mon
 * propre tableau de bord". Une valeur repetee (`?personne=a&personne=b`),
 * vide, trop longue ou de forme inattendue est traitee comme absente : on
 * retombe sur le tableau de bord du titulaire plutot que de deviner.
 */
export function lirePersonneDemandee(valeur: string | string[] | undefined): string | null {
  if (typeof valeur !== "string") {
    return null;
  }

  const identifiant = valeur.trim();

  if (
    identifiant.length === 0 ||
    identifiant.length > LONGUEUR_MAX_IDENTIFIANT ||
    !FORME_IDENTIFIANT.test(identifiant)
  ) {
    return null;
  }

  return identifiant;
}

/** Lien du tableau de bord : le sien (procheId null) ou celui d'une personne a charge. */
export function lienTableauDeBord(procheId: string | null): string {
  if (!procheId) {
    return CHEMIN_TABLEAU_DE_BORD;
  }

  return `${CHEMIN_TABLEAU_DE_BORD}?${PARAMETRE_PERSONNE}=${encodeURIComponent(procheId)}`;
}

export interface OngletPersonne {
  /** null = le titulaire du compte lui-meme. */
  procheId: string | null;
  libelle: string;
  href: string;
  actif: boolean;
}

/**
 * Onglets du selecteur, titulaire d'abord puis personnes a charge dans
 * l'ordre recu (getMesProches : plus recemment ajoutee d'abord). Vide quand
 * le citoyen ne gere aucune personne a charge : la page n'affiche alors aucun
 * selecteur, sans changement pour la grande majorite des comptes.
 */
export function ongletsPersonnes(
  proches: ReadonlyArray<{ id: string; prenom: string; nom: string }>,
  procheActifId: string | null
): OngletPersonne[] {
  if (proches.length === 0) {
    return [];
  }

  return [
    { procheId: null, libelle: "Moi", href: lienTableauDeBord(null), actif: procheActifId === null },
    ...proches.map((proche) => ({
      procheId: proche.id,
      libelle: `${proche.prenom} ${proche.nom}`.trim(),
      href: lienTableauDeBord(proche.id),
      actif: proche.id === procheActifId,
    })),
  ];
}

/**
 * Rendez-vous "a venir" du tableau de bord : statut demande ou confirme, date
 * non encore passee, tries par date croissante. Generique : sert autant aux
 * rendez-vous du titulaire (facility/actions.ts) qu'a ceux d'une personne a
 * charge (proches/actions.ts), dont les formes different.
 */
export function rendezVousAVenir<T extends { statut: string; date: string }>(
  rendezVous: readonly T[],
  maintenant: number = Date.now()
): T[] {
  return rendezVous
    .filter(
      (rdv) =>
        (rdv.statut === "demande" || rdv.statut === "confirme") &&
        new Date(rdv.date).getTime() >= maintenant
    )
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
}
