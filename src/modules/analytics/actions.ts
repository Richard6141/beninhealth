"use server";

/**
 * Server Actions du module analytics : tableaux de bord etablissement et
 * ministere (Phase 6). Contrat d'integration consomme par les ecrans
 * src/app/app/etablissement/** et src/app/app/ministere/** (autre agent).
 *
 * Principe non negociable (voir src/security/README.md, ligne admin_national,
 * "Analytics Service (donnees agregees uniquement), jamais de donnees
 * nominatives") : aucune fonction de ce fichier ne doit jamais renvoyer de
 * donnee nominative (nom de patient, identifiant sante, detail clinique
 * individuel). On ne renvoie que des comptages et des agregations (totaux,
 * repartitions par statut, series mensuelles). Le tableau de bord
 * etablissement peut afficher le nom de SES PROPRES professionnels, mais ce
 * mecanisme est deja gere par le module identity ; ce module-ci ne renvoie
 * jamais de liste de patients ni de details de consultation individuels.
 *
 * Zero Trust applique de bout en bout : l'etablissement ou le role de
 * l'appelant est toujours derive de getSession(), jamais d'un id transmis
 * par le client. Un appel sans le role requis ne leve jamais d'exception :
 * il renvoie null, une structure a zero, ou une chaine vide, selon le
 * contrat de chaque fonction (voir plus bas).
 */

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

/** Un point d'une serie mensuelle agregee. mois au format "AAAA-MM". */
export interface PointMensuel {
  mois: string;
  total: number;
}

/** Statistiques agregees de l'etablissement de l'admin_etablissement connecte. */
export interface StatistiquesEtablissement {
  etablissementNom: string;
  totalConsultations: number;
  totalPrescriptions: number;
  nombreProfessionnels: number;
  rendezVousParStatut: { statut: string; total: number }[];
  consultationsParMois: PointMensuel[];
}

/** Ligne agregee d'un etablissement, pour la repartition nationale. */
export interface RepartitionEtablissement {
  etablissementNom: string;
  localisation: string;
  type: string;
  totalConsultations: number;
  totalRendezVous: number;
  nombreProfessionnels: number;
}

/** Statistiques agregees a l'echelle nationale, pour le tableau de bord ministere. */
export interface StatistiquesNationales {
  totalEtablissements: number;
  totalProfessionnels: number;
  totalPatients: number;
  totalConsultations: number;
  totalPrescriptions: number;
  repartitionParEtablissement: RepartitionEtablissement[];
  consultationsParMois: PointMensuel[];
  rendezVousParStatut: { statut: string; total: number }[];
}

/** Statuts possibles d'un RendezVous (voir prisma/schema.prisma). Ordre d'affichage fixe. */
const STATUTS_RENDEZ_VOUS = ["demande", "confirme", "termine", "annule"] as const;

/** Une plage de mois calendaire, avec sa cle d'affichage "AAAA-MM". */
interface PlageMois {
  debut: Date;
  fin: Date;
  cle: string;
}

