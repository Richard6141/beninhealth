"use server";

/**
 * Server Actions du module audit : recherche dans le journal d'audit
 * (F-AUD-01 du pack), revue des acces d'urgence (F-AUD-02) et verification
 * d'integrite du chainage (RG-AUD-02), les seuls points de lecture
 * transversale de `JournalAudit` dans ce depot (partout ailleurs,
 * JournalAudit n'est qu'ecrit, jamais relu a l'echelle de la plateforme,
 * voir docs/audit-cote-administration.md).
 *
 * Adaptation au modele de roles de ce depot : le pack reserve F-AUD-01 au
 * role `AUDITOR`, qui n'existe pas ici. Ce module l'ouvre a `admin_national`
 * (equivalent le plus proche : visibilite plateforme) et `admin_etablissement`
 * (scope volontairement restreint aux actions dont l'ACTEUR appartient a son
 * propre etablissement, jamais la plateforme entiere). verifierIntegriteJournal
 * (RG-AUD-02) est reservee au seul admin_national : la chaine est unique et
 * globale a toute la plateforme (un `numeroSequence` partage par tous les
 * etablissements), la scoper par etablissement n'aurait pas de sens.
 *
 * Exception documentee au principe "jamais de donnee nominative" du module
 * analytics (src/modules/analytics/actions.ts) : un journal d'audit est par
 * nature nominatif (qui a fait quoi, sur quel patient). C'est justement pour
 * ca que l'acces est restreint a ces deux roles, pas une fuite du principe
 * analytics.
 *
 * RG-AUD-01 : la consultation du journal par l'administrateur est elle-meme
 * journalisee (voir la fin de rechercherJournalAudit et de
 * verifierIntegriteJournal).
 *
 * RG-AUD-02 : chainage cryptographique verifiant l'integrite du journal.
 * L'empreinte (SHA-256 de l'empreinte precedente + les champs immuables de
 * la ligne) est calculee par un trigger Postgres a l'insertion (voir la
 * migration ajout_chainage_journal_audit), jamais par le code applicatif :
 * ainsi toute ecriture est chainee, quel que soit son chemin (les ~15
 * fichiers qui appellent journaliser(), ou meme un INSERT SQL direct qui
 * contournerait ce helper). verifierIntegriteJournal recalcule cette meme
 * formule cote application (Node crypto) pour verifier, sur une periode,
 * que chaque empreinte stockee correspond bien a ce que le contenu de la
 * ligne et l'empreinte reelle de la precedente impliquent. Limite assumee :
 * ce controle detecte une modification ou une suppression accidentelle
 * d'une ligne, pas une attaque ou un acces complet en ecriture recalculerait
 * une chaine alternative globalement coherente ; aucun controle applicatif
 * ne peut se premunir contre un attaquant disposant d'un acces total et
 * durable a la base, c'est une limite inherente a tout chainage de ce type
 * sans ancrage externe.
 */

import { headers } from "next/headers";
import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { can } from "@/security/permissions";
import { creerNotification } from "@/modules/notification/creer";
import { journaliser } from "./journaliser";
import type { NomRole } from "@/types";

const TAILLE_PAGE = 50;
const NOMBRE_JOURS_MAX = 31;

export interface FiltresJournalAudit {
  dateDebut: string; // ISO yyyy-mm-dd, obligatoire (RG-AUD : periode obligatoire)
  dateFin: string; // ISO yyyy-mm-dd, obligatoire
  acteur?: string; // recherche sur nom/prenom/email de l'acteur
  patientIdentifiantSante?: string;
  action?: string;
  etablissementId?: string; // ignore pour admin_etablissement (deja contraint au sien)
  page?: number;
}

export interface EntreeJournalAudit {
  id: string;
  date: string; // ISO
  acteurNomComplet: string;
  acteurRole: NomRole | null;
  etablissementNom: string | null;
  action: string;
  donneeConcernee: string;
  adresseTechnique: string;
  justification: string;
}

export interface ResultatJournalAudit {
  entrees: EntreeJournalAudit[];
  total: number;
  page: number;
  nombreDePages: number;
  actionsDisponibles: string[];
  etablissementsDisponibles: { id: string; nom: string }[]; // vide pour admin_etablissement
  etablissementImpose: string | null; // nom de l'etablissement de l'admin_etablissement connecte
}

