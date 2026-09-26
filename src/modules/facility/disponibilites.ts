"use server";

/**
 * F-ETA-05 du pack (chapitre 9, "Definir les agendas"). Perimetre reduit et
 * documente comme tel (voir docs/coordination-agents.md, point F-ETA-05, et
 * le commentaire du modele CreneauDisponibilite dans prisma/schema.prisma) :
 * disponibilite hebdomadaire recurrente par professionnel, geree par
 * l'admin_etablissement de son etablissement (role FACILITY_ADMIN du pack ;
 * pas de role RECEPTIONIST dans ce depot, pas de gestion directe par le
 * professionnel lui-meme, conformement au tableau de roles de la fiche).
 *
 * Hors perimetre, documente explicitement : duree de creneau et capacite
 * variables (capacite 1 fixe ici), generation physique de creneaux 60 jours
 * a l'avance (verifie a la volee a chaque creation de rendez-vous),
 * fermetures ponctuelles et jours feries (RG-ETA-42), chevauchement entre
 * plusieurs services (pas de modele Service dans ce depot).
 *
 * Zero Trust : l'admin_etablissement courant est toujours derive de
 * getSession(), et chaque action verifie explicitement que le professionnel
 * cible appartient bien a son etablissement avant de lire ou modifier quoi
 * que ce soit.
 */

import { headers } from "next/headers";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { journaliser } from "@/modules/audit/journaliser";

export interface DisponibiliteActionState {
  error: string | null;
  success: boolean;
}

export interface CreneauDisponibiliteResume {
  id: string;
  jourSemaine: number;
  heureDebut: string;
  heureFin: string;
}

const JOURS_SEMAINE_VALIDES = [0, 1, 2, 3, 4, 5, 6] as const;
const REGEX_HEURE = /^([01]\d|2[0-3]):[0-5]\d$/;

const schemaCreneau = z
  .object({
    professionnelId: z.string().trim().min(1, "Le professionnel est obligatoire."),
    jourSemaine: z.coerce
      .number()
      .int()
      .refine((valeur) => (JOURS_SEMAINE_VALIDES as readonly number[]).includes(valeur), "Jour de semaine invalide."),
    heureDebut: z.string().regex(REGEX_HEURE, "Heure de début invalide (format HH:MM)."),
    heureFin: z.string().regex(REGEX_HEURE, "Heure de fin invalide (format HH:MM)."),
  })
  .refine((donnees) => minutesDepuisHeure(donnees.heureFin) > minutesDepuisHeure(donnees.heureDebut), {
    message: "L'heure de fin doit être après l'heure de début.",
    path: ["heureFin"],
  });

function minutesDepuisHeure(heure: string): number {
  const [heures, minutes] = heure.split(":").map(Number);
  return heures * 60 + minutes;
}

function heureDepuisMinutes(minutes: number): string {
  const heures = Math.floor(minutes / 60);
  const reste = minutes % 60;
  return `${String(heures).padStart(2, "0")}:${String(reste).padStart(2, "0")}`;
}

function texte(formData: FormData, cle: string): string {
  const valeur = formData.get(cle);
  return typeof valeur === "string" ? valeur : "";
}

async function adresseTechniqueCourante(): Promise<string> {
  try {
    const listeEntetes = await headers();
    return listeEntetes.get("x-forwarded-for") ?? listeEntetes.get("x-real-ip") ?? "inconnue";
  } catch {
    return "inconnue";
  }
}

/** Verifie que l'admin_etablissement connecte gere bien ce professionnel (meme etablissement). Renvoie null sinon (Zero Trust). */
async function professionnelGereParAdminCourant(professionnelId: string) {
  const session = await getSession();
  if (!session || !session.roles.includes("admin_etablissement")) return null;

  const adminProfessionnel = await prisma.professionnelSante.findUnique({ where: { userId: session.userId } });
  if (!adminProfessionnel) return null;

  const professionnelCible = await prisma.professionnelSante.findUnique({ where: { id: professionnelId } });
  if (!professionnelCible || professionnelCible.etablissementId !== adminProfessionnel.etablissementId) return null;

  return professionnelCible;
}

/** Meme verification, a partir de l'userId du professionnel (pratique cote ecran, qui ne connait que MembrePersonnel.userId). */
export async function professionnelIdDepuisUserId(userId: string): Promise<string | null> {
  const session = await getSession();
  if (!session || !session.roles.includes("admin_etablissement")) return null;

  const adminProfessionnel = await prisma.professionnelSante.findUnique({ where: { userId: session.userId } });
  if (!adminProfessionnel) return null;

  const professionnelCible = await prisma.professionnelSante.findUnique({ where: { userId } });
  if (!professionnelCible || professionnelCible.etablissementId !== adminProfessionnel.etablissementId) return null;

  return professionnelCible.id;
}

export async function listerCreneauxProfessionnel(professionnelId: string): Promise<CreneauDisponibiliteResume[] | null> {
  const professionnel = await professionnelGereParAdminCourant(professionnelId);
  if (!professionnel) return null;

  const creneaux = await prisma.creneauDisponibilite.findMany({
    where: { professionnelId },
    orderBy: [{ jourSemaine: "asc" }, { heureDebutMinutes: "asc" }],
  });

  return creneaux.map((creneau) => ({
    id: creneau.id,
    jourSemaine: creneau.jourSemaine,
    heureDebut: heureDepuisMinutes(creneau.heureDebutMinutes),
    heureFin: heureDepuisMinutes(creneau.heureFinMinutes),
  }));
}

