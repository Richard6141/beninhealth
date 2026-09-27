import { prisma } from "@/lib/prisma";

/**
 * Suivi des taches planifiees en process (F-ADM-01 du pack, etat technique du
 * tableau de bord administrateur) : chaque execution ecrit une ligne
 * ExecutionTache, "ok" avec le nombre d'elements traites ou "erreur" avec un
 * message technique tronque. Module pur (pas de "use server") : aucune de ces
 * fonctions n'est un point d'entree.
 *
 * Le suivi ne doit jamais faire echouer ni ralentir une tache : toute erreur
 * d'ecriture du suivi est absorbee. Le message d'erreur ne contient que le nom
 * et le message de l'exception, tronques, jamais sa pile (qui peut citer des
 * donnees) ; les taches n'ecrivent de toute facon aucune donnee de sante dans
 * leurs messages d'erreur.
 */

export const LONGUEUR_MAX_MESSAGE = 300;

/** Taches suivies, avec leur libelle affiche sur le tableau de bord. */
export const LIBELLES_TACHES: Record<string, string> = {
  purge_notifications: "Purge des notifications",
  remise_sms_differes: "Remise des SMS différés",
  reprises_sms: "Reprises des SMS en échec",
  detection_anomalies_acces: "Détection d'anomalies d'accès",
  relances_laboratoire: "Relances du laboratoire",
  rappels_rendez_vous: "Rappels de rendez-vous",
  marquage_absences: "Marquage des absences",
  expiration_demandes_rendez_vous: "Expiration des demandes de rendez-vous",
};

export const RETENTION_JOURS = 30;

/** Message d'erreur technique, tronque, sans pile d'appels. */
export function messageErreurTronque(erreur: unknown): string {
  const brut = erreur instanceof Error ? `${erreur.name}: ${erreur.message}` : String(erreur);
  return brut.slice(0, LONGUEUR_MAX_MESSAGE);
}

/**
 * Execute `travail` et enregistre son resultat : "ok" avec le nombre traite
 * qu'il renvoie, ou "erreur" avec le message tronque (l'erreur est alors
 * relancee a l'appelant, qui garde sa propre journalisation console).
 */
export async function suivreExecution(tache: string, travail: () => Promise<number | void>): Promise<void> {
  let nombreTraite: number | null = null;
  try {
    const resultat = await travail();
    nombreTraite = typeof resultat === "number" ? resultat : null;
  } catch (erreur) {
    await enregistrer(tache, "erreur", null, messageErreurTronque(erreur));
    throw erreur;
  }
  await enregistrer(tache, "ok", nombreTraite, null);
}

async function enregistrer(tache: string, statut: "ok" | "erreur", nombreTraite: number | null, message: string | null): Promise<void> {
  try {
    await prisma.executionTache.create({ data: { tache, statut, nombreTraite, message } });
  } catch (erreur) {
    console.error("[administration] suivi d'execution non enregistre", tache, erreur);
  }
}

/** Supprime les executions de plus de 30 jours. Retourne le nombre supprime. */
export async function purgerExecutionsAnciennes(maintenant: Date = new Date()): Promise<number> {
  const seuil = new Date(maintenant.getTime() - RETENTION_JOURS * 24 * 60 * 60 * 1000);
  const resultat = await prisma.executionTache.deleteMany({ where: { date: { lt: seuil } } });
  return resultat.count;
}