async function adresseTechniqueCourante(): Promise<string> {
  try {
    const listeEntetes = await headers();
    const adresse = listeEntetes.get("x-forwarded-for") ?? listeEntetes.get("x-real-ip") ?? null;
    return adresse ?? "inconnue";
  } catch {
    return "inconnue";
  }
}

function nomCompletActeur(utilisateur: { nom: string; prenom: string }): string {
  return `${utilisateur.prenom} ${utilisateur.nom}`;
}

function differenceEnJours(debut: Date, fin: Date): number {
  return Math.ceil((fin.getTime() - debut.getTime()) / (24 * 60 * 60 * 1000));
}

/**
 * Liste des cles `donneeConcernee` couvrant toutes les ressources d'un
 * patient (meme principe que getMesAccesDossier dans
 * src/modules/patient/actions.ts, generalise a tous les types de ressources
 * existant aujourd'hui dans ce depot). Partagee par F-AUD-01 (filtre patient)
 * et F-AUD-02 (elements consultes pendant un acces d'urgence).
 */
async function clesDonneeConcerneePourPatientId(patientId: string): Promise<string[]> {
  const [consultations, prescriptions, examens, suivis, vaccinations, documents, prisesEnCharge] =
    await Promise.all([
      prisma.consultation.findMany({ where: { patientId }, select: { id: true } }),
      prisma.prescription.findMany({ where: { patientId }, select: { id: true } }),
      prisma.examenMedical.findMany({ where: { patientId }, select: { id: true } }),
      prisma.suiviCommunautaire.findMany({ where: { patientId }, select: { id: true } }),
      prisma.vaccination.findMany({ where: { patientId }, select: { id: true } }),
      prisma.documentMedical.findMany({ where: { patientId }, select: { id: true } }),
      prisma.priseEnChargeInfirmiere.findMany({ where: { patientId }, select: { id: true } }),
    ]);

  return [
    `patient:${patientId}`,
    ...consultations.map((c) => `consultation:${c.id}`),
    ...prescriptions.map((p) => `prescription:${p.id}`),
    ...examens.map((e) => `examen_medical:${e.id}`),
    ...suivis.map((s) => `suivi_communautaire:${s.id}`),
    ...vaccinations.map((v) => `vaccination:${v.id}`),
    ...documents.map((d) => `document_medical:${d.id}`),
    ...prisesEnCharge.map((p) => `prise_en_charge_infirmiere:${p.id}`),
  ];
}

/** Resout un identifiant sante en la liste des cles `donneeConcernee` pertinentes pour ce patient. */
async function clesDonneeConcerneePourPatient(identifiantSante: string): Promise<string[] | null> {
  const patient = await prisma.patient.findUnique({ where: { identifiantSante } });

  if (!patient) {
    return null;
  }

  return clesDonneeConcerneePourPatientId(patient.id);
}

/**
 * F-AUD-01 : recherche dans le journal d'audit. Retourne null si la session
 * est absente ou si le role connecte n'a pas read:journal_audit (Zero
 * Trust : jamais une liste partielle silencieuse).
 */
