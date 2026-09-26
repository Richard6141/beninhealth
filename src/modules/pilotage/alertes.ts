"use server";

/**
 * Server Actions du module pilotage : alertes epidemiologiques simples
 * (F-PIL-06 du pack). Nouveau fichier autonome, aucun fichier existant de ce
 * module modifie (proprietaire d'une autre session ce soir, voir
 * docs/coordination-agents.md).
 *
 * Version reduite et volontaire : detection a la demande (au chargement de
 * l'ecran admin), pas une tache planifiee horaire, meme choix que F-AUD-03
 * ce soir pour la meme raison (ne pas dependre du planificateur de F-PIL-07,
 * src/modules/pilotage/planificateur.ts). Lit uniquement AgregatQuotidien
 * (IND-03, deja calcule), aucune lecture directe de Consultation : respecte
 * RG-PIL-01 (jamais de donnee nominative dans les agregats de pilotage).
 *
 * Regle de detection du pack (fiche F-PIL-06) : pour chaque zone sanitaire
 * et chaque groupe de maladies surveille (paludisme, diarrhees, rougeole,
 * meningite, fievres hemorragiques suspectes), une alerte est levee si le
 * nombre de cas de la semaine ecoulee depasse la moyenne des 8 semaines
 * precedentes + 2 ecarts-types, avec un minimum de 10 cas ; pour les
 * maladies a declaration immediate (liste parametrable), 1 cas suffit.
 *
 * Limite assumee : la liste "declaration immediate" n'est pas fournie par
 * le pack au-dela de "liste parametrable" ; DECLARATION_IMMEDIATE ci-dessous
 * reprend les 3 groupes surveilles a caractere epidemique aigu (rougeole,
 * meningite, fievre hemorragique), en excluant paludisme et diarrhee
 * (endemiques, deja couverts par la regle statistique). A ajuster si le
 * ministere fournit une vraie liste. Avec un historique de demonstration de
 * moins de 8 semaines, la moyenne et l'ecart-type se calculent sur les
 * semaines reellement disponibles (jamais simules) : le seuil se ramene
 * alors naturellement au minimum de 10 cas, un comportement honnete plutot
 * qu'un calcul statistique trompeusement precis sur des donnees insuffisantes.
 */

import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { can } from "@/security/permissions";
import { GROUPES_MALADIES } from "./referentiel-groupes-maladies";
import { z } from "zod";

const GROUPES_SURVEILLES = ["paludisme", "diarrhee", "rougeole", "meningite", "fievre_hemorragique"];
const DECLARATION_IMMEDIATE = new Set(["rougeole", "meningite", "fievre_hemorragique"]);
const NB_SEMAINES_HISTORIQUE = 8;
const MINIMUM_CAS = 10;
const MINIMUM_CAS_DECLARATION_IMMEDIATE = 1;

function ecartType(valeurs: number[], moyenne: number): number {
  if (valeurs.length === 0) return 0;
  const varianceTotale = valeurs.reduce((acc, v) => acc + (v - moyenne) ** 2, 0);
  return Math.sqrt(varianceTotale / valeurs.length);
}

function semaineISO(date: Date): string {
  const copie = new Date(date.getTime());
  copie.setHours(0, 0, 0, 0);
  // Jeudi de la semaine ISO courante (algorithme standard semaine ISO 8601).
  copie.setDate(copie.getDate() + 3 - ((copie.getDay() + 6) % 7));
  const anneeISO = copie.getFullYear();
  const premierJeudi = new Date(anneeISO, 0, 4);
  const numeroSemaine =
    1 + Math.round(((copie.getTime() - premierJeudi.getTime()) / 86400000 - 3 + ((premierJeudi.getDay() + 6) % 7)) / 7);
  return `${anneeISO}-W${String(numeroSemaine).padStart(2, "0")}`;
}

function bornesSemaineCourante(): { debut: Date; fin: Date } {
  const maintenant = new Date();
  const jourSemaine = (maintenant.getDay() + 6) % 7; // 0 = lundi
  const debut = new Date(maintenant);
  debut.setHours(0, 0, 0, 0);
  debut.setDate(debut.getDate() - jourSemaine);
  const fin = new Date(debut);
  fin.setDate(fin.getDate() + 7);
  return { debut, fin };
}

