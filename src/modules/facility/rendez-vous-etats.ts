/**
 * Machine a etats unique de RendezVous (RG-RDV-00 du pack, "transitionAppointment").
 * Module SANS "use server" : ces fonctions ecrivent en base et ne doivent
 * jamais etre atteignables par POST.
 *
 * Toute modification de RendezVous.statut passe par transitionnerRendezVous :
 * la mise a jour est conditionnee, dans la meme requete SQL, au statut de
 * depart attendu (UPDATE ... WHERE id = ? AND statut IN (...)). Deux actions
 * concurrentes sur le meme rendez-vous ne peuvent donc pas s'ecraser : la
 * seconde voit 0 ligne modifiee et est refusee.
 *
 * Limite assumee : huit statuts ("demande", "confirme", "en_consultation",
 * "termine", "annule", "absent", "refuse", "expire") ; pas de
 * LEFT_WITHOUT_CARE du pack.
 */

import { Prisma } from "@prisma/client";
import type { PrismaClient } from "@prisma/client";

export const STATUTS_RENDEZ_VOUS = [
  "demande",
  "confirme",
  "en_consultation",
  "termine",
  "annule",
  "absent",
  "refuse",
  "expire",
] as const;
export type StatutRendezVous = (typeof STATUTS_RENDEZ_VOUS)[number];

/** Statuts qui liberent le creneau du professionnel (l'index unique partiel de la base les exclut). */
export const STATUTS_QUI_LIBERENT_LE_CRENEAU: readonly StatutRendezVous[] = ["annule", "refuse", "expire"];

/** Statuts d'un rendez-vous encore a venir ou en cours qui compte pour le plafond de RG-RDV-02. */
export const STATUTS_ACTIFS: readonly StatutRendezVous[] = ["demande", "confirme", "en_consultation"];

export type EvenementRendezVous =
  | "confirmer"
  | "refuser"
  | "expirer"
  | "annuler"
  | "enregistrer_arrivee"
  | "marquer_absent"
  | "demarrer_consultation"
  | "terminer";

interface Transition {
  depuis: readonly StatutRendezVous[];
  vers: StatutRendezVous;
  refus: string;
}

export const TRANSITIONS: Record<EvenementRendezVous, Transition> = {
  confirmer: {
    depuis: ["demande"],
    vers: "confirme",
    refus: "Ce rendez-vous ne peut plus être confirmé : il n'est plus en attente de confirmation.",
  },
  // F-RDV-03 : refus par l'etablissement, motif obligatoire (motifRefus, ecrit avec la transition).
  refuser: {
    depuis: ["demande"],
    vers: "refuse",
    refus: "Ce rendez-vous ne peut plus être refusé : il n'est plus en attente de confirmation.",
  },
  // RG-RDV-20 : tache planifiee, jamais une action d'utilisateur.
  expirer: {
    depuis: ["demande"],
    vers: "expire",
    refus: "Cette demande n'est plus en attente.",
  },
  annuler: {
    depuis: ["demande", "confirme"],
    vers: "annule",
    refus: "Ce rendez-vous ne peut plus être annulé : il est déjà annulé, terminé ou marqué absent.",
  },
  // Un patient marque "absent" par la tache planifiee mais finalement arrive
  // est corrige, comme documente dans file-du-jour.ts. "confirme" -> "confirme"
  // ne change que heureArrivee (arrivee enregistree deux fois : idempotent).
  enregistrer_arrivee: {
    depuis: ["demande", "confirme", "absent"],
    vers: "confirme",
    refus: "Ce rendez-vous est déjà clôturé (terminé ou annulé).",
  },
  marquer_absent: {
    depuis: ["confirme"],
    vers: "absent",
    refus: "Ce rendez-vous ne peut pas être marqué absent.",
  },
  // F-RDV-05 : le medecin demarre la consultation liee au rendez-vous (IN_CARE du pack).
  demarrer_consultation: {
    depuis: ["demande", "confirme", "absent"],
    vers: "en_consultation",
    refus: "Ce rendez-vous ne peut plus être pris en charge.",
  },
  // La validation d'une consultation est un acte clinique qui prime sur l'etat
  // administratif : voir clinical/actions.ts, un refus n'y bloque pas la signature.
  terminer: {
    depuis: ["demande", "confirme", "absent", "en_consultation"],
    vers: "termine",
    refus: "Ce rendez-vous est déjà terminé ou annulé.",
  },
};

export function transitionAutorisee(depuis: string, evenement: EvenementRendezVous): boolean {
  return (TRANSITIONS[evenement].depuis as readonly string[]).includes(depuis);
}

type ClientRendezVous = PrismaClient | Prisma.TransactionClient;

export interface OptionsTransition {
  /** Champs supplementaires ecrits dans la meme mise a jour (ex. heureArrivee). */
  donnees?: Prisma.RendezVousUpdateManyMutationInput;
  /** Conditions supplementaires de la meme requete (ex. heureArrivee: null pour l'absence). */
  conditions?: Prisma.RendezVousWhereInput;
}

/**
 * Applique un evenement a tous les rendez-vous qui satisfont `conditions` ET
 * dont le statut permet cet evenement. Renvoie le nombre de rendez-vous modifies.
 */
export async function transitionnerRendezVousEnMasse(
  client: ClientRendezVous,
  evenement: EvenementRendezVous,
  options: OptionsTransition
): Promise<number> {
  const transition = TRANSITIONS[evenement];
  const resultat = await client.rendezVous.updateMany({
    where: { ...options.conditions, statut: { in: [...transition.depuis] } },
    data: { ...options.donnees, statut: transition.vers },
  });
  return resultat.count;
}

/**
 * Applique un evenement a un rendez-vous. Renvoie false (rien n'est modifie)
 * si le statut courant ne permet pas cet evenement ou si le rendez-vous n'existe pas.
 */
export async function transitionnerRendezVous(
  client: ClientRendezVous,
  rendezVousId: string,
  evenement: EvenementRendezVous,
  options: OptionsTransition = {}
): Promise<boolean> {
  const nombre = await transitionnerRendezVousEnMasse(client, evenement, {
    ...options,
    conditions: { ...options.conditions, id: rendezVousId },
  });
  return nombre === 1;
}

/** RG-RDV-03 : un professionnel n'a jamais deux rendez-vous non annules au meme instant (index unique partiel en base). */
export function estConflitDeCreneau(erreur: unknown): boolean {
  return erreur instanceof Prisma.PrismaClientKnownRequestError && erreur.code === "P2002";
}

export const MESSAGE_CRENEAU_PRIS = "Ce créneau vient d'être réservé par un autre patient. Merci de choisir un autre horaire.";
