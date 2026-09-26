import { Prisma, type PrismaClient } from "@prisma/client";

type ClientPrisma = PrismaClient | Prisma.TransactionClient;

/**
 * File de taches de F-PIL-07 (point 1 du pack, chapitre 14) : chaque
 * evenement metier pertinent publie une tache, consommee par la tache
 * horaire de recalcul (src/modules/pilotage/agregation.ts). Persistee en
 * base (table TachePilotage, schema public) plutot qu'en memoire, pour ne
 * perdre aucun evenement si le serveur redemarre entre deux passages de la
 * tache horaire.
 */

export type TypeEvenementPilotage =
  | "consultation_validee"
  | "consultation_retiree"
  | "rendez_vous_change"
  | "prescription_signee"
  | "delivrance"
  | "vaccination"
  | "compte_cree";

export interface EvenementPilotage {
  type: TypeEvenementPilotage;
  /** Jour concerne par l'evenement (ex. date de la consultation), pas la date de publication. */
  date: Date;
  /** Null si l'evenement ne porte pas de dimension etablissement (ex. compte citoyen cree). */
  etablissementId?: string | null;
}

export async function publierEvenementPilotage(client: ClientPrisma, evenement: EvenementPilotage): Promise<void> {
  await client.tachePilotage.create({
    data: {
      type: evenement.type,
      date: evenement.date,
      etablissementId: evenement.etablissementId ?? null,
    },
  });
}

export interface JourEtablissementATraiter {
  date: Date;
  etablissementId: string | null;
}

/**
 * Regroupe les taches non traitees par couple (jour, etablissement) : c'est
 * ce couple, pas la tache individuelle, que le moteur de recalcul traite
 * (RG-PIL-60, "recalcul par jour et par etablissement, pas incremental").
 */
export async function listerJoursEtablissementsATraiter(prisma: PrismaClient): Promise<JourEtablissementATraiter[]> {
  const taches = await prisma.tachePilotage.findMany({
    where: { traitee: false },
    select: { date: true, etablissementId: true },
  });

  const cles = new Map<string, JourEtablissementATraiter>();
  for (const tache of taches) {
    const jour = new Date(Date.UTC(tache.date.getUTCFullYear(), tache.date.getUTCMonth(), tache.date.getUTCDate()));
    const cle = `${jour.toISOString()}|${tache.etablissementId ?? ""}`;
    if (!cles.has(cle)) {
      cles.set(cle, { date: jour, etablissementId: tache.etablissementId });
    }
  }
  return Array.from(cles.values());
}

/** Marque comme traitees toutes les taches non traitees existant au moment de l'appel (evite de marquer des taches publiees pendant le recalcul lui-meme). */
export async function marquerTachesTraitees(prisma: PrismaClient, avant: Date): Promise<void> {
  await prisma.tachePilotage.updateMany({
    where: { traitee: false, dateCreation: { lte: avant } },
    data: { traitee: true, dateTraitement: new Date() },
  });
}
