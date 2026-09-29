/**
 * Regles pures de prise, d'annulation, de deplacement et d'expiration des
 * rendez-vous (F-RDV-01, F-RDV-02, F-RDV-03 du pack, RG-RDV-01, 02, 10, 11,
 * 20). Sans acces base ni "use server" : partagees par les actions, les
 * taches planifiees et les ecrans, et testees seules.
 *
 * Limites assumees (perimetre reduit de ce depot, sans creneaux physiques ni
 * services) : le delai maximal est de 30 jours pour tous les etablissements
 * (le parametre par etablissement, maximum 90, n'existe pas) ; RG-RDV-05
 * (3 absences, confirmation manuelle) est deja satisfaite par construction
 * pour le patient, dont toute demande part au statut "demande".
 */

const UNE_HEURE_MS = 60 * 60 * 1000;
const UN_JOUR_MS = 24 * UNE_HEURE_MS;

/** RG-RDV-01 : reservable a partir de 1 heure apres l'instant present. */
export const DELAI_MINIMUM_RESERVATION_MS = UNE_HEURE_MS;
/** RG-RDV-01 : et jusqu'a 30 jours a l'avance. */
export const HORIZON_RESERVATION_JOURS = 30;
/** Rendez-vous pris au guichet : pas de delai minimum (F-RDV-06), horizon maximal du pack. */
export const HORIZON_GUICHET_JOURS = 90;
/** RG-RDV-02 : 3 rendez-vous futurs actifs au maximum par personne. */
export const MAX_RENDEZ_VOUS_FUTURS = 3;
/** RG-RDV-10 : l'annulation par le patient est possible jusqu'a 2 heures avant. */
export const DELAI_ANNULATION_PATIENT_MS = 2 * UNE_HEURE_MS;
/** RG-RDV-11 : un rendez-vous ne se deplace que 2 fois. */
export const MAX_DEPLACEMENTS = 2;
/** RG-RDV-20 : une demande sans reponse expire 24 heures apres sa creation... */
export const DELAI_EXPIRATION_DEMANDE_MS = UN_JOUR_MS;
/** ... ou au plus tard 1 heure avant le creneau, au premier des deux. */
export const AVANCE_EXPIRATION_AVANT_CRENEAU_MS = UNE_HEURE_MS;
/** RG-RDV-33 : l'arrivee est possible jusqu'a 2 heures avant l'heure du rendez-vous. */
export const DELAI_ARRIVEE_AVANT_MS = 2 * UNE_HEURE_MS;
/** RG-RDV-33 : et jusqu'a 1 heure apres, au-dela l'arrivee n'est plus rattachee a ce rendez-vous. */
export const DELAI_ARRIVEE_APRES_MS = UNE_HEURE_MS;

export const MOTIFS_REFUS_RENDEZ_VOUS = [
  { code: "creneau_indisponible", libelle: "Créneau indisponible" },
  { code: "service_ferme", libelle: "Service fermé" },
  { code: "autre_etablissement", libelle: "Orientez-vous vers un autre établissement" },
  { code: "autre", libelle: "Autre motif" },
] as const;

export type CodeMotifRefusRendezVous = (typeof MOTIFS_REFUS_RENDEZ_VOUS)[number]["code"];

export const MESSAGE_TROP_PROCHE = "Un rendez-vous se prend au moins 1 heure à l'avance.";
export const MESSAGE_TROP_LOIN = "Un rendez-vous se prend au plus 30 jours à l'avance.";
export const MESSAGE_PLAFOND_ATTEINT = "Vous avez déjà 3 rendez-vous prévus. Annulez-en un pour en prendre un nouveau.";
export const MESSAGE_MEME_JOUR = "Vous avez déjà un rendez-vous ce jour-là dans cet établissement.";
export const MESSAGE_ETABLISSEMENT_INACTIF = "Cet établissement ne prend pas de rendez-vous pour le moment.";

/**
 * RG-RDV-01 : refuse un instant trop proche ou trop lointain. `guichet` :
 * l'accueil reserve des maintenant (aucun delai minimum) et jusqu'a 90 jours.
 * Renvoie le message d'erreur, ou null si la date est reservable.
 */
