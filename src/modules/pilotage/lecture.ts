"use server";

/**
 * Lecture des agregats de pilotage (F-PIL-01, chapitre 14 du pack) pour le
 * tableau de bord etablissement. Seul point de lecture de la table
 * `AgregatQuotidien` cote etablissement : ne lit jamais Consultation,
 * Patient ni aucune autre table individuelle (section 14.1 du pack,
 * "les tableaux de bord... NE LISENT JAMAIS les tables de donnees
 * individuelles"), a l'exception assumee de l'activite par professionnel
 * (voir plus bas, hors perimetre RG-PIL-02 puisqu'aucun petit effectif
 * patient n'y est expose).
 *
 * Meme principe Zero Trust que src/modules/analytics/actions.ts :
 * l'etablissement de l'appelant est toujours derive de getSession(), jamais
 * d'un id transmis par le client. Renvoie null si l'appelant n'a pas le role
 * admin_etablissement ou n'a pas de ProfessionnelSante associe.
 */

import { headers } from "next/headers";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { journaliser } from "@/modules/audit/journaliser";
import { masquerDelaiMoyen, masquerPetitEffectif, masquerTaux, type ValeurMasquee } from "./masquage";
import { GROUPES_MALADIES, estGroupeSensible } from "./referentiel-groupes-maladies";
import {
  DIMENSIONS_PAR_INDICATEUR,
  FILTRES_VIDES,
  TRANCHES_AGE_FILTRE,
  auMoinsUnFiltre,
  filtreApplicable,
  parametresDesFiltres,
  type FiltresPilotage,
} from "./filtres-pilotage";

export type PeriodeTableauBord = "aujourdhui" | "7j" | "30j" | "mois";

export interface PointJournalierConsultations {
  /** Format "AAAA-MM-JJ". */
  date: string;
  /**
   * null si la valeur du jour est un petit effectif (1 a 4, RG-PIL-02) :
   * jamais transmise au client, meme masquee a l'affichage seulement, pour
   * qu'aucune valeur exacte de 1 a 4 ne quitte le serveur.
   */
  valeur: number | null;
}

export interface DiagnosticTop {
  code: string;
  libelle: string;
  valeur: ValeurMasquee;
}

export interface ActiviteProfessionnel {
  professionnelId: string;
  nomComplet: string;
  totalActes: number;
}

export interface TableauBordEtablissement {
  etablissementNom: string;
  periode: PeriodeTableauBord;
  consultations: ValeurMasquee;
  /**
   * Limite assumee : somme des comptes de patients distincts CALCULES PAR
   * JOUR (RG-PIL-60, grain quotidien). Un patient vu deux jours differents
   * dans la periode est alors compte deux fois : ce depot ne peut pas
   * calculer un compte distinct exact sur une periode multi-jours sans
   * relire les consultations individuelles, ce que l'architecture du pack
   * interdit justement aux tableaux de bord (section 14.1). Ecart attendu
   * de cette architecture par agregats quotidiens pre-calcules, pas un bug.
   */
  patientsVus: ValeurMasquee;
  rendezVousDuJour: { pris: ValeurMasquee; honores: ValeurMasquee; annules: ValeurMasquee; absences: ValeurMasquee } | null;
  /**
   * "effectif insuffisant" (RG-PIL-02) si moins de 20 rendez-vous honores+absents
   * AUJOURD'HUI (jamais sur la periode selectionnee : texte du pack, section
   * 14.2, "rendez-vous du jour et taux d'absence" dans la meme rangee
   * d'indicateurs cles que rendezVousDuJour ci-dessus, meme portee).
   */
  tauxAbsenceRendezVous: string;
  /**
   * IND-11 du pack : delai d'attente arrivee -> demarrage de consultation,
   * AUJOURD'HUI (meme portee que rendezVousDuJour/tauxAbsenceRendezVous
   * ci-dessus, jamais la periode selectionnee : texte du pack, section 14.2).
   * C'est une MOYENNE (somme des minutes / nombre de mesures de l'agregat du
   * jour), jamais la vraie MEDIANE du pack (non additive sur plusieurs jours
   * dans une architecture par agregats pre-calcules, voir agregation.ts) :
   * limite assumee, nommee comme telle. "aucune mesure" si aucun rendez-vous
   * avec heure d'arrivee et consultation liee aujourd'hui ; "< 5 mesures" en
   * dessous du seuil RG-PIL-02.
   */
  delaiAttenteMoyen: string;
  /** "effectif insuffisant" (RG-PIL-02) si moins de 20 ordonnances signees sur la periode. */
  tauxDelivranceOrdonnances: string;
  evolutionConsultations: PointJournalierConsultations[];
  topDiagnostics: DiagnosticTop[];
  /**
   * Nombre d'actes (consultations validees) par professionnel de
   * l'etablissement. Lecture directe de Consultation (pas de AgregatQuotidien,
   * qui n'a pas de dimension professionnel) : aucune donnee patient exposee,
   * seulement un total par membre du personnel deja visible de l'admin sur
   * ce meme ecran (section Personnel), donc hors du perimetre RG-PIL-02
   * (qui protege la ré-identification d'un PATIENT, pas d'un professionnel).
   */
  activiteParProfessionnel: ActiviteProfessionnel[];
  dateCalculPlusRecente: Date | null;
}

