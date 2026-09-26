/**
 * Regles de la gestion nationale des comptes (F-ADM-05 du pack). Module pur
 * (pas de "use server", aucun acces base) : les gardes vivent ici, isolees et
 * testees une par une, et gestion-comptes-nationale.ts les applique avant
 * toute ecriture.
 *
 * RG-ADM-30 : toute action sur un compte d'administrateur doit etre confirmee
 * par un SECOND administrateur (quatre yeux). Le pack cite aussi les
 * auditeurs ; ce depot n'a pas de role auditeur distinct (rattache a
 * admin_national, voir docs/reste-a-faire.md), un compte "administrateur" est
 * donc un compte portant le role admin_national.
 */

export const ROLE_ADMINISTRATEUR = "admin_national";

/** Duree pendant laquelle une action en attente peut etre approuvee. */
export const DUREE_VALIDITE_DEMANDE_HEURES = 72;

export const TYPES_ACTION_COMPTE = ["suspension", "reactivation", "reinitialisation_2fa", "invitation_admin"] as const;
export type TypeActionCompte = (typeof TYPES_ACTION_COMPTE)[number];

export const LIBELLES_TYPE_ACTION: Record<TypeActionCompte, string> = {
  suspension: "Suspension du compte",
  reactivation: "Réactivation du compte",
  reinitialisation_2fa: "Réinitialisation du second facteur",
  invitation_admin: "Invitation d'un administrateur",
};

/** Ce que les gardes doivent savoir du compte vise, jamais un secret ni un hash. */
export interface ContexteCible {
  id: string;
  roles: readonly string[];
  statut: string;
  mfaActif: boolean;
  /** Statut de validation du profil professionnel (F-ADM-03), null si le compte n'en a pas. */
  statutValidationProfessionnel: string | null;
}

export function estCompteAdministrateur(roles: readonly string[]): boolean {
  return roles.includes(ROLE_ADMINISTRATEUR);
}

/**
 * RG-ADM-30 : vrai si l'action doit passer par une demande confirmee par un
 * second administrateur. Une invitation d'administrateur l'exige toujours ;
 * les autres actions l'exigent quand le compte vise est un administrateur.
 */
export function exigeDoubleValidation(type: TypeActionCompte, cible: Pick<ContexteCible, "roles"> | null): boolean {
  if (type === "invitation_admin") return true;
  return cible !== null && estCompteAdministrateur(cible.roles);
}

/**
 * Gardes a verifier AVANT de demander ou d'executer une action sur un compte
 * existant. Renvoie le message d'erreur du premier garde qui refuse, ou null.
 * `nombreAdminsActifsAutres` : nombre de comptes admin_national ACTIFS autres
 * que la cible.
 */
export function verifierActionSurCompte(params: {
  type: Exclude<TypeActionCompte, "invitation_admin">;
  acteurId: string;
  cible: ContexteCible;
  nombreAdminsActifsAutres: number;
}): string | null {
  const { type, acteurId, cible, nombreAdminsActifsAutres } = params;

  if (acteurId === cible.id) {
    return "Vous ne pouvez pas agir sur votre propre compte.";
  }

  if (type === "suspension") {
    if (cible.statut !== "actif") {
      return "Seul un compte actif peut être suspendu.";
    }
    if (estCompteAdministrateur(cible.roles) && nombreAdminsActifsAutres < 1) {
      return "Impossible de suspendre le dernier administrateur national actif.";
    }
  }

  if (type === "reactivation") {
    if (cible.statut !== "suspendu") {
      return "Seul un compte suspendu peut être réactivé.";
    }
    if (cible.statutValidationProfessionnel === "rejete") {
      return "Ce professionnel a été refusé lors de la validation : seule une nouvelle validation peut le rétablir.";
    }
  }

  if (type === "reinitialisation_2fa" && !cible.mfaActif) {
    return "Ce compte n'a pas de second facteur actif.";
  }

  return null;
}

/**
 * Gardes de l'approbation ou du refus d'une action en attente (RG-ADM-30) :
 * la demande doit etre encore en attente, non expiree, et decidee par un
 * AUTRE administrateur que celui qui l'a demandee.
 */
export function verifierDecisionSurDemande(params: {
  statut: string;
  demandeParId: string;
  decideurId: string;
  expireLe: Date;
  maintenant: Date;
}): string | null {
  const { statut, demandeParId, decideurId, expireLe, maintenant } = params;

  if (statut !== "en_attente") {
    return "Cette demande a déjà été traitée.";
  }
  if (maintenant.getTime() > expireLe.getTime()) {
    return "Cette demande a expiré : refaites-la.";
  }
  if (demandeParId === decideurId) {
    return "La demande doit être confirmée par un autre administrateur (quatre yeux, RG-ADM-30).";
  }
  return null;
}
