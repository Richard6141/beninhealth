import { prisma } from "@/lib/prisma";
import { suivreExecution } from "@/modules/administration/executions-taches";
import type { CategorieNotification, CategorieVerrouillee } from "../categories";
import { fournisseurSms, type SmsProvider } from "./provider";

/**
 * Livraison des SMS avec reprises (F-NOT-02, RG-NOT-03 du pack) : la premiere
 * tentative a lieu tout de suite ; en cas d'echec du fournisseur, trois reprises
 * sont programmees apres 1 minute, 5 minutes puis 30 minutes ; si la derniere
 * echoue, la ligne passe a "echec", visible par l'administrateur
 * (/app/ministere/sms et tableau de bord). Module serveur sans "use server".
 *
 * Chaque tentative est reclamee par une mise a jour conditionnelle (statut
 * "en_attente" et prochaine tentative echue) qui repousse aussi la prochaine
 * tentative de DUREE_BAIL_MINUTES : deux instances ne livrent jamais le meme SMS
 * en meme temps, et un processus arrete en pleine tentative est repris a
 * l'echeance du bail. La tentative interrompue compte comme faite.
 *
 * L'erreur conservee est le seul message technique, tronque, sans le texte ni
 * le destinataire (aucune donnee de sante, RG-NOT-01).
 */

/** Delais avant chaque reprise, en minutes : apres l'echec de la 1re, 2e puis 3e tentative. */
export const DELAIS_REPRISE_MINUTES = [1, 5, 30] as const;
export const NOMBRE_MAXIMUM_TENTATIVES = DELAIS_REPRISE_MINUTES.length + 1;
const DUREE_BAIL_MINUTES = 10;
const LONGUEUR_MAX_ERREUR = 200;
const INTERVALLE_REPRISES_MS = 60 * 1000;

declare global {
  var __repriseSmsDemarree: boolean | undefined;
}

export interface ParametresLivraison {
  destinataire: string;
  texte: string;
  categorie: CategorieNotification | CategorieVerrouillee;
  modele: string | null;
}

function minutesApres(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60 * 1000);
}

function messageErreur(erreur: unknown): string {
  const brut = erreur instanceof Error ? erreur.message : String(erreur);
  return brut.replace(/\s+/g, " ").slice(0, LONGUEUR_MAX_ERREUR);
}

/** Prochaine echeance apres l'echec de la tentative numero `tentative` (1 = la premiere), ou null si les reprises sont epuisees. */
export function delaiAvantReprise(tentative: number): number | null {
  return tentative >= 1 && tentative <= DELAIS_REPRISE_MINUTES.length ? DELAIS_REPRISE_MINUTES[tentative - 1] : null;
}

/**
 * Tente la livraison d'une ligne "en_attente" echue. Renvoie "livre", "reessai"
 * (nouvelle tentative programmee), "echec" (reprises epuisees) ou "ignore" si
 * une autre instance l'a deja reclamee ou si elle n'est pas echue.
 */
export async function tenterLivraison(
  id: string,
  fournisseur: SmsProvider = fournisseurSms(),
  maintenant: Date = new Date()
): Promise<"livre" | "reessai" | "echec" | "ignore"> {
  const reclamation = await prisma.envoiSms.updateMany({
    where: { id, statut: "en_attente", prochaineTentativeLe: { lte: maintenant } },
    data: { tentatives: { increment: 1 }, prochaineTentativeLe: minutesApres(maintenant, DUREE_BAIL_MINUTES) },
  });
  if (reclamation.count === 0) return "ignore";

  const ligne = await prisma.envoiSms.findUnique({
    where: { id },
    select: { destinataire: true, texte: true, categorie: true, modele: true, tentatives: true },
  });
  if (!ligne) return "ignore";

  try {
    const resultat = await fournisseur.send({
      to: ligne.destinataire,
      text: ligne.texte,
      category: ligne.categorie as CategorieNotification | CategorieVerrouillee,
      modele: ligne.modele ?? undefined,
    });
    await prisma.envoiSms.update({
      where: { id },
      data: { statut: resultat.statut, dateEnvoi: maintenant, prochaineTentativeLe: null, derniereErreur: null, ...(resultat.cout !== undefined ? { cout: resultat.cout } : {}) },
    });
    return "livre";
  } catch (erreur) {
    const delai = delaiAvantReprise(ligne.tentatives);
    await prisma.envoiSms.update({
      where: { id },
      data:
        delai === null
          ? { statut: "echec", prochaineTentativeLe: null, derniereErreur: messageErreur(erreur) }
          : { prochaineTentativeLe: minutesApres(maintenant, delai), derniereErreur: messageErreur(erreur) },
    });
    return delai === null ? "echec" : "reessai";
  }
}

/** Depose un SMS a livrer maintenant, puis tente la livraison. Ne leve jamais : un echec est une reprise programmee, pas une erreur pour l'appelant. */
export async function livrerSms(parametres: ParametresLivraison, fournisseur: SmsProvider = fournisseurSms(), maintenant: Date = new Date()): Promise<void> {
  const ligne = await prisma.envoiSms.create({
    data: {
      destinataire: parametres.destinataire,
      texte: parametres.texte,
      categorie: parametres.categorie,
      modele: parametres.modele,
      statut: "en_attente",
      tentatives: 0,
      prochaineTentativeLe: maintenant,
      dateEnvoi: maintenant,
    },
    select: { id: true },
  });
  await tenterLivraison(ligne.id, fournisseur, maintenant);
}

/** Reprend les SMS "en_attente" dont la prochaine tentative est echue. Retourne le nombre de lignes traitees. */
export async function relancerSmsEnAttente(fournisseur: SmsProvider = fournisseurSms(), maintenant: Date = new Date()): Promise<number> {
  const echus = await prisma.envoiSms.findMany({
    where: { statut: "en_attente", prochaineTentativeLe: { lte: maintenant } },
    select: { id: true },
    take: 100,
  });

  let traites = 0;
  for (const { id } of echus) {
    if ((await tenterLivraison(id, fournisseur, maintenant)) !== "ignore") traites += 1;
  }
  return traites;
}

async function executerReprisesAvecJournal(): Promise<void> {
  try {
    await suivreExecution("reprises_sms", async () => {
      const traites = await relancerSmsEnAttente();
      if (traites > 0) console.log(`[notification] ${traites} SMS repris ou livres depuis la file d'attente`);
      return traites;
    });
  } catch (erreur) {
    console.error("[notification] echec des reprises de SMS", erreur);
  }
}

/** Demarre les reprises planifiees (toutes les minutes). Idempotent (drapeau global), comme demarrerRemiseSmsDifferes. */
export function demarrerRepriseSms(): void {
  if (globalThis.__repriseSmsDemarree) return;
  globalThis.__repriseSmsDemarree = true;

  setInterval(() => {
    void executerReprisesAvecJournal();
  }, INTERVALLE_REPRISES_MS);

  console.log("[notification] reprises planifiees des SMS demarrees (toutes les minutes)");
}