export async function rechercherJournalAudit(
  filtres: FiltresJournalAudit
): Promise<ResultatJournalAudit | null> {
  const session = await getSession();

  if (!session) {
    return null;
  }

  const role = session.roles.find((r) => can(r, "read", "journal_audit"));

  if (!role) {
    return null;
  }

  const dateDebut = new Date(`${filtres.dateDebut}T00:00:00.000Z`);
  const dateFin = new Date(`${filtres.dateFin}T23:59:59.999Z`);

  if (Number.isNaN(dateDebut.getTime()) || Number.isNaN(dateFin.getTime()) || dateFin < dateDebut) {
    return null;
  }

  if (differenceEnJours(dateDebut, dateFin) > NOMBRE_JOURS_MAX) {
    return null;
  }

  let etablissementImpose: { id: string; nom: string } | null = null;

  if (role === "admin_etablissement") {
    const admin = await prisma.professionnelSante.findUnique({
      where: { userId: session.userId },
      include: { etablissement: true },
    });

    if (!admin) {
      return null;
    }

    etablissementImpose = { id: admin.etablissementId, nom: admin.etablissement.nom };
  }

  const etablissementCible = role === "admin_etablissement" ? etablissementImpose!.id : filtres.etablissementId;

  const utilisateurWhere: Record<string, unknown> = {};

  if (etablissementCible) {
    utilisateurWhere.professionnel = { etablissementId: etablissementCible };
  }

  if (filtres.acteur && filtres.acteur.trim().length > 0) {
    const terme = filtres.acteur.trim();
    utilisateurWhere.OR = [
      { nom: { contains: terme } },
      { prenom: { contains: terme } },
      { email: { contains: terme } },
    ];
  }

  const where: Record<string, unknown> = {
    date: { gte: dateDebut, lte: dateFin },
  };

  if (Object.keys(utilisateurWhere).length > 0) {
    where.utilisateur = utilisateurWhere;
  }

  if (filtres.action && filtres.action.trim().length > 0) {
    where.action = filtres.action.trim();
  }

  if (filtres.patientIdentifiantSante && filtres.patientIdentifiantSante.trim().length > 0) {
    const cles = await clesDonneeConcerneePourPatient(filtres.patientIdentifiantSante.trim());

    if (cles === null) {
      return {
        entrees: [],
        total: 0,
        page: 1,
        nombreDePages: 1,
        actionsDisponibles: [],
        etablissementsDisponibles: [],
        etablissementImpose: etablissementImpose?.nom ?? null,
      };
    }

    where.donneeConcernee = { in: cles };
  }

  const [total, actionsDistinctes, etablissements] = await Promise.all([
    prisma.journalAudit.count({ where }),
    prisma.journalAudit.findMany({ where, select: { action: true }, distinct: ["action"] }),
    role === "admin_national"
      ? prisma.etablissementSanitaire.findMany({ select: { id: true, nom: true }, orderBy: { nom: "asc" } })
      : Promise.resolve([]),
  ]);

  const nombreDePages = Math.max(1, Math.ceil(total / TAILLE_PAGE));
  const page = Math.min(Math.max(1, filtres.page ?? 1), nombreDePages);

  const entrees = await prisma.journalAudit.findMany({
    where,
    include: {
      utilisateur: { include: { roles: true, professionnel: { include: { etablissement: true } } } },
    },
    orderBy: { date: "desc" },
    skip: (page - 1) * TAILLE_PAGE,
    take: TAILLE_PAGE,
  });

  const adresseTechnique = await adresseTechniqueCourante();

  // RG-AUD-01 : la consultation du journal par l'administrateur est elle-meme tracee.
  await journaliser({
    utilisateurId: session.userId,
    action: "consultation_journal_audit",
    donneeConcernee: `periode:${filtres.dateDebut}_${filtres.dateFin}`,
    adresseTechnique,
    justification: `Recherche journal d'audit (action=${filtres.action ?? "toutes"}, patient=${filtres.patientIdentifiantSante ?? "tous"})`,
  });

  return {
    entrees: entrees.map((entree) => ({
      id: entree.id,
      date: entree.date.toISOString(),
      acteurNomComplet: nomCompletActeur(entree.utilisateur),
      acteurRole: (entree.utilisateur.roles[0]?.nom as NomRole | undefined) ?? null,
      etablissementNom: entree.utilisateur.professionnel?.etablissement.nom ?? null,
      action: entree.action,
      donneeConcernee: entree.donneeConcernee,
      adresseTechnique: entree.adresseTechnique,
      justification: entree.justification,
    })),
    total,
    page,
    nombreDePages,
    actionsDisponibles: actionsDistinctes.map((a) => a.action).sort(),
    etablissementsDisponibles: etablissements,
    etablissementImpose: etablissementImpose?.nom ?? null,
  };
}

const DUREE_ACCES_URGENCE_MS = 4 * 60 * 60 * 1000;
const SEUIL_ANCIENNETE_JOURS = 7;

/** Un element consulte pendant un acces d'urgence (type et date, jamais le contenu, voir F-AUD-02). */
export interface ElementConsulteAccesUrgence {
  type: string;
  date: string;
}

export interface AccesUrgenceARevoir {
  journalAuditId: string;
  date: string; // ISO
  professionnelNomComplet: string;
  professionnelRole: NomRole | null;
  etablissementNom: string | null;
  patientNomComplet: string;
  patientIdentifiantSante: string;
  motifEtJustification: string;
  dureeEnHeures: number;
  elementsConsultes: ElementConsulteAccesUrgence[];
  consultationCreeePendantAcces: boolean;
  ancienEnJours: number;
  urgent: boolean; // plus de 7 jours sans revue (RG-AUD, affichage en rouge)
}