/**
 * Ajoute un creneau hebdomadaire. RG-ETA-40 (reduit a un seul professionnel,
 * pas de notion de service) : rejette tout chevauchement avec un creneau
 * deja defini le meme jour pour ce professionnel.
 */
export async function ajouterCreneauAction(
  prevState: DisponibiliteActionState,
  formData: FormData
): Promise<DisponibiliteActionState> {
  const validation = schemaCreneau.safeParse({
    professionnelId: texte(formData, "professionnelId"),
    jourSemaine: texte(formData, "jourSemaine"),
    heureDebut: texte(formData, "heureDebut"),
    heureFin: texte(formData, "heureFin"),
  });

  if (!validation.success) {
    return { error: validation.error.issues[0]?.message ?? "Données invalides.", success: false };
  }

  const professionnel = await professionnelGereParAdminCourant(validation.data.professionnelId);
  if (!professionnel) {
    return { error: "Vous ne gérez pas ce professionnel.", success: false };
  }

  const debut = minutesDepuisHeure(validation.data.heureDebut);
  const fin = minutesDepuisHeure(validation.data.heureFin);

  const creneauxExistants = await prisma.creneauDisponibilite.findMany({
    where: { professionnelId: validation.data.professionnelId, jourSemaine: validation.data.jourSemaine },
  });
  const chevauche = creneauxExistants.some(
    (creneau) => debut < creneau.heureFinMinutes && fin > creneau.heureDebutMinutes
  );
  if (chevauche) {
    return {
      error: "Ce créneau chevauche un créneau déjà défini ce jour-là pour ce professionnel (RG-ETA-40).",
      success: false,
    };
  }

  const session = await getSession();
  const creneau = await prisma.creneauDisponibilite.create({
    data: {
      professionnelId: validation.data.professionnelId,
      jourSemaine: validation.data.jourSemaine,
      heureDebutMinutes: debut,
      heureFinMinutes: fin,
    },
  });

  await journaliser({
    utilisateurId: session!.userId,
    action: "creation",
    donneeConcernee: `creneau_disponibilite:${creneau.id}`,
    adresseTechnique: await adresseTechniqueCourante(),
    justification: `Créneau ajouté (F-ETA-05) pour le professionnel ${validation.data.professionnelId} : jour ${validation.data.jourSemaine}, ${validation.data.heureDebut}-${validation.data.heureFin}.`,
  });

  return { error: null, success: true };
}

/**
 * Supprime un modele de creneau. RG-ETA-41 (reduit) : ce depot ne genere
 * aucun creneau physique a l'avance, donc rien a "regenerer" ; supprimer un
 * modele n'annule jamais un rendez-vous deja pris (les rendez-vous existants
 * ne referencent pas CreneauDisponibilite), seule la disponibilite future en
 * est affectee, conformement a l'esprit de la regle.
 */
export async function supprimerCreneauAction(
  prevState: DisponibiliteActionState,
  formData: FormData
): Promise<DisponibiliteActionState> {
  const session = await getSession();
  if (!session || !session.roles.includes("admin_etablissement")) {
    return { error: "Droits insuffisants.", success: false };
  }

  const creneauId = texte(formData, "creneauId");
  const creneau = await prisma.creneauDisponibilite.findUnique({ where: { id: creneauId } });
  if (!creneau) {
    return { error: "Créneau introuvable.", success: false };
  }

  const professionnel = await professionnelGereParAdminCourant(creneau.professionnelId);
  if (!professionnel) {
    return { error: "Vous ne gérez pas ce professionnel.", success: false };
  }

  await prisma.creneauDisponibilite.delete({ where: { id: creneauId } });

  await journaliser({
    utilisateurId: session.userId,
    action: "suppression",
    donneeConcernee: `creneau_disponibilite:${creneauId}`,
    adresseTechnique: await adresseTechniqueCourante(),
    justification: `Créneau supprimé (F-ETA-05) pour le professionnel ${creneau.professionnelId}.`,
  });

  return { error: null, success: true };
}

/**
 * Utilise par creerRendezVousAction (src/modules/facility/actions.ts) :
 * verifie qu'un instant UTC donne tombe dans un creneau defini pour ce
 * professionnel, en heure LOCALE Africa/Porto-Novo (RG-ETA-43, UTC+1 fixe,
 * sans heure d'ete : un simple decalage d'une heure suffit).
 *
 * Limite assumee (perimetre reduit F-ETA-05) : si ce professionnel n'a
 * ENCORE aucun creneau configure, renvoie true (comportement inchange par
 * rapport a avant cette fiche), pour ne pas bloquer retroactivement la prise
 * de rendez-vous aupres de tous les professionnels deja existants qui n'ont
 * jamais defini d'agenda. Des qu'un professionnel definit au moins un
 * creneau, seules les heures qu'il a explicitement ouvertes deviennent
 * reservables pour lui.
 */
export async function dateDansUnCreneauDisponible(professionnelId: string, dateUtc: Date): Promise<boolean> {
  const creneaux = await prisma.creneauDisponibilite.findMany({ where: { professionnelId } });
  if (creneaux.length === 0) {
    return true;
  }

  const dateLocale = new Date(dateUtc.getTime() + 60 * 60 * 1000);
  const jourSemaineLocal = dateLocale.getUTCDay();
  const minutesLocal = dateLocale.getUTCHours() * 60 + dateLocale.getUTCMinutes();

  return creneaux.some(
    (creneau) =>
      creneau.jourSemaine === jourSemaineLocal &&
      minutesLocal >= creneau.heureDebutMinutes &&
      minutesLocal < creneau.heureFinMinutes
  );
}