/**
 * Detecte les groupes de maladies surveilles dont le nombre de cas de la
 * semaine en cours, par zone sanitaire, depasse le seuil (moyenne des 8
 * semaines precedentes + 2 ecarts-types, minimum 10 cas, ou 1 cas pour les
 * maladies a declaration immediate), et cree une HealthAlertReview pour
 * chaque combinaison (zoneSanitaireId, groupeMaladies, semaine) pas encore
 * signalee (contrainte unique du schema : jamais de doublon pour la meme
 * semaine).
 */
async function executerDetection(): Promise<void> {
  const { debut: debutSemaineCourante, fin: finSemaineCourante } = bornesSemaineCourante();
  const semaineCourante = semaineISO(new Date());
  const debutHistorique = new Date(debutSemaineCourante);
  debutHistorique.setDate(debutHistorique.getDate() - NB_SEMAINES_HISTORIQUE * 7);

  try {
    const lignes = await prisma.agregatQuotidien.findMany({
      where: {
        indicateur: "IND-03",
        date: { gte: debutHistorique, lt: finSemaineCourante },
        zoneSanitaireId: { not: null },
        dimensionLibre: { in: GROUPES_SURVEILLES },
      },
      select: { date: true, zoneSanitaireId: true, dimensionLibre: true, valeur: true },
    });

    // casParZoneEtGroupeEtSemaine["zone|groupe"]["AAAA-Wss"] = total de cas
    // de cette semaine-la, pour cette zone et ce groupe.
    const casParZoneEtGroupeEtSemaine = new Map<string, Map<string, number>>();
    for (const ligne of lignes) {
      const cleZoneGroupe = `${ligne.zoneSanitaireId}|${ligne.dimensionLibre}`;
      const semaineLigne = semaineISO(ligne.date);
      const parSemaine = casParZoneEtGroupeEtSemaine.get(cleZoneGroupe) ?? new Map<string, number>();
      parSemaine.set(semaineLigne, (parSemaine.get(semaineLigne) ?? 0) + ligne.valeur);
      casParZoneEtGroupeEtSemaine.set(cleZoneGroupe, parSemaine);
    }

    for (const [cleZoneGroupe, parSemaine] of casParZoneEtGroupeEtSemaine) {
      const casSemaineCourante = parSemaine.get(semaineCourante) ?? 0;
      if (casSemaineCourante === 0) continue;

      const [zoneSanitaireId, groupeMaladies] = cleZoneGroupe.split("|");

      const casHistorique = [...parSemaine.entries()]
        .filter(([semaine]) => semaine !== semaineCourante)
        .map(([, cas]) => cas);
      const moyenneHistorique = casHistorique.length > 0 ? casHistorique.reduce((a, b) => a + b, 0) / casHistorique.length : 0;
      const seuilStatistique = moyenneHistorique + 2 * ecartType(casHistorique, moyenneHistorique);

      const seuil = DECLARATION_IMMEDIATE.has(groupeMaladies)
        ? MINIMUM_CAS_DECLARATION_IMMEDIATE
        : Math.max(MINIMUM_CAS, seuilStatistique);

      if (casSemaineCourante < seuil) continue;

      const existante = await prisma.healthAlertReview.findUnique({
        where: {
          zoneSanitaireId_groupeMaladies_semaine: { zoneSanitaireId, groupeMaladies, semaine: semaineCourante },
        },
      });

      if (existante) continue;

      await prisma.healthAlertReview.create({
        data: {
          zoneSanitaireId,
          groupeMaladies,
          semaine: semaineCourante,
          casObserves: casSemaineCourante,
          seuilCalcule: seuil,
        },
      });
    }
  } catch (erreur) {
    console.error("Erreur lors de la detection d'alertes epidemiologiques :", erreur);
  }
}

const LIBELLES_GROUPE = new Map(GROUPES_MALADIES.map((g) => [g.code, g.libelle]));

/** Une alerte epidemiologique (F-PIL-06), traitee ou non. */
export interface AlerteEpidemiologique {
  id: string;
  zoneSanitaireNom: string;
  groupeMaladiesLibelle: string;
  semaine: string;
  casObserves: number;
  seuilCalcule: number;
  statut: "nouvelle" | "vue" | "fermee";
  commentaire: string | null;
  motifFermeture: string | null;
  reviewerNomComplet: string | null;
  dateCreation: string; // ISO
  dateRevue: string | null;
}

function nomComplet(utilisateur: { nom: string; prenom: string }): string {
  return `${utilisateur.prenom} ${utilisateur.nom}`;
}