/**
 * F-AUD-02 : liste des acces d'urgence "bris de glace" (src/modules/urgence/actions.ts)
 * pas encore revus, le plus ancien en premier. Meme adaptation de role que
 * F-AUD-01 (admin_national global, admin_etablissement scope a son
 * etablissement). Retourne null si la session est absente ou sans le role
 * requis.
 */
export async function getAccesUrgenceARevoir(): Promise<AccesUrgenceARevoir[] | null> {
  const session = await getSession();

  if (!session) {
    return null;
  }

  const role = session.roles.find((r) => can(r, "create", "revue_acces_urgence"));

  if (!role) {
    return null;
  }

  let etablissementIdContrainte: string | null = null;

  if (role === "admin_etablissement") {
    const admin = await prisma.professionnelSante.findUnique({ where: { userId: session.userId } });

    if (!admin) {
      return null;
    }

    etablissementIdContrainte = admin.etablissementId;
  }

  const entrees = await prisma.journalAudit.findMany({
    where: {
      action: "acces_urgence",
      revue: null,
      ...(etablissementIdContrainte
        ? { utilisateur: { professionnel: { etablissementId: etablissementIdContrainte } } }
        : {}),
    },
    include: {
      utilisateur: { include: { roles: true, professionnel: { include: { etablissement: true } } } },
    },
    orderBy: { date: "asc" },
  });

  const maintenant = new Date();

  const resultats = await Promise.all(
    entrees.map(async (entree): Promise<AccesUrgenceARevoir | null> => {
      const patientId = entree.donneeConcernee.startsWith("patient:")
        ? entree.donneeConcernee.slice("patient:".length)
        : null;

      if (!patientId) {
        return null;
      }

      const patient = await prisma.patient.findUnique({ where: { id: patientId }, include: { user: true } });

      if (!patient) {
        return null;
      }

      const finFenetre = new Date(entree.date.getTime() + DUREE_ACCES_URGENCE_MS);
      const clesPatient = new Set(await clesDonneeConcerneePourPatientId(patientId));

      const activitePendantAcces = await prisma.journalAudit.findMany({
        where: {
          id: { not: entree.id },
          utilisateurId: entree.utilisateurId,
          date: { gte: entree.date, lte: finFenetre },
        },
        select: { action: true, donneeConcernee: true, date: true },
        orderBy: { date: "asc" },
      });

      const elementsConsultes = activitePendantAcces
        .filter((a) => clesPatient.has(a.donneeConcernee))
        .map((a) => ({ type: a.donneeConcernee.split(":")[0] ?? a.action, date: a.date.toISOString() }));

      const consultationCreeePendantAcces = activitePendantAcces.some(
        (a) =>
          a.donneeConcernee.startsWith("consultation:") &&
          (a.action === "creation_brouillon" || a.action === "validation_consultation")
      );

      return {
        journalAuditId: entree.id,
        date: entree.date.toISOString(),
        professionnelNomComplet: nomCompletActeur(entree.utilisateur),
        professionnelRole: (entree.utilisateur.roles[0]?.nom as NomRole | undefined) ?? null,
        etablissementNom: entree.utilisateur.professionnel?.etablissement.nom ?? null,
        patientNomComplet: nomCompletActeur(patient.user),
        patientIdentifiantSante: patient.identifiantSante,
        motifEtJustification: entree.justification,
        dureeEnHeures: DUREE_ACCES_URGENCE_MS / (60 * 60 * 1000),
        elementsConsultes,
        consultationCreeePendantAcces,
        ancienEnJours: differenceEnJours(entree.date, maintenant),
        urgent: differenceEnJours(entree.date, maintenant) > SEUIL_ANCIENNETE_JOURS,
      };
    })
  );

  return resultats.filter((r): r is AccesUrgenceARevoir => r !== null);
}

export interface RevueAccesUrgenceActionState {
  error: string | null;
  success: boolean;
}

