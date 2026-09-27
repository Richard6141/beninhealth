import { prisma } from "@/lib/prisma";
import { JOURS_CONSERVATION_COMMENTAIRE_RETOUR } from "./regles";

/**
 * Journal des appels a l'IA (RG-IA-08). Module serveur sans "use server" :
 * les ecritures internes ne sont jamais atteignables par POST. Ne stocke ni le
 * texte envoye au modele ni sa reponse, seulement des compteurs, le modele, la
 * version de consigne et le retour du medecin.
 */

export const FONCTIONNALITE_RESUME = "resume_dossier";

const UNE_HEURE_MS = 60 * 60 * 1000;
const UN_JOUR_MS = 24 * 60 * 60 * 1000;

/** Nombre d'appels de la derniere heure pour un utilisateur (limite d'usage F-IA-01 : 30 par heure). */
export async function compterAppelsDeLHeure(utilisateurId: string, fonctionnalite: string, maintenant: Date = new Date()): Promise<number> {
  return prisma.appelIa.count({
    where: { utilisateurId, fonctionnalite, date: { gte: new Date(maintenant.getTime() - UNE_HEURE_MS) } },
  });
}

export interface OuvertureAppel {
  utilisateurId: string;
  patientId: string | null;
  fonctionnalite: string;
  modele: string;
  versionConsigne: string;
}

/**
 * Ouvre la ligne du journal AVANT l'appel au fournisseur : la limite d'usage
 * compte ainsi les appels en cours, et un appel interrompu reste visible en
 * "erreur" (statut initial) au lieu de disparaitre.
 */
export async function ouvrirAppelIa(ouverture: OuvertureAppel): Promise<string> {
  const ligne = await prisma.appelIa.create({ data: { ...ouverture, statut: "erreur" }, select: { id: true } });
  return ligne.id;
}

export interface ResultatAppel {
  statut: "ok" | "indisponible" | "bloque" | "erreur";
  modele: string;
  nombreSources: number;
  pucesLues: number;
  pucesSupprimees: number;
  dureeMs: number;
}

export async function cloreAppelIa(id: string, resultat: ResultatAppel): Promise<void> {
  await prisma.appelIa.update({ where: { id }, data: resultat });
}

/** RG-IA-08 : le commentaire de retour libre est efface au bout de 30 jours ; la ligne de journal (sans texte) est conservee. */
export async function purgerCommentairesRetourExpires(maintenant: Date = new Date()): Promise<number> {
  const seuil = new Date(maintenant.getTime() - JOURS_CONSERVATION_COMMENTAIRE_RETOUR * UN_JOUR_MS);
  const resultat = await prisma.appelIa.updateMany({
    where: { commentaireRetour: { not: null }, date: { lt: seuil } },
    data: { commentaireRetour: null },
  });
  return resultat.count;
}

export interface StatistiquesIa {
  appels: number;
  ok: number;
  indisponibles: number;
  bloques: number;
  erreurs: number;
  retoursUtiles: number;
  retoursInexacts: number;
  /** Part des retours "inexact" parmi les retours donnes, null tant qu'aucun retour n'existe. */
  tauxInexact: number | null;
  pucesLues: number;
  pucesSupprimees: number;
  /** Part des puces supprimees par la validation, null si aucune puce n'a ete lue. */
  tauxPucesSupprimees: number | null;
  dureeMoyenneMs: number | null;
}

interface CompteParValeur {
  valeur: string | null;
  nombre: number;
}

/** Assemblage pur des indicateurs de suivi (F-IA-05), teste sans base. */
export function assemblerStatistiques(entree: {
  parStatut: CompteParValeur[];
  parRetour: CompteParValeur[];
  pucesLues: number;
  pucesSupprimees: number;
  dureeMoyenneMs: number | null;
}): StatistiquesIa {
  const compter = (liste: CompteParValeur[], valeur: string) => liste.find((ligne) => ligne.valeur === valeur)?.nombre ?? 0;
  const appels = entree.parStatut.reduce((total, ligne) => total + ligne.nombre, 0);
  const retoursUtiles = compter(entree.parRetour, "utile");
  const retoursInexacts = compter(entree.parRetour, "inexact");
  const retours = retoursUtiles + retoursInexacts;

  return {
    appels,
    ok: compter(entree.parStatut, "ok"),
    indisponibles: compter(entree.parStatut, "indisponible"),
    bloques: compter(entree.parStatut, "bloque"),
    erreurs: compter(entree.parStatut, "erreur"),
    retoursUtiles,
    retoursInexacts,
    tauxInexact: retours === 0 ? null : retoursInexacts / retours,
    pucesLues: entree.pucesLues,
    pucesSupprimees: entree.pucesSupprimees,
    tauxPucesSupprimees: entree.pucesLues === 0 ? null : entree.pucesSupprimees / entree.pucesLues,
    dureeMoyenneMs: entree.dureeMoyenneMs === null ? null : Math.round(entree.dureeMoyenneMs),
  };
}

/** Indicateurs agreges d'une fonctionnalite d'IA depuis une date (aucune donnee de patient). */
export async function statistiquesAppelsIa(fonctionnalite: string, depuis: Date): Promise<StatistiquesIa> {
  const where = { fonctionnalite, date: { gte: depuis } };
  const [parStatut, parRetour, somme] = await Promise.all([
    prisma.appelIa.groupBy({ by: ["statut"], where, _count: { _all: true } }),
    prisma.appelIa.groupBy({ by: ["retour"], where: { ...where, retour: { not: null } }, _count: { _all: true } }),
    prisma.appelIa.aggregate({ where, _sum: { pucesLues: true, pucesSupprimees: true }, _avg: { dureeMs: true } }),
  ]);

  return assemblerStatistiques({
    parStatut: parStatut.map((ligne) => ({ valeur: ligne.statut, nombre: ligne._count._all })),
    parRetour: parRetour.map((ligne) => ({ valeur: ligne.retour, nombre: ligne._count._all })),
    pucesLues: somme._sum.pucesLues ?? 0,
    pucesSupprimees: somme._sum.pucesSupprimees ?? 0,
    dureeMoyenneMs: somme._avg.dureeMs,
  });
}