/** Formate une date en cle de mois "AAAA-MM" (ex : "2026-09"). */
function moisAAAAMM(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * Calcule les `nombreMois` derniers mois glissants (mois courant inclus),
 * dans l'ordre chronologique. Chaque plage est un intervalle demi-ouvert
 * [debut, fin) pretes a etre utilisees dans un filtre Prisma `gte`/`lt`.
 */
function derniersMoisGlissants(nombreMois: number, maintenant: Date = new Date()): PlageMois[] {
  const plages: PlageMois[] = [];

  for (let decalage = nombreMois - 1; decalage >= 0; decalage -= 1) {
    const debut = new Date(maintenant.getFullYear(), maintenant.getMonth() - decalage, 1);
    const fin = new Date(maintenant.getFullYear(), maintenant.getMonth() - decalage + 1, 1);
    plages.push({ debut, fin, cle: moisAAAAMM(debut) });
  }

  return plages;
}

/**
 * Repartit une liste de dates dans les plages de mois fournies. Ne conserve
 * que des totaux par mois (jamais les dates ou les enregistrements d'origine) :
 * c'est le seul point de passage entre des dates individuelles et le total
 * agrege renvoye par ce module. Les mois sans aucune donnee restent a 0
 * (jamais omis).
 */
function repartirParMois(dates: Date[], plages: PlageMois[]): PointMensuel[] {
  const compteurs = new Map<string, number>(plages.map((plage) => [plage.cle, 0]));

  for (const date of dates) {
    const cle = moisAAAAMM(date);
    if (compteurs.has(cle)) {
      compteurs.set(cle, (compteurs.get(cle) ?? 0) + 1);
    }
  }

  return plages.map((plage) => ({ mois: plage.cle, total: compteurs.get(plage.cle) ?? 0 }));
}

/**
 * Repartition des rendez-vous par statut pour un filtre Prisma donne.
 * Renvoie toujours les 4 statuts possibles, dans un ordre fixe, avec un
 * total a 0 pour les statuts sans rendez-vous (jamais omis).
 */
async function rendezVousParStatutPour(
  where: Prisma.RendezVousWhereInput
): Promise<{ statut: string; total: number }[]> {
  const groupes = await prisma.rendezVous.groupBy({
    by: ["statut"],
    where,
    _count: { _all: true },
  });

  const compteurs = new Map(groupes.map((groupe) => [groupe.statut, groupe._count._all]));

  return STATUTS_RENDEZ_VOUS.map((statut) => ({ statut, total: compteurs.get(statut) ?? 0 }));
}

/**
 * Recupere l'etablissement du titulaire de la session courante, uniquement
 * s'il porte le role admin_etablissement et possede un profil
 * ProfessionnelSante associe (meme mecanisme que src/modules/facility pour
 * retrouver le professionnel connecte). Null dans tous les autres cas :
 * aucune exception, jamais de donnee si le role ou le rattachement ne
 * correspond pas (Zero Trust).
 */
async function etablissementAdminDeLaSessionCourante() {
  const session = await getSession();

  if (!session || !session.roles.includes("admin_etablissement")) {
    return null;
  }

  const professionnel = await prisma.professionnelSante.findUnique({
    where: { userId: session.userId },
  });

  if (!professionnel) {
    return null;
  }

  return prisma.etablissementSanitaire.findUnique({
    where: { id: professionnel.etablissementId },
  });
}

/** Vrai si le titulaire de la session courante porte le role admin_national. */
async function estAdminNationalConnecte(): Promise<boolean> {
  const session = await getSession();
  return session !== null && session.roles.includes("admin_national");
}

/**
 * Calcule la repartition agregee par etablissement (consultations,
 * rendez-vous, professionnels), triee par nom d'etablissement. Fonction
 * interne partagee par getStatistiquesNationales et exporterRepartitionCSV :
 * chaque fonction publique fait sa propre verification de role avant de
 * l'appeler, cette fonction ne verifie rien elle-meme.
 */
async function calculerRepartitionParEtablissement(): Promise<RepartitionEtablissement[]> {
  const [etablissements, consultationsParEtablissement, rendezVousParEtablissement, professionnelsParEtablissement] =
    await Promise.all([
      prisma.etablissementSanitaire.findMany({ orderBy: { nom: "asc" } }),
      prisma.consultation.groupBy({ by: ["etablissementId"], _count: { _all: true } }),
      prisma.rendezVous.groupBy({ by: ["etablissementId"], _count: { _all: true } }),
      prisma.professionnelSante.groupBy({ by: ["etablissementId"], _count: { _all: true } }),
    ]);

  const consultationsParId = new Map(
    consultationsParEtablissement.map((groupe) => [groupe.etablissementId, groupe._count._all])
  );
  const rendezVousParId = new Map(
    rendezVousParEtablissement.map((groupe) => [groupe.etablissementId, groupe._count._all])
  );
  const professionnelsParId = new Map(
    professionnelsParEtablissement.map((groupe) => [groupe.etablissementId, groupe._count._all])
  );

  return etablissements.map((etablissement) => ({
    etablissementNom: etablissement.nom,
    localisation: etablissement.localisation,
    type: etablissement.type,
    totalConsultations: consultationsParId.get(etablissement.id) ?? 0,
    totalRendezVous: rendezVousParId.get(etablissement.id) ?? 0,
    nombreProfessionnels: professionnelsParId.get(etablissement.id) ?? 0,
  }));
}

/** Structure a zero pour getStatistiquesNationales, quand l'appelant n'a pas le role admin_national. */
function statistiquesNationalesVides(): StatistiquesNationales {
  return {
    totalEtablissements: 0,
    totalProfessionnels: 0,
    totalPatients: 0,
    totalConsultations: 0,
    totalPrescriptions: 0,
    repartitionParEtablissement: [],
    consultationsParMois: [],
    rendezVousParStatut: [],
  };
}

/**
 * Statistiques agregees de l'etablissement de l'admin_etablissement connecte
 * (deduit de sa propre fiche ProfessionnelSante, jamais d'id transmis par le
 * client). Reserve au role admin_etablissement. Renvoie null si l'appelant
 * n'a pas ce role ou n'a pas de ProfessionnelSante associe : aucune
 * exception, jamais de donnee hors de ce cas.
 *
 * Ne renvoie que des comptages et des agregations : jamais de liste de
 * patients, jamais de detail de consultation individuel.
 */
export async function getStatistiquesEtablissement(): Promise<StatistiquesEtablissement | null> {
  const etablissement = await etablissementAdminDeLaSessionCourante();

  if (!etablissement) {
    return null;
  }

  const etablissementId = etablissement.id;
  const plages = derniersMoisGlissants(6);

  const [totalConsultations, totalPrescriptions, nombreProfessionnels, rendezVousParStatut, consultationsRecentes] =
    await Promise.all([
      prisma.consultation.count({ where: { etablissementId } }),
      prisma.prescription.count({ where: { consultation: { etablissementId } } }),
      prisma.professionnelSante.count({ where: { etablissementId } }),
      rendezVousParStatutPour({ etablissementId }),
      prisma.consultation.findMany({
        where: { etablissementId, date: { gte: plages[0].debut } },
        select: { date: true },
      }),
    ]);

  return {
    etablissementNom: etablissement.nom,
    totalConsultations,
    totalPrescriptions,
    nombreProfessionnels,
    rendezVousParStatut,
    consultationsParMois: repartirParMois(
      consultationsRecentes.map((consultation) => consultation.date),
      plages
    ),
  };
}

/**
 * Statistiques agregees a l'echelle nationale, pour le tableau de bord
 * ministere. Reserve au role admin_national. Si l'appelant n'a pas ce role,
 * renvoie une structure a zero (statistiquesNationalesVides) plutot que de
 * lever une exception : Zero Trust, jamais de donnee si le role ne
 * correspond pas.
 *
 * Ne renvoie que des comptages et des agregations : aucune liste de
 * patients ni de professionnels nommes, uniquement des totaux par
 * etablissement, par mois et par statut.
 */
export async function getStatistiquesNationales(): Promise<StatistiquesNationales> {
  if (!(await estAdminNationalConnecte())) {
    return statistiquesNationalesVides();
  }

  const plages = derniersMoisGlissants(6);

  const [
    totalEtablissements,
    totalProfessionnels,
    totalPatients,
    totalConsultations,
    totalPrescriptions,
    repartitionParEtablissement,
    rendezVousParStatut,
    consultationsRecentes,
  ] = await Promise.all([
    prisma.etablissementSanitaire.count(),
    prisma.professionnelSante.count(),
    prisma.patient.count(),
    prisma.consultation.count(),
    prisma.prescription.count(),
    calculerRepartitionParEtablissement(),
    rendezVousParStatutPour({}),
    prisma.consultation.findMany({
      where: { date: { gte: plages[0].debut } },
      select: { date: true },
    }),
  ]);

  return {
    totalEtablissements,
    totalProfessionnels,
    totalPatients,
    totalConsultations,
    totalPrescriptions,
    repartitionParEtablissement,
    consultationsParMois: repartirParMois(
      consultationsRecentes.map((consultation) => consultation.date),
      plages
    ),
    rendezVousParStatut,
  };
}

/** Echappe une valeur textuelle pour un champ CSV (guillemets si elle contient une virgule). */
function echapperValeurCSV(valeur: string): string {
  if (valeur.includes(",")) {
    return `"${valeur.replace(/"/g, '""')}"`;
  }
  return valeur;
}

/**
 * Genere un export CSV de la repartition par etablissement (colonnes :
 * Etablissement, Localisation, Type, Consultations, RendezVous,
 * Professionnels). Reserve au role admin_national : renvoie une chaine
 * vide si l'appelant n'a pas ce role, sans lever d'exception.
 *
 * Le CSV ne contient que des noms d'etablissements et des totaux agreges,
 * jamais de nom de patient ni de professionnel individuel.
 */
export async function exporterRepartitionCSV(): Promise<string> {
  if (!(await estAdminNationalConnecte())) {
    return "";
  }

  const repartition = await calculerRepartitionParEtablissement();

  const enTetes = ["Etablissement", "Localisation", "Type", "Consultations", "RendezVous", "Professionnels"];

  const lignes = repartition.map((ligne) =>
    [
      echapperValeurCSV(ligne.etablissementNom),
      echapperValeurCSV(ligne.localisation),
      echapperValeurCSV(ligne.type),
      String(ligne.totalConsultations),
      String(ligne.totalRendezVous),
      String(ligne.nombreProfessionnels),
    ].join(",")
  );

  return [enTetes.join(","), ...lignes].join("\n");
}