function formaterDateISO(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function plagePourPeriode(periode: PeriodeTableauBord, maintenant: Date): { debut: Date; fin: Date } {
  const debutAujourdhui = new Date(Date.UTC(maintenant.getUTCFullYear(), maintenant.getUTCMonth(), maintenant.getUTCDate()));
  const finExclusive = new Date(debutAujourdhui);
  finExclusive.setUTCDate(finExclusive.getUTCDate() + 1);

  if (periode === "aujourdhui") {
    return { debut: debutAujourdhui, fin: finExclusive };
  }
  if (periode === "7j") {
    const debut = new Date(debutAujourdhui);
    debut.setUTCDate(debut.getUTCDate() - 6);
    return { debut, fin: finExclusive };
  }
  if (periode === "30j") {
    const debut = new Date(debutAujourdhui);
    debut.setUTCDate(debut.getUTCDate() - 29);
    return { debut, fin: finExclusive };
  }
  // "mois" : mois calendaire courant, du 1er au jour present inclus.
  const debutMois = new Date(Date.UTC(maintenant.getUTCFullYear(), maintenant.getUTCMonth(), 1));
  return { debut: debutMois, fin: finExclusive };
}

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

export async function getTableauBordEtablissement(
  periode: PeriodeTableauBord
): Promise<TableauBordEtablissement | null> {
  const etablissement = await etablissementAdminDeLaSessionCourante();
  if (!etablissement) {
    return null;
  }
  const etablissementId = etablissement.id;

  const maintenant = new Date();
  const { debut, fin } = plagePourPeriode(periode, maintenant);
  const { debut: debutAujourdhui, fin: finAujourdhui } = plagePourPeriode("aujourdhui", maintenant);

  const [lignesPeriode, lignesAujourdhui, activiteParProfessionnel] = await Promise.all([
    prisma.agregatQuotidien.findMany({
      where: { etablissementId, date: { gte: debut, lt: fin } },
    }),
    prisma.agregatQuotidien.findMany({
      where: { etablissementId, date: { gte: debutAujourdhui, lt: finAujourdhui }, indicateur: { in: ["IND-07", "IND-11"] } },
    }),
    prisma.consultation.groupBy({
      by: ["professionnelId"],
      where: { etablissementId, statut: "terminee", saisieParErreur: false, date: { gte: debut, lt: fin } },
      _count: { _all: true },
    }),
  ]);

  let totalConsultations = 0;
  let totalPatientsVus = 0;
  let totalOrdonnancesSignees = 0;
  let totalOrdonnancesDelivrees30j = 0;
  const totauxParDiagnostic = new Map<string, number>();
  const totauxParJourConsultations = new Map<string, number>();
  let dateCalculPlusRecente: Date | null = null;

  for (const ligne of lignesPeriode) {
    if (dateCalculPlusRecente === null || ligne.dateCalcul > dateCalculPlusRecente) {
      dateCalculPlusRecente = ligne.dateCalcul;
    }

    if (ligne.indicateur === "IND-01") {
      totalConsultations += ligne.valeur;
      const cleJour = formaterDateISO(ligne.date);
      totauxParJourConsultations.set(cleJour, (totauxParJourConsultations.get(cleJour) ?? 0) + ligne.valeur);
    } else if (ligne.indicateur === "IND-02") {
      totalPatientsVus += ligne.valeur;
    } else if (ligne.indicateur === "IND-03" && ligne.dimensionLibre) {
      // RG-PIL-05 : jamais de groupe sensible par etablissement. L'agregateur
      // n'en ecrit plus, ce filtre protege contre d'anciennes lignes deja
      // stockees par etablissement avant ce correctif.
      if (estGroupeSensible(ligne.dimensionLibre)) continue;
      totauxParDiagnostic.set(ligne.dimensionLibre, (totauxParDiagnostic.get(ligne.dimensionLibre) ?? 0) + ligne.valeur);
    } else if (ligne.indicateur === "IND-08" && ligne.dimensionLibre === "signees") {
      totalOrdonnancesSignees += ligne.valeur;
    } else if (ligne.indicateur === "IND-08" && ligne.dimensionLibre === "delivrees_30j") {
      totalOrdonnancesDelivrees30j += ligne.valeur;
    }
  }

  let rendezVousDuJour: TableauBordEtablissement["rendezVousDuJour"] = null;
  let tauxAbsenceRendezVous = "effectif insuffisant";
  let delaiAttenteMoyen = "aucune mesure";
  const lignesIND07Aujourdhui = lignesAujourdhui.filter((ligne) => ligne.indicateur === "IND-07");
  if (lignesIND07Aujourdhui.length > 0) {
    const parDimension = new Map(lignesIND07Aujourdhui.map((ligne) => [ligne.dimensionLibre, ligne.valeur]));
    const honores = parDimension.get("honores") ?? 0;
    const absences = parDimension.get("absences") ?? 0;
    rendezVousDuJour = {
      pris: masquerPetitEffectif(parDimension.get("pris") ?? 0),
      honores: masquerPetitEffectif(honores),
      annules: masquerPetitEffectif(parDimension.get("annules") ?? 0),
      absences: masquerPetitEffectif(absences),
    };
    tauxAbsenceRendezVous = masquerTaux(absences, honores + absences);
  }
  const ligneIND11Somme = lignesAujourdhui.find((ligne) => ligne.indicateur === "IND-11" && ligne.dimensionLibre === "somme_minutes");
  const ligneIND11Nombre = lignesAujourdhui.find((ligne) => ligne.indicateur === "IND-11" && ligne.dimensionLibre === "nombre_mesures");
  if (ligneIND11Nombre) {
    delaiAttenteMoyen = masquerDelaiMoyen(ligneIND11Somme?.valeur ?? 0, ligneIND11Nombre.valeur);
  }

  const evolutionConsultations: PointJournalierConsultations[] = [];
  for (let curseur = new Date(debut); curseur < fin; curseur.setUTCDate(curseur.getUTCDate() + 1)) {
    const cleJour = formaterDateISO(curseur);
    const valeurBrute = totauxParJourConsultations.get(cleJour) ?? 0;
    evolutionConsultations.push({
      date: cleJour,
      valeur: valeurBrute > 0 && valeurBrute < 5 ? null : valeurBrute,
    });
  }

  const topDiagnostics: DiagnosticTop[] = Array.from(totauxParDiagnostic.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([code, valeur]) => ({
      code,
      libelle: GROUPES_MALADIES.find((groupe) => groupe.code === code)?.libelle ?? code,
      valeur: masquerPetitEffectif(valeur),
    }));

  const idsProfessionnels = activiteParProfessionnel.map((ligne) => ligne.professionnelId);
  const professionnels = await prisma.professionnelSante.findMany({
    where: { id: { in: idsProfessionnels } },
    select: { id: true, user: { select: { nom: true, prenom: true } } },
  });
  const nomParProfessionnelId = new Map(
    professionnels.map((professionnel) => [professionnel.id, `${professionnel.user.prenom} ${professionnel.user.nom}`])
  );

  return {
    etablissementNom: etablissement.nom,
    periode,
    consultations: masquerPetitEffectif(totalConsultations),
    patientsVus: masquerPetitEffectif(totalPatientsVus),
    rendezVousDuJour,
    tauxAbsenceRendezVous,
    delaiAttenteMoyen,
    tauxDelivranceOrdonnances: masquerTaux(totalOrdonnancesDelivrees30j, totalOrdonnancesSignees),
    evolutionConsultations,
    topDiagnostics,
    activiteParProfessionnel: activiteParProfessionnel
      .map((ligne) => ({
        professionnelId: ligne.professionnelId,
        nomComplet: nomParProfessionnelId.get(ligne.professionnelId) ?? "Professionnel inconnu",
        totalActes: ligne._count._all,
      }))
      .sort((a, b) => b.totalActes - a.totalActes),
    dateCalculPlusRecente,
  };
}

/**
 * Lecture nationale (F-PIL-02, chapitre 14 du pack) pour le centre national
 * de pilotage. Reserve au role admin_national : renvoie null sinon (Zero
 * Trust, meme principe que ci-dessus).
 *
 * Limite assumee : le pack imagine une portee HEALTH_AUTHORITY qui peut etre
 * nationale, departementale ou de zone (RG-PIL-20 : un utilisateur de portee
 * DEPARTMENT ne peut pas voir un autre departement). Ce depot n'a qu'un seul
 * role d'autorite sanitaire, admin_national, sans notion de portee
 * restreinte a un departement ou une zone (decision produit du 2026-09-26,
 * consignee dans docs/coordination-agents.md : le chapitre 15 s'adapte aux
 * roles existants, pas de nouveau role). RG-PIL-20 est donc sans objet dans
 * cette version : toute vue nationale ouverte par un admin_national voit
 * l'ensemble du territoire, il n'existe pas d'utilisateur a portee reduite a
 * restreindre.
 */

export interface CarteIndicateurNational {
  valeur: ValeurMasquee;
  /** null si non calculable (periode precedente sans donnee, ou une des deux valeurs est un petit effectif masque). */
  variationPourcent: number | null;
}

export interface PointHebdomadaireNational {
  /** Date de fin (incluse) des 7 jours du point, format "AAAA-MM-JJ". */
  finSemaine: string;
  consultations: number | null;
  paludisme: number | null;
}

/** Cartes et courbes que la vue nationale peut declarer non filtrables (F-PIL-02). */
export type CleCarteNationale =
  | "consultations"
  | "patientsVus"
  | "etablissementsActifs"
  | "casPaludisme"
  | "evolutionPaludisme"
  | "tauxDelivrance"
  | "vaccinations";

export interface VueNationalePilotage {
  periode: PeriodeTableauBord;
  /** Filtres reellement appliques apres verification cote serveur. */
  filtres: FiltresPilotage;
  /** Cartes dont l'agregat n'a pas la dimension d'un filtre actif : a afficher "Non disponible avec ces filtres", jamais un chiffre non filtre. */
  nonFiltrables: CleCarteNationale[];
  /** Vrai quand les groupes de maladies sensibles sont absents du top a cause des filtres (RG-PIL-05). */
  groupesSensiblesExclus: boolean;
  consultations: CarteIndicateurNational;
  patientsVus: CarteIndicateurNational;
  etablissementsActifs: { actifs: ValeurMasquee; total: number };
  casPaludisme: CarteIndicateurNational;
  tauxDelivranceOrdonnances: string;
  vaccinations: CarteIndicateurNational;
  topDiagnostics: DiagnosticTop[];
  evolutionHebdomadaire: PointHebdomadaireNational[];
  dateCalculPlusRecente: Date | null;
}

async function estAdminNationalDeLaSessionCourante(): Promise<boolean> {
  const session = await getSession();
  return session !== null && session.roles.includes("admin_national");
}

/** Journalise l'ouverture ou le changement de filtre du centre national de pilotage (RG-PIL-21). */
async function journaliserOuvertureVueNationale(periode: PeriodeTableauBord, filtres: FiltresPilotage): Promise<void> {
  const session = await getSession();
  if (!session) return;

  let adresseTechnique = "inconnue";
  try {
    const listeEntetes = await headers();
    adresseTechnique = listeEntetes.get("x-forwarded-for") ?? listeEntetes.get("x-real-ip") ?? "inconnue";
  } catch {
    // Contexte hors requete HTTP (ex. tache planifiee) : adresse technique non disponible.
  }

  const filtresActifs = parametresDesFiltres(filtres)
    .map(([nom, valeur]) => `;${nom}=${valeur}`)
    .join("");

  await journaliser({
    utilisateurId: session.userId,
    action: "ANALYTICS_VIEW",
    donneeConcernee: `pilotage_national:periode=${periode}${filtresActifs}`,
    adresseTechnique,
    justification: "Consultation du centre national de pilotage",
  });
}

interface ContexteFiltres {
  /** Filtres reverifies cote serveur (un departement ou un type inconnu est ecarte). */
  filtres: FiltresPilotage;
  /** Etablissements du territoire et du type choisis, ou null quand aucun des deux n'est filtre. */
  etablissementIds: string[] | null;
}

/** Zero Trust : le departement et le type viennent de l'URL, ils sont verifies en base avant tout usage. */
async function resoudreFiltres(demandes: FiltresPilotage): Promise<ContexteFiltres> {
  const departement = demandes.departementId
    ? await prisma.departement.findUnique({ where: { id: demandes.departementId }, select: { id: true } })
    : null;
  const etablissementDuType = demandes.typeEtablissement
    ? await prisma.etablissementSanitaire.findFirst({ where: { type: demandes.typeEtablissement }, select: { type: true } })
    : null;

  const filtres: FiltresPilotage = {
    departementId: departement?.id ?? null,
    typeEtablissement: etablissementDuType?.type ?? null,
    sexe: demandes.sexe === "M" || demandes.sexe === "F" ? demandes.sexe : null,
    trancheAge: demandes.trancheAge !== null && TRANCHES_AGE_FILTRE.includes(demandes.trancheAge) ? demandes.trancheAge : null,
  };

  if (filtres.departementId === null && filtres.typeEtablissement === null) {
    return { filtres, etablissementIds: null };
  }

  const conditions: Prisma.EtablissementSanitaireWhereInput[] = [];
  if (filtres.departementId !== null) {
    // Meme regle de rattachement que l'agregation : la commune d'abord, la zone sanitaire sinon.
    conditions.push({
      OR: [
        { commune: { departementId: filtres.departementId } },
        { communeId: null, zoneSanitaire: { departementId: filtres.departementId } },
      ],
    });
  }
  if (filtres.typeEtablissement !== null) conditions.push({ type: filtres.typeEtablissement });

  const etablissements = await prisma.etablissementSanitaire.findMany({ where: { AND: conditions }, select: { id: true } });
  return { filtres, etablissementIds: etablissements.map((etablissement) => etablissement.id) };
}

/** Conditions de lecture d'un indicateur sous les filtres actifs, ou null si un filtre actif ne s'applique pas a cet indicateur. */
function conditionsAgregat(indicateur: string, contexte: ContexteFiltres): Prisma.AgregatQuotidienWhereInput | null {
  if (!filtreApplicable(indicateur, contexte.filtres)) return null;
  const dimensions = DIMENSIONS_PAR_INDICATEUR[indicateur] ?? { sexe: false, trancheAge: false };

  return {
    ...(contexte.etablissementIds !== null ? { etablissementId: { in: contexte.etablissementIds } } : {}),
    ...(contexte.filtres.sexe !== null && dimensions.sexe ? { sexe: contexte.filtres.sexe } : {}),
    ...(contexte.filtres.trancheAge !== null && dimensions.trancheAge ? { trancheAge: contexte.filtres.trancheAge } : {}),
  };
}

/** Somme brute d'un indicateur sous les filtres, ou null quand un filtre actif ne peut pas s'y appliquer. */
async function sommeIndicateurNational(
  indicateur: string,
  debut: Date,
  fin: Date,
  contexte: ContexteFiltres,
  supplement: Prisma.AgregatQuotidienWhereInput = {}
): Promise<number | null> {
  const conditions = conditionsAgregat(indicateur, contexte);
  if (conditions === null) return null;

  const resultat = await prisma.agregatQuotidien.aggregate({
    where: { indicateur, date: { gte: debut, lt: fin }, ...conditions, ...supplement },
    _sum: { valeur: true },
  });
  return resultat._sum.valeur ?? 0;
}

/** Variation en % entre deux sommes brutes, ou null si non calculable (RG-PIL-02 : jamais deriver un petit effectif masque par soustraction/division). */
function calculerVariation(actuel: number, precedent: number): number | null {
  if (actuel > 0 && actuel < 5) return null;
  if (precedent > 0 && precedent < 5) return null;
  if (precedent === 0) return null;
  return Math.round(((actuel - precedent) / precedent) * 1000) / 10;
}

function carteNationale(actuel: number | null, precedent: number | null): CarteIndicateurNational {
  if (actuel === null || precedent === null) return { valeur: 0, variationPourcent: null };
  return {
    valeur: masquerPetitEffectif(actuel),
    variationPourcent: calculerVariation(actuel, precedent),
  };
}

/** Perimetre des lignes IND-05 (calculees par type, nationales ou par departement) sous les filtres de territoire et de type. */
function perimetreEtablissementsActifs(filtres: FiltresPilotage): Prisma.AgregatQuotidienWhereInput {
  const type = filtres.typeEtablissement !== null ? { typeEtablissement: filtres.typeEtablissement } : {};
  if (filtres.departementId !== null) return { etablissementId: null, departementId: filtres.departementId, ...type };
  return { etablissementId: null, departementId: null, ...type };
}

/**
 * Le top des diagnostics lit les lignes des etablissements ; les groupes
 * SENSIBLES ne sont comptes qu'au departement et au national (RG-PIL-05,
 * lignes sans etablissement, sans sexe ni tranche). Ils ne peuvent donc
 * accompagner que la vue nationale ou celle d'un seul departement, sans
 * filtre de type, de sexe ni d'age.
 */
function conditionsTopDiagnostics(contexte: ContexteFiltres): { conditions: Prisma.AgregatQuotidienWhereInput; sensiblesExclus: boolean } {
  const base = conditionsAgregat("IND-03", contexte) ?? {};
  const { filtres } = contexte;

  if (!auMoinsUnFiltre(filtres)) return { conditions: base, sensiblesExclus: false };

  const seulementUnDepartement = filtres.departementId !== null && filtres.typeEtablissement === null && filtres.sexe === null && filtres.trancheAge === null;
  if (seulementUnDepartement) {
    return { conditions: { OR: [base, { etablissementId: null, departementId: filtres.departementId }] }, sensiblesExclus: false };
  }
  return { conditions: base, sensiblesExclus: true };
}

/** Options du filtre territoire (F-PIL-02), admin_national seulement : departements du referentiel, tries par nom. */
export async function listerDepartementsFiltrables(): Promise<{ id: string; nom: string }[] | null> {
  if (!(await estAdminNationalDeLaSessionCourante())) {
    return null;
  }
  return prisma.departement.findMany({ orderBy: { nom: "asc" }, select: { id: true, nom: true } });
}

export async function getVueNationalePilotage(
  periode: PeriodeTableauBord,
  filtresDemandes: FiltresPilotage = FILTRES_VIDES
): Promise<VueNationalePilotage | null> {
  if (!(await estAdminNationalDeLaSessionCourante())) {
    return null;
  }

  const contexte = await resoudreFiltres(filtresDemandes);
  const { filtres } = contexte;

  await journaliserOuvertureVueNationale(periode, filtres);

  const maintenant = new Date();
  const { debut, fin } = plagePourPeriode(periode, maintenant);
  const dureeMs = fin.getTime() - debut.getTime();
  const debutPrecedent = new Date(debut.getTime() - dureeMs);
  const finPrecedent = debut;

  const conditionsSignees = conditionsAgregat("IND-08", contexte);
  const sommeOrdonnances = (dimensionLibre: string) =>
    conditionsSignees === null
      ? Promise.resolve(null)
      : prisma.agregatQuotidien
          .aggregate({
            where: { indicateur: "IND-08", dimensionLibre, date: { gte: debut, lt: fin }, ...conditionsSignees },
            _sum: { valeur: true },
          })
          .then((resultat) => resultat._sum.valeur ?? 0);

  const perimetre05 = perimetreEtablissementsActifs(filtres);
  const etablissementsActifsFiltrables = filtreApplicable("IND-05", filtres);
  const topDiagnosticsConditions = conditionsTopDiagnostics(contexte);

  const [
    consultationsActuel,
    consultationsPrecedent,
    patientsVusActuel,
    patientsVusPrecedent,
    casPaludismeActuel,
    casPaludismePrecedent,
    signeesActuel,
    delivrees30jActuel,
    vaccinationsActuel,
    vaccinationsPrecedent,
    lignesDiagnostics,
    lignesEtablissementsActifs,
    dateCalculLigne,
  ] = await Promise.all([
    sommeIndicateurNational("IND-01", debut, fin, contexte),
    sommeIndicateurNational("IND-01", debutPrecedent, finPrecedent, contexte),
    sommeIndicateurNational("IND-02", debut, fin, contexte),
    sommeIndicateurNational("IND-02", debutPrecedent, finPrecedent, contexte),
    sommeIndicateurNational("IND-04", debut, fin, contexte),
    sommeIndicateurNational("IND-04", debutPrecedent, finPrecedent, contexte),
    sommeOrdonnances("signees"),
    sommeOrdonnances("delivrees_30j"),
    sommeIndicateurNational("IND-10", debut, fin, contexte),
    sommeIndicateurNational("IND-10", debutPrecedent, finPrecedent, contexte),
    prisma.agregatQuotidien.groupBy({
      by: ["dimensionLibre"],
      where: { indicateur: "IND-03", date: { gte: debut, lt: fin }, dimensionLibre: { not: null }, ...topDiagnosticsConditions.conditions },
      _sum: { valeur: true },
    }),
    etablissementsActifsFiltrables
      ? prisma.agregatQuotidien.findFirst({
          where: { indicateur: "IND-05", ...perimetre05, date: { lt: fin } },
          orderBy: { date: "desc" },
          select: { date: true },
        })
      : Promise.resolve(null),
    prisma.agregatQuotidien.findFirst({
      where: { date: { gte: debut, lt: fin } },
      orderBy: { dateCalcul: "desc" },
      select: { dateCalcul: true },
    }),
  ]);

  const nonFiltrables: CleCarteNationale[] = [];
  if (consultationsActuel === null) nonFiltrables.push("consultations");
  if (patientsVusActuel === null) nonFiltrables.push("patientsVus");
  if (!etablissementsActifsFiltrables) nonFiltrables.push("etablissementsActifs");
  if (casPaludismeActuel === null) nonFiltrables.push("casPaludisme", "evolutionPaludisme");
  if (signeesActuel === null) nonFiltrables.push("tauxDelivrance");
  if (vaccinationsActuel === null) nonFiltrables.push("vaccinations");

  const totalSignees = signeesActuel ?? 0;
  const totalDelivrees30j = delivrees30jActuel ?? 0;

  let etablissementsActifs: VueNationalePilotage["etablissementsActifs"] = { actifs: 0, total: 0 };
  if (lignesEtablissementsActifs) {
    const lignesDuJour = await prisma.agregatQuotidien.findMany({
      where: { indicateur: "IND-05", ...perimetre05, date: lignesEtablissementsActifs.date },
      select: { dimensionLibre: true, valeur: true },
    });
    let totalActifs = 0;
    let total = 0;
    for (const ligne of lignesDuJour) {
      if (ligne.dimensionLibre === "actifs") totalActifs += ligne.valeur;
      else if (ligne.dimensionLibre === "total") total += ligne.valeur;
    }
    etablissementsActifs = { actifs: masquerPetitEffectif(totalActifs), total };
  }

  const topDiagnostics: DiagnosticTop[] = lignesDiagnostics
    .map((ligne) => ({
      code: ligne.dimensionLibre!,
      libelle: GROUPES_MALADIES.find((groupe) => groupe.code === ligne.dimensionLibre)?.libelle ?? ligne.dimensionLibre!,
      valeurBrute: ligne._sum.valeur ?? 0,
    }))
    .sort((a, b) => b.valeurBrute - a.valeurBrute)
    .slice(0, 10)
    .map((ligne) => ({ code: ligne.code, libelle: ligne.libelle, valeur: masquerPetitEffectif(ligne.valeurBrute) }));

  const evolutionHebdomadaire: PointHebdomadaireNational[] = [];
  for (let semaine = 11; semaine >= 0; semaine -= 1) {
    const finSemaine = new Date(Date.UTC(maintenant.getUTCFullYear(), maintenant.getUTCMonth(), maintenant.getUTCDate()));
    finSemaine.setUTCDate(finSemaine.getUTCDate() - semaine * 7);
    const debutSemaine = new Date(finSemaine);
    debutSemaine.setUTCDate(debutSemaine.getUTCDate() - 6);
    const finSemaineExclusive = new Date(finSemaine);
    finSemaineExclusive.setUTCDate(finSemaineExclusive.getUTCDate() + 1);

    const [consultationsSemaine, paludismeSemaine] = await Promise.all([
      sommeIndicateurNational("IND-01", debutSemaine, finSemaineExclusive, contexte),
      sommeIndicateurNational("IND-04", debutSemaine, finSemaineExclusive, contexte),
    ]);

    evolutionHebdomadaire.push({
      finSemaine: formaterDateISO(finSemaine),
      consultations: consultationsSemaine === null || (consultationsSemaine > 0 && consultationsSemaine < 5) ? null : consultationsSemaine,
      paludisme: paludismeSemaine === null || (paludismeSemaine > 0 && paludismeSemaine < 5) ? null : paludismeSemaine,
    });
  }

  return {
    periode,
    filtres,
    nonFiltrables,
    groupesSensiblesExclus: topDiagnosticsConditions.sensiblesExclus,
    consultations: carteNationale(consultationsActuel, consultationsPrecedent),
    patientsVus: carteNationale(patientsVusActuel, patientsVusPrecedent),
    etablissementsActifs,
    casPaludisme: carteNationale(casPaludismeActuel, casPaludismePrecedent),
    tauxDelivranceOrdonnances: masquerTaux(totalDelivrees30j, totalSignees),
    vaccinations: carteNationale(vaccinationsActuel, vaccinationsPrecedent),
    topDiagnostics,
    evolutionHebdomadaire,
    dateCalculPlusRecente: dateCalculLigne?.dateCalcul ?? null,
  };
}
