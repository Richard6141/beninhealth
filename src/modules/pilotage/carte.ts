"use server";

/**
 * Carte sanitaire (F-PIL-03, chapitre 14 du pack) : un indicateur agrege,
 * choisi parmi ceux que la fiche F-PIL-04 sait deja comparer, colore les 12
 * departements (carte choroplethe a 5 classes). Lit UNIQUEMENT
 * AgregatQuotidien, jamais Consultation ni aucune table individuelle, comme
 * lecture.ts et tendances.ts.
 *
 * RG-PIL-30 : la carte ne descend jamais sous le niveau departement (les
 * contours embarques sont ceux des 12 departements). RG-PIL-02 : chaque
 * valeur de 1 a 4 est affichee "< 5" et sa classe reste la plus faible.
 * RG-PIL-21 : chaque consultation de la carte est journalisee.
 *
 * Limite assumee : ce depot n'a qu'un role d'autorite sanitaire, de portee
 * nationale (voir tendances.ts) ; les 34 zones sanitaires n'ont pas de contour
 * public embarque (voir geometrie-departements.ts) ; la couche "etablissements"
 * n'affiche que le repertoire (nom, type, position), jamais une donnee de sante.
 */

import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { journaliser } from "@/modules/audit/journaliser";
import { trouverDefinitionIndicateur } from "./indicateurs";
import { masquerPetitEffectif } from "./masquage";
import { DIMENSION_PAR_INDICATEUR_COMPARABLE } from "./tendances-constantes";
import { PERIODES_CARTE, classeDeLaValeur, plageDePeriode, projeter, type PeriodeCarte } from "./carte-regles";
import type { CarteSanitaire, DepartementCarte } from "./carte-constantes";

async function adresseTechniqueCourante(): Promise<string> {
  try {
    const listeEntetes = await headers();
    return listeEntetes.get("x-forwarded-for") ?? listeEntetes.get("x-real-ip") ?? "inconnue";
  } catch {
    return "inconnue";
  }
}

/**
 * Donnees de la carte pour un indicateur et une periode. Renvoie null pour
 * tout appelant qui n'est pas l'autorite nationale, ou pour un indicateur
 * non cartographiable (entree client jamais fiable telle quelle).
 */
export async function getCarteSanitaire(
  indicateurCode: string,
  periode: string,
  avecEtablissements = false
): Promise<CarteSanitaire | null> {
  const session = await getSession();

  if (!session || !session.roles.includes("admin_national")) {
    return null;
  }

  const definition = trouverDefinitionIndicateur(indicateurCode);
  const dimension = DIMENSION_PAR_INDICATEUR_COMPARABLE[indicateurCode];

  if (!definition || dimension === undefined || !(PERIODES_CARTE as readonly string[]).includes(periode)) {
    return null;
  }

  const periodeValide = periode as PeriodeCarte;
  const { debut, fin } = plageDePeriode(periodeValide, new Date());

  const [departements, etablissements] = await Promise.all([
    prisma.departement.findMany({ orderBy: { nom: "asc" }, select: { id: true, code: true, nom: true } }),
    prisma.etablissementSanitaire.findMany({
      select: {
        id: true,
        nom: true,
        type: true,
        statut: true,
        latitude: true,
        longitude: true,
        commune: { select: { departementId: true } },
        zoneSanitaire: { select: { departementId: true } },
      },
    }),
  ]);

  const departementParEtablissement = new Map<string, string>();
  const nombreParDepartement = new Map<string, number>();
  for (const etablissement of etablissements) {
    const departementId = etablissement.commune?.departementId ?? etablissement.zoneSanitaire?.departementId ?? null;
    if (!departementId) continue;
    departementParEtablissement.set(etablissement.id, departementId);
    nombreParDepartement.set(departementId, (nombreParDepartement.get(departementId) ?? 0) + 1);
  }

  const lignes =
    departementParEtablissement.size === 0
      ? []
      : await prisma.agregatQuotidien.findMany({
          where: {
            indicateur: definition.code,
            etablissementId: { in: Array.from(departementParEtablissement.keys()) },
            date: { gte: debut, lt: fin },
            ...(dimension !== null ? { dimensionLibre: dimension } : {}),
          },
          select: { etablissementId: true, valeur: true },
        });

  const totaux = new Map<string, number>();
  for (const ligne of lignes) {
    const departementId = departementParEtablissement.get(ligne.etablissementId!);
    if (!departementId) continue;
    totaux.set(departementId, (totaux.get(departementId) ?? 0) + ligne.valeur);
  }

  const valeursAffichees = departements.map((departement) => ({ departement, valeur: masquerPetitEffectif(totaux.get(departement.id) ?? 0) }));

  // Le maximum de la legende ne vient que de valeurs deja masquees : une legende "0 a 3" revelerait un effectif de 1 a 4 (RG-PIL-02).
  const maximum = Math.max(0, ...valeursAffichees.map(({ valeur }) => (valeur === "< 5" ? 0 : valeur)));

  const departementsCarte: DepartementCarte[] = valeursAffichees.map(({ departement, valeur }) => ({
    id: departement.id,
    code: departement.code,
    nom: departement.nom,
    valeur,
    classe: classeDeLaValeur(valeur, maximum),
    nombreEtablissements: nombreParDepartement.get(departement.id) ?? 0,
  }));

  await journaliser({
    utilisateurId: session.userId,
    action: "ANALYTICS_VIEW",
    donneeConcernee: `pilotage_carte:indicateur=${definition.code};periode=${periodeValide};etablissements=${avecEtablissements}`,
    adresseTechnique: await adresseTechniqueCourante(),
    justification: "Consultation de la carte sanitaire",
  });

  return {
    indicateur: { code: definition.code, libelle: definition.libelle },
    periode: periodeValide,
    departements: departementsCarte,
    maximum,
    etablissements: avecEtablissements
      ? etablissements
          .filter((etablissement) => etablissement.statut === "actif")
          .map((etablissement) => ({
            id: etablissement.id,
            nom: etablissement.nom,
            type: etablissement.type,
            ...projeter(etablissement.longitude, etablissement.latitude),
          }))
      : null,
  };
}
