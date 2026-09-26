"use server";

/**
 * Lecture des tendances et comparaisons territoriales (F-PIL-04, chapitre 14
 * du pack) : choix d'un indicateur, d'une granularite (semaine/mois), d'une
 * periode (jusqu'a 24 mois) et de 2 a 5 territoires (departements) a
 * comparer. Meme principe que src/modules/pilotage/lecture.ts : ne lit que
 * `AgregatQuotidien`, jamais Consultation ni aucune table individuelle, et ne
 * fait confiance a aucune entree du client sans la revalider ici (Zero
 * Trust). Les constantes et types partages avec l'interface vivent dans
 * ./tendances-constantes.ts (un fichier "use server" ne peut exporter que des
 * fonctions async, contrainte Next.js/Turbopack).
 *
 * Limite assumee (deja documentee dans lecture.ts pour F-PIL-02) : ce depot
 * n'a qu'un seul role d'autorite sanitaire, admin_national, de portee
 * toujours nationale. RG-PIL-20 (restriction de portee departement/zone)
 * reste donc sans objet ici : la comparaison peut porter sur n'importe quel
 * sous-ensemble de departements, il n'existe pas d'utilisateur a portee
 * reduite a proteger.
 *
 * Limite assumee sur le choix des indicateurs comparables (voir la liste
 * DIMENSION_PAR_INDICATEUR_COMPARABLE dans tendances-constantes.ts) : seuls
 * les indicateurs representables par UN SEUL nombre par etablissement et par
 * jour, sans sous-dimension a choisir, sont proposes. IND-03 (necessite un
 * groupe de maladies) et IND-09 (necessite un medicament) demanderaient un
 * second selecteur de sous-dimension non prevu par cette fiche ; IND-05/06/13
 * sont deja nationaux/departementaux dans agregation.ts (rien a comparer par
 * jointure etablissement -> territoire) ; IND-11/12 n'ont pas de dimension
 * territoire dans le catalogue (section 14.2 du pack). Tous exclus
 * explicitement, pas silencieusement oublies.
 */

import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { journaliser } from "@/modules/audit/journaliser";
import { masquerLigneAvecTotal } from "./masquage";
import { trouverDefinitionIndicateur } from "./indicateurs";
import {
  DIMENSION_PAR_INDICATEUR_COMPARABLE,
  NOMBRE_TERRITOIRES_MAXIMUM,
  NOMBRE_TERRITOIRES_MINIMUM,
  PERIODE_MOIS_DEFAUT,
  PERIODE_MOIS_MAXIMUM,
  type FiltresTendances,
  type GranulariteTendance,
  type PointComparaison,
  type ResultatTendances,
  type TerritoireOption,
} from "./tendances-constantes";

async function estAdminNationalDeLaSessionCourante(): Promise<boolean> {
  const session = await getSession();
  return session !== null && session.roles.includes("admin_national");
}

export async function listerTerritoiresComparables(): Promise<TerritoireOption[] | null> {
  if (!(await estAdminNationalDeLaSessionCourante())) {
    return null;
  }
  return prisma.departement.findMany({
    orderBy: { nom: "asc" },
    select: { id: true, code: true, nom: true },
  });
}