/**
 * F-AUD-02 : enregistre la decision d'un administrateur sur un acces
 * d'urgence ("Conforme" ou "Non conforme", commentaire obligatoire dans les
 * deux cas). Une decision "Non conforme" notifie le responsable de
 * l'etablissement du professionnel concerne, et le professionnel lui-meme.
 * RevueAccesUrgence.journalAuditId est unique : une deuxieme tentative de
 * revue du meme acces est refusee plutot que d'ecraser la premiere decision.
 */
export async function enregistrerRevueAccesUrgenceAction(
  prevState: RevueAccesUrgenceActionState,
  formData: FormData
): Promise<RevueAccesUrgenceActionState> {
  const session = await getSession();

  if (!session) {
    return { error: "Session expiree. Veuillez vous reconnecter.", success: false };
  }

  const role = session.roles.find((r) => can(r, "create", "revue_acces_urgence"));

  if (!role) {
    return { error: "Vous n'etes pas autorise a revoir un acces d'urgence.", success: false };
  }

  const journalAuditId = String(formData.get("journalAuditId") ?? "").trim();
  const decision = String(formData.get("decision") ?? "").trim();
  const commentaire = String(formData.get("commentaire") ?? "").trim();

  if (journalAuditId.length === 0) {
    return { error: "Acces introuvable.", success: false };
  }

  if (decision !== "conforme" && decision !== "non_conforme") {
    return { error: "Decision invalide.", success: false };
  }

  if (commentaire.length < 10) {
    return { error: "Un commentaire d'au moins 10 caracteres est obligatoire.", success: false };
  }

  const entree = await prisma.journalAudit.findUnique({
    where: { id: journalAuditId },
    include: { utilisateur: { include: { professionnel: true } }, revue: true },
  });

  if (!entree || entree.action !== "acces_urgence") {
    return { error: "Acces introuvable.", success: false };
  }

  if (entree.revue) {
    return { error: "Cet acces a deja ete revu.", success: false };
  }

  if (role === "admin_etablissement") {
    const admin = await prisma.professionnelSante.findUnique({ where: { userId: session.userId } });

    if (!admin || entree.utilisateur.professionnel?.etablissementId !== admin.etablissementId) {
      return { error: "Cet acces ne concerne pas votre etablissement.", success: false };
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.revueAccesUrgence.create({
      data: {
        journalAuditId,
        reviewerId: session.userId,
        decision,
        commentaire,
      },
    });

    await journaliser(
      {
        utilisateurId: session.userId,
        action: "revue_acces_urgence",
        donneeConcernee: `journal_audit:${journalAuditId}`,
        adresseTechnique: await adresseTechniqueCourante(),
        justification: `Decision : ${decision}. ${commentaire}`,
      },
      tx
    );
  });

  if (decision === "non_conforme") {
    const patientId = entree.donneeConcernee.startsWith("patient:")
      ? entree.donneeConcernee.slice("patient:".length)
      : null;

    await creerNotification(
      entree.utilisateurId,
      "revue_acces_urgence_non_conforme",
      "Un accès d'urgence que vous avez déclenché a été revu et jugé non conforme par un administrateur.",
      undefined,
      { codeCatalogue: "N-EMERGENCY-NONCOMPLIANT" }
    );

    if (entree.utilisateur.professionnel) {
      const responsables = await prisma.professionnelSante.findMany({
        where: {
          etablissementId: entree.utilisateur.professionnel.etablissementId,
          user: { roles: { some: { nom: "admin_etablissement" } } },
        },
        select: { userId: true },
      });

      await Promise.all(
        responsables.map((responsable) =>
          creerNotification(
            responsable.userId,
            "revue_acces_urgence_non_conforme",
            `Un accès d'urgence déclenché par un professionnel de votre établissement a été jugé non conforme.`,
            patientId ? `/app/etablissement/audit` : undefined,
            { codeCatalogue: "N-EMERGENCY-NONCOMPLIANT" }
          )
        )
      );
    }
  }

  return { error: null, success: true };
}

/** Une rupture detectee dans le chainage du journal d'audit (RG-AUD-02). */
export interface RuptureChainageJournal {
  numeroSequence: string; // BigInt serialise en chaine (JSON n'a pas de type BigInt)
  journalAuditId: string;
  date: string; // ISO
  action: string;
  // empreinte_incoherente : le contenu de la ligne (ou de sa precedente) a change depuis l'insertion.
  // chainon_manquant : empreintePrecedente ne correspond pas a l'empreinte reelle de la ligne precedente (suppression ou insertion hors chaine).
  type: "empreinte_incoherente" | "chainon_manquant";
}