export function verifierFenetreReservation(date: Date, maintenant: Date, guichet = false): string | null {
  const ecart = date.getTime() - maintenant.getTime();

  if (ecart <= 0) {
    return "La date du rendez-vous doit être dans le futur.";
  }
  if (!guichet && ecart < DELAI_MINIMUM_RESERVATION_MS) {
    return MESSAGE_TROP_PROCHE;
  }
  const horizonJours = guichet ? HORIZON_GUICHET_JOURS : HORIZON_RESERVATION_JOURS;
  if (ecart > horizonJours * UN_JOUR_MS) {
    return guichet ? `Un rendez-vous se prend au plus ${HORIZON_GUICHET_JOURS} jours à l'avance.` : MESSAGE_TROP_LOIN;
  }
  return null;
}

/** RG-RDV-10 : vrai tant qu'il reste au moins 2 heures avant le rendez-vous. */
export function annulationPatientPossible(dateRendezVous: Date, maintenant: Date): boolean {
  return dateRendezVous.getTime() - maintenant.getTime() >= DELAI_ANNULATION_PATIENT_MS;
}

export function messageAnnulationTardive(telephoneEtablissement: string | null): string {
  const appel = telephoneEtablissement ? ` au ${telephoneEtablissement}` : "";
  return `L'annulation n'est plus possible moins de 2 heures avant le rendez-vous. Appelez l'établissement${appel}.`;
}

/** RG-RDV-11 : vrai tant que le rendez-vous a ete deplace moins de 2 fois. */
export function deplacementPossible(nombreDeplacements: number): boolean {
  return nombreDeplacements < MAX_DEPLACEMENTS;
}

export const MESSAGE_DEPLACEMENTS_EPUISES =
  "Ce rendez-vous a déjà été déplacé 2 fois. Annulez-le et prenez-en un nouveau.";

/** RG-RDV-20 : instant d'expiration d'une demande sans reponse (le premier des deux delais). */
export function dateExpirationDemande(dateCreation: Date, dateRendezVous: Date): Date {
  return new Date(
    Math.min(
      dateCreation.getTime() + DELAI_EXPIRATION_DEMANDE_MS,
      dateRendezVous.getTime() - AVANCE_EXPIRATION_AVANT_CRENEAU_MS
    )
  );
}

export function demandeExpiree(dateCreation: Date, dateRendezVous: Date, maintenant: Date): boolean {
  return maintenant.getTime() >= dateExpirationDemande(dateCreation, dateRendezVous).getTime();
}

export const MESSAGE_ARRIVEE_HORS_FENETRE =
  "L'arrivée ne peut être enregistrée que de 2 heures avant à 1 heure après l'heure du rendez-vous. Passé ce délai, enregistrez une arrivée sans rendez-vous.";

/**
 * RG-RDV-33 : l'arrivee est possible de 2 heures avant a 1 heure apres
 * l'heure du rendez-vous (bornes incluses). Au-dela, le pack prevoit qu'elle
 * soit enregistree comme "sans rendez-vous" plutot que rattachee a ce
 * rendez-vous precis (fonctionnalite separee, non construite dans ce depot,
 * voir docs/reste-a-faire.md F-RDV-04) : cette fonction sert donc ici a
 * refuser plutot qu'a reclasser.
 */
export function arriveeDansLaFenetre(dateRendezVous: Date, maintenant: Date): boolean {
  const ecart = maintenant.getTime() - dateRendezVous.getTime();
  return ecart >= -DELAI_ARRIVEE_AVANT_MS && ecart <= DELAI_ARRIVEE_APRES_MS;
}

/**
 * Bornes UTC du jour civil LOCAL (Africa/Porto-Novo, UTC+1 fixe, RG-ETA-43)
 * qui contient `date`, pour la regle "un seul rendez-vous par jour et par
 * etablissement".
 */
export function bornesJourLocalBenin(date: Date): { debut: Date; fin: Date } {
  const decalage = UNE_HEURE_MS;
  const debutLocal = Math.floor((date.getTime() + decalage) / UN_JOUR_MS) * UN_JOUR_MS;
  return { debut: new Date(debutLocal - decalage), fin: new Date(debutLocal - decalage + UN_JOUR_MS) };
}