function formaterDateISO(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function lundiDeLaSemaine(date: Date): Date {
  const jour = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const jourSemaine = jour.getUTCDay();
  const decalage = jourSemaine === 0 ? 6 : jourSemaine - 1;
  jour.setUTCDate(jour.getUTCDate() - decalage);
  return jour;
}

function premierJourDuMois(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function debutBucket(date: Date, granularite: GranulariteTendance): Date {
  return granularite === "semaine" ? lundiDeLaSemaine(date) : premierJourDuMois(date);
}

const NOMS_MOIS = [
  "janv.", "fevr.", "mars", "avr.", "mai", "juin",
  "juil.", "aout", "sept.", "oct.", "nov.", "dec.",
];

function libelleBucket(cle: string, granularite: GranulariteTendance): string {
  const [annee, mois, jour] = cle.split("-");
  if (granularite === "mois") {
    return `${NOMS_MOIS[Number(mois) - 1]} ${annee}`;
  }
  return `${jour}/${mois}`;
}

/** Genere la suite continue des cles de bucket entre debut (inclus) et fin (exclu), pour un axe de graphique sans trou meme si une periode n'a aucune ligne d'agregat. */
function genererClesBuckets(debut: Date, fin: Date, granularite: GranulariteTendance): string[] {
  const cles: string[] = [];
  const curseur = debutBucket(debut, granularite);
  while (curseur < fin) {
    cles.push(formaterDateISO(curseur));
    if (granularite === "semaine") {
      curseur.setUTCDate(curseur.getUTCDate() + 7);
    } else {
      curseur.setUTCMonth(curseur.getUTCMonth() + 1);
    }
  }
  return cles;
}

/** Journalise l'ouverture ou le changement de filtre de l'ecran de tendances (RG-PIL-21). */
async function journaliserOuvertureTendances(
  filtres: FiltresTendances,
  territoires: TerritoireOption[]
): Promise<void> {
  const session = await getSession();
  if (!session) return;

  let adresseTechnique = "inconnue";
  try {
    const listeEntetes = await headers();
    adresseTechnique = listeEntetes.get("x-forwarded-for") ?? listeEntetes.get("x-real-ip") ?? "inconnue";
  } catch {
    // Contexte hors requete HTTP (ex. tache planifiee) : adresse technique non disponible.
  }

  await journaliser({
    utilisateurId: session.userId,
    action: "ANALYTICS_VIEW",
    donneeConcernee: `pilotage_tendances:indicateur=${filtres.indicateurCode};granularite=${filtres.granularite};territoires=${territoires.map((territoire) => territoire.code).join(",")};periodeMois=${filtres.periodeMois}`,
    adresseTechnique,
    justification: "Consultation des tendances et comparaisons territoriales",
  });
}

export async function getComparaisonTerritoires(filtres: FiltresTendances): Promise<ResultatTendances | null> {
  if (!(await estAdminNationalDeLaSessionCourante())) {
    return null;
  }

  const definition = trouverDefinitionIndicateur(filtres.indicateurCode);
  const dimension = DIMENSION_PAR_INDICATEUR_COMPARABLE[filtres.indicateurCode];
  if (!definition || dimension === undefined) {
    // Indicateur invalide ou non comparable : entree client jamais fiable telle quelle.
    return null;
  }

  const territoireIdsUniques = Array.from(new Set(filtres.territoireIds)).slice(0, NOMBRE_TERRITOIRES_MAXIMUM);
  if (territoireIdsUniques.length < NOMBRE_TERRITOIRES_MINIMUM) {
    return null;
  }

  const periodeMois = Math.min(Math.max(1, Math.round(filtres.periodeMois) || PERIODE_MOIS_DEFAUT), PERIODE_MOIS_MAXIMUM);

  const maintenant = new Date();
  const finExclusive = new Date(Date.UTC(maintenant.getUTCFullYear(), maintenant.getUTCMonth(), maintenant.getUTCDate() + 1));
  const debut = new Date(finExclusive);
  debut.setUTCMonth(debut.getUTCMonth() - periodeMois);

  const [territoiresTrouves, etablissements] = await Promise.all([
    prisma.departement.findMany({
      where: { id: { in: territoireIdsUniques } },
      select: { id: true, code: true, nom: true },
    }),
    prisma.etablissementSanitaire.findMany({
      where: {
        OR: [
          { commune: { departementId: { in: territoireIdsUniques } } },
          { zoneSanitaire: { departementId: { in: territoireIdsUniques } } },
        ],
      },
      select: {
        id: true,
        commune: { select: { departementId: true } },
        zoneSanitaire: { select: { departementId: true } },
      },
    }),
  ]);

  if (territoiresTrouves.length < NOMBRE_TERRITOIRES_MINIMUM) {
    // Ids inexistants ou insuffisants une fois verifies en base : ne pas construire un resultat partiel trompeur.
    return null;
  }

  const departementIdParEtablissement = new Map<string, string>();
  for (const etablissement of etablissements) {
    const departementId = etablissement.commune?.departementId ?? etablissement.zoneSanitaire?.departementId ?? null;
    if (departementId && territoireIdsUniques.includes(departementId)) {
      departementIdParEtablissement.set(etablissement.id, departementId);
    }
  }

  const territoiresOrdonnes = territoireIdsUniques
    .map((id) => territoiresTrouves.find((territoire) => territoire.id === id))
    .filter((territoire): territoire is TerritoireOption => territoire !== undefined);

  const lignes = departementIdParEtablissement.size === 0
    ? []
    : await prisma.agregatQuotidien.findMany({
        where: {
          indicateur: definition.code,
          etablissementId: { in: Array.from(departementIdParEtablissement.keys()) },
          date: { gte: debut, lt: finExclusive },
          ...(dimension !== null ? { dimensionLibre: dimension } : {}),
        },
        select: { etablissementId: true, date: true, valeur: true },
      });

  const totauxParBucket = new Map<string, Map<string, number>>();
  for (const ligne of lignes) {
    const departementId = departementIdParEtablissement.get(ligne.etablissementId!);
    if (!departementId) continue;
    const cle = formaterDateISO(debutBucket(ligne.date, filtres.granularite));
    let parTerritoire = totauxParBucket.get(cle);
    if (!parTerritoire) {
      parTerritoire = new Map();
      totauxParBucket.set(cle, parTerritoire);
    }
    parTerritoire.set(departementId, (parTerritoire.get(departementId) ?? 0) + ligne.valeur);
  }

  const points: PointComparaison[] = genererClesBuckets(debut, finExclusive, filtres.granularite).map((cle) => {
    const parTerritoire = totauxParBucket.get(cle);
    const cellules = territoiresOrdonnes.map((territoire) => ({
      cle: territoire.id,
      valeur: parTerritoire?.get(territoire.id) ?? 0,
    }));
    return {
      debut: cle,
      libelle: libelleBucket(cle, filtres.granularite),
      valeurs: masquerLigneAvecTotal(cellules),
    };
  });

  await journaliserOuvertureTendances(filtres, territoiresOrdonnes);

  return {
    indicateur: { code: definition.code, libelle: definition.libelle },
    granularite: filtres.granularite,
    periodeMois,
    territoires: territoiresOrdonnes,
    points,
  };
}

/**
 * Meme donnees que getComparaisonTerritoires, serialisees en CSV pour le
 * bouton "Telecharger les donnees" de l'ecran. Les valeurs sont deja
 * masquees (RG-PIL-02) au moment ou elles quittent getComparaisonTerritoires :
 * cette fonction ne relit jamais de valeur brute, elle formate seulement ce
 * qui est deja destine a l'affichage.
 */
export async function exporterComparaisonCSV(filtres: FiltresTendances): Promise<string | null> {
  const resultat = await getComparaisonTerritoires(filtres);
  if (!resultat) return null;

  const entete = ["Periode", ...resultat.territoires.map((territoire) => territoire.nom)];
  const lignes = resultat.points.map((point) => [
    point.libelle,
    ...resultat.territoires.map((territoire) => String(point.valeurs[territoire.id] ?? "")),
  ]);

  return [entete, ...lignes].map((ligne) => ligne.join(";")).join("\n");
}
