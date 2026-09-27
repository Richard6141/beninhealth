/**
 * Durees de session selon le profil (section 23.3 du pack, F-AUTH-02,
 * RG-AUTH-12). Module pur, partage par la creation de la session, sa lecture et
 * le cookie.
 *
 * | Profil                        | Duree maximale | Inactivite (serveur) |
 * | Patient                       | 30 jours       | aucune               |
 * | Professionnel de soins        | 12 heures      | aucune (verrou d'ecran a 10 min, cote navigateur) |
 * | Administrateur d'etablissement| 12 heures      | 15 minutes           |
 * | Administrateur national       | 8 heures       | 15 minutes           |
 * | Appareil partage (tout profil)| duree ci-dessus, cookie de session | 30 minutes |
 *
 * Un compte a plusieurs roles suit la regle la plus stricte de ses roles.
 * Limite assumee : la duree du patient est absolue depuis la connexion (30 jours),
 * pas glissante : renouveler le cookie a chaque visite demanderait de le
 * reecrire hors d'une action serveur.
 */

import type { NomRole } from "@/types";

export interface ReglesSession {
  /** Duree maximale depuis la connexion. */
  dureeMaxSecondes: number;
  /** Inactivite au-dela de laquelle la session est fermee cote serveur ; null = aucune limite serveur. */
  inactiviteMaxSecondes: number | null;
  /** Cookie persistant (duree maximale) ou cookie de session (disparait a la fermeture du navigateur). */
  cookiePersistant: boolean;
}

const HEURE = 60 * 60;
const JOUR = 24 * HEURE;

const DUREE_MAX_PAR_ROLE: Record<NomRole, number> = {
  patient: 30 * JOUR,
  medecin: 12 * HEURE,
  infirmier: 12 * HEURE,
  agent_communautaire: 12 * HEURE,
  pharmacien: 12 * HEURE,
  laboratoire: 12 * HEURE,
  admin_etablissement: 12 * HEURE,
  admin_national: 8 * HEURE,
};

const INACTIVITE_PAR_ROLE: Partial<Record<NomRole, number>> = {
  admin_etablissement: 15 * 60,
  admin_national: 15 * 60,
};

const INACTIVITE_APPAREIL_PARTAGE = 30 * 60;

export function reglesDeSession(roles: ReadonlyArray<NomRole>, appareilPartage: boolean): ReglesSession {
  const rolesConnus = roles.length > 0 ? roles : (["patient"] as NomRole[]);
  const dureeMaxSecondes = Math.min(...rolesConnus.map((role) => DUREE_MAX_PAR_ROLE[role]));
  const limites = rolesConnus
    .map((role) => INACTIVITE_PAR_ROLE[role])
    .filter((limite): limite is number => limite !== undefined);

  if (appareilPartage) {
    limites.push(INACTIVITE_APPAREIL_PARTAGE);
  }

  return {
    dureeMaxSecondes,
    inactiviteMaxSecondes: limites.length > 0 ? Math.min(...limites) : null,
    cookiePersistant: !appareilPartage,
  };
}

/**
 * Vrai si la session est expiree : plus ancienne que sa duree maximale, ou
 * inactive depuis plus longtemps que la limite du profil.
 */
export function sessionExpiree(
  params: { creeeLe: Date; derniereActivite: Date; roles: ReadonlyArray<NomRole>; appareilPartage: boolean },
  maintenant: Date = new Date()
): boolean {
  const regles = reglesDeSession(params.roles, params.appareilPartage);

  if (maintenant.getTime() - params.creeeLe.getTime() > regles.dureeMaxSecondes * 1000) {
    return true;
  }

  return (
    regles.inactiviteMaxSecondes !== null &&
    maintenant.getTime() - params.derniereActivite.getTime() > regles.inactiviteMaxSecondes * 1000
  );
}