/**
 * Lance la detection puis renvoie toutes les alertes (nouvelles, vues et
 * fermees), les plus recentes en premier. Reserve a admin_national (meme
 * role que les autres ecrans du chapitre 14, RG-PIL-20).
 */
export async function getAlertesEpidemiologiques(): Promise<AlerteEpidemiologique[] | null> {
  const session = await getSession();

  if (!session) {
    return null;
  }

  const role = session.roles.find((r) => can(r, "read", "analytics"));

  if (!role) {
    return null;
  }

  await executerDetection();

  const alertes = await prisma.healthAlertReview.findMany({
    include: { reviewer: true },
    orderBy: [{ dateCreation: "desc" }],
  });

  const zoneIds = [...new Set(alertes.map((a) => a.zoneSanitaireId))];
  const zones = await prisma.zoneSanitaire.findMany({ where: { id: { in: zoneIds } } });
  const nomZone = new Map(zones.map((z) => [z.id, z.nom]));

  return alertes.map((alerte) => ({
    id: alerte.id,
    zoneSanitaireNom: nomZone.get(alerte.zoneSanitaireId) ?? alerte.zoneSanitaireId,
    groupeMaladiesLibelle: LIBELLES_GROUPE.get(alerte.groupeMaladies) ?? alerte.groupeMaladies,
    semaine: alerte.semaine,
    casObserves: alerte.casObserves,
    seuilCalcule: alerte.seuilCalcule,
    statut: alerte.statut as "nouvelle" | "vue" | "fermee",
    commentaire: alerte.commentaire,
    motifFermeture: alerte.motifFermeture,
    reviewerNomComplet: alerte.reviewer ? nomComplet(alerte.reviewer) : null,
    dateCreation: alerte.dateCreation.toISOString(),
    dateRevue: alerte.dateRevue?.toISOString() ?? null,
  }));
}

export interface RevueAlerteActionState {
  error: string | null;
  success: boolean;
}

const schemaRevue = z.object({
  alerteId: z.string().trim().min(1, "L'alerte est obligatoire."),
  decision: z.enum(["vue", "fermee"], { message: "Decision invalide." }),
  commentaire: z.string().trim().optional().default(""),
});

function texte(formData: FormData, cle: string): string {
  const valeur = formData.get(cle);
  return typeof valeur === "string" ? valeur : "";
}

function premierMessageErreur(erreur: z.ZodError, messageParDefaut: string): string {
  return erreur.issues[0]?.message ?? messageParDefaut;
}

/**
 * Marque une alerte comme vue (simple accuse de lecture, pas de commentaire
 * exige) ou la ferme (commentaire obligatoire : motif de fermeture, RG-PIL-50
 * "un signal a verifier, jamais une communication automatique").
 */
export async function revueAlerteAction(
  prevState: RevueAlerteActionState,
  formData: FormData
): Promise<RevueAlerteActionState> {
  const session = await getSession();

  if (!session) {
    return { error: "Session expiree. Veuillez vous reconnecter.", success: false };
  }

  if (!session.roles.some((role) => can(role, "read", "analytics"))) {
    return { error: "Action reservee aux administrateurs.", success: false };
  }

  const validation = schemaRevue.safeParse({
    alerteId: texte(formData, "alerteId"),
    decision: texte(formData, "decision"),
    commentaire: texte(formData, "commentaire"),
  });

  if (!validation.success) {
    return {
      error: premierMessageErreur(validation.error, "Donnees invalides."),
      success: false,
    };
  }

  const { alerteId, decision, commentaire } = validation.data;

  if (decision === "fermee" && commentaire.trim().length < 10) {
    return { error: "Un motif de fermeture d'au moins 10 caracteres est obligatoire.", success: false };
  }

  try {
    const alerte = await prisma.healthAlertReview.findUnique({ where: { id: alerteId } });

    if (!alerte) {
      return { error: "Alerte introuvable.", success: false };
    }

    if (alerte.statut === "fermee") {
      return { error: "Cette alerte est deja fermee.", success: false };
    }

    await prisma.healthAlertReview.update({
      where: { id: alerteId },
      data: {
        statut: decision,
        reviewerId: session.userId,
        dateRevue: new Date(),
        ...(decision === "fermee" ? { motifFermeture: commentaire } : { commentaire: commentaire || null }),
      },
    });

    return { error: null, success: true };
  } catch (erreur) {
    console.error("Erreur lors de la revue de l'alerte :", erreur);
    return {
      error: "Une erreur est survenue lors de l'enregistrement. Veuillez reessayer.",
      success: false,
    };
  }
}