export interface ResultatVerificationIntegrite {
  lignesVerifiees: number;
  ruptures: RuptureChainageJournal[];
  dateVerification: string; // ISO
}

/**
 * RG-AUD-02 : recalcule la chaine d'empreintes du journal d'audit sur une
 * periode et signale toute rupture (voir le detail de la formule et ses
 * limites dans le commentaire en tete de fichier). Reserve a admin_national
 * (Zero Trust : jamais de resultat, meme partiel, sans le role requis).
 * Meme plafond de periode que rechercherJournalAudit (RG-AUD, 31 jours) :
 * au-dela, relancer la verification sur des sous-periodes successives.
 */
export async function verifierIntegriteJournal(
  dateDebut: string,
  dateFin: string
): Promise<ResultatVerificationIntegrite | null> {
  const session = await getSession();

  if (!session || !session.roles.includes("admin_national")) {
    return null;
  }

  const debut = new Date(`${dateDebut}T00:00:00.000Z`);
  const fin = new Date(`${dateFin}T23:59:59.999Z`);

  if (Number.isNaN(debut.getTime()) || Number.isNaN(fin.getTime()) || fin < debut) {
    return null;
  }

  if (differenceEnJours(debut, fin) > NOMBRE_JOURS_MAX) {
    return null;
  }

  // Derniere ligne strictement avant la periode : necessaire pour valider le
  // premier chainon de la periode par rapport a son vrai predecesseur, sans
  // quoi il serait a tort signale comme une rupture des le debut de periode.
  const precedentHorsPeriode = await prisma.journalAudit.findFirst({
    where: { date: { lt: debut } },
    orderBy: { numeroSequence: "desc" },
    select: { empreinte: true },
  });

  const lignes = await prisma.journalAudit.findMany({
    where: { date: { gte: debut, lte: fin } },
    orderBy: { numeroSequence: "asc" },
    select: {
      id: true,
      utilisateurId: true,
      action: true,
      donneeConcernee: true,
      justification: true,
      date: true,
      numeroSequence: true,
      empreinte: true,
      empreintePrecedente: true,
    },
  });

  const ruptures: RuptureChainageJournal[] = [];
  // Continue toujours avec l'empreinte REELLEMENT stockee de la ligne
  // precedente (jamais celle recalculee), pour que la detection d'une seule
  // ligne alteree ne produise qu'une seule rupture signalee plutot qu'une
  // cascade sur toutes les lignes suivantes.
  let empreintePrecedenteReelle = precedentHorsPeriode?.empreinte ?? null;

  for (const ligne of lignes) {
    if (ligne.empreintePrecedente !== empreintePrecedenteReelle) {
      ruptures.push({
        numeroSequence: ligne.numeroSequence.toString(),
        journalAuditId: ligne.id,
        date: ligne.date.toISOString(),
        action: ligne.action,
        type: "chainon_manquant",
      });
    }

    const empreinteAttendue = createHash("sha256")
      .update(
        (empreintePrecedenteReelle ?? "") + ligne.id + ligne.utilisateurId + ligne.action + ligne.donneeConcernee + ligne.justification,
        "utf8"
      )
      .digest("hex");

    if (ligne.empreinte !== empreinteAttendue) {
      ruptures.push({
        numeroSequence: ligne.numeroSequence.toString(),
        journalAuditId: ligne.id,
        date: ligne.date.toISOString(),
        action: ligne.action,
        type: "empreinte_incoherente",
      });
    }

    empreintePrecedenteReelle = ligne.empreinte;
  }

  const adresseTechnique = await adresseTechniqueCourante();
  await journaliser({
    utilisateurId: session.userId,
    action: "verification_integrite_journal",
    donneeConcernee: `periode:${dateDebut}_${dateFin}`,
    adresseTechnique,
    justification: `Verification d'integrite du journal d'audit (${lignes.length} ligne(s), ${ruptures.length} rupture(s) detectee(s)).`,
  });

  return {
    lignesVerifiees: lignes.length,
    ruptures,
    dateVerification: new Date().toISOString(),
  };
}
