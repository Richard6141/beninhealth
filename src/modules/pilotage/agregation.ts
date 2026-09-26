import type { PrismaClient } from "@prisma/client";
import { classifierGroupeMaladie } from "./referentiel-groupes-maladies";
import { classifierTrancheAge, classifierTrancheAgePaludisme } from "./tranches-age";
import { listerJoursEtablissementsATraiter, marquerTachesTraitees } from "./file-taches";

/**
 * Moteur de calcul des agregats (F-PIL-07 du pack, chapitre 14). Recalcule
 * TOUJOURS un jour et un etablissement entiers, jamais de facon
 * incrementale (RG-PIL-60) : supprime puis reinsere les lignes de ce couple
 * dans une transaction, ce qui rend le recalcul idempotent et fait
 * disparaitre au recalcul suivant toute consultation retiree entre-temps
 * (RG-PIL-61 : saisieParErreur exclut deja la consultation de la requete
 * source ci-dessous).
 *
 * Cette iteration couvre IND-01 (consultations), IND-02 (patients vus),
 * IND-03 (top des diagnostics), IND-04 (cas de paludisme), IND-07
 * (rendez-vous), IND-08 (ordonnances), IND-09 (ruptures declarees), IND-10
 * (vaccinations) et IND-12 (qualite de saisie, partiel) a la grille (jour,
 * etablissement), calcules par recalculerJourEtablissement ; et IND-05
 * (etablissements actifs), IND-06 (professionnels actifs) et IND-13
 * (adoption) agregats systeme sans grain etablissement, calcules par
 * recalculerIndicateursSystemeJour.
 *
 * IND-11 (delai d'attente, arrivee -> demarrage de consultation) n'est PAS
 * implemente : ce depot n'a aucun champ d'horodatage d'arrivee, ni sur
 * RendezVous ni ailleurs (PriseEnChargeInfirmiere.date n'est pas non plus
 * une heure d'arrivee, c'est la date de creation de la fiche de soins).
 * Rien a agreger tant qu'un champ dedie n'existe pas cote Agent
 * Architecture ; inventer une approximation (ex. date de creation de la
 * consultation comme proxy d'arrivee) presenterait une donnee absente comme
 * mesuree, ce que ce projet s'interdit.
 *
 * Limite assumee sur IND-04 : le pack demande aussi "dont confirmes par test
 * (goutte epaisse ou TDR positif lie)". Ce depot n'a pas de lien fiable et
 * univoque entre une consultation et un ExamenMedical qui la confirmerait
 * (pas de champ dedie) ; construire cette correlation par une simple
 * proximite de date/patient serait un heuristique fragile presente comme
 * une donnee fiable, ce que ce projet s'interdit. Seul le compte total des
 * cas de paludisme (par diagnostic principal) est calcule pour l'instant ;
 * le sous-compte "confirmes par test" necessite un champ de liaison explicite
 * cote Agent Architecture avant d'etre implemente.
 *
 * Limite assumee sur IND-07 : le pack demande aussi les "absences", avec un
 * taux d'absence = absences / (honores + absences). `StatutRendezVous`
 * (src/types/domain-facility.ts) n'a que demande | confirme | termine |
 * annule : aucun statut ne distingue un rendez-vous simplement manque d'un
 * rendez-vous encore a venir ou jamais mis a jour. Deduire une "absence" par
 * inference (date passee, statut toujours confirme) serait un heuristique
 * non fiable presente comme une donnee reelle : seuls pris/honores/annules
 * sont calcules, "absences" et le taux associe necessitent un statut dedie
 * cote Agent Architecture. Le pack liste aussi "service" comme dimension :
 * absent du modele de donnees (RendezVous.motif est un texte libre), donc
 * non calcule non plus.
 *
 * Limite assumee sur IND-06 : seuls les actes de consultation (medecin,
 * infirmier) sont comptes comme "acte valide" pour l'instant. Les actes de
 * laboratoire, pharmacie et suivi communautaire ne sont pas encore inclus
 * (a ajouter dans une iteration suivante, meme principe d'extension que les
 * indicateurs ci-dessus).
 *
 * Limite assumee sur IND-05/IND-06 : la remontee territoriale s'arrete au
 * departement (+ national). Les zones sanitaires ne sont pas incluses : ce
 * depot ne seede que des zones "a affiner" par departement (voir
 * referentiel-territoire.ts), et publier un chiffre par zone donnerait une
 * fausse impression de precision sur un decoupage qui n'est pas encore le
 * vrai decoupage officiel.
 *
 * Limite assumee sur IND-10 : seules les vaccinations administrees en
 * etablissement (modele Vaccination, EtablissementSanitaire.id obligatoire)
 * sont comptees. Le pack distingue un lieu "terrain" (vaccination hors
 * etablissement, typiquement lors d'une visite de suivi communautaire) :
 * SuiviCommunautaire.typeVisite peut valoir "vaccination" mais ce depot n'y
 * enregistre ni le vaccin ni le numero de dose administres (juste des notes
 * en texte libre), donc rien de fiable a agreger pour ce lieu pour
 * l'instant.
 *
 * Limite assumee sur IND-12 : seule la part de consultations validees
 * tardivement (> 48h entre Consultation.date et dateValidation) est
 * calculee. La seconde moitie du pack, "part des arrivees verifiees sur
 * piece", depend du meme champ d'arrivee absent que IND-11 : non calculee,
 * meme raison.
 *
 * Limite assumee sur IND-13 : "comptes citoyens crees" et "comptes actifs
 * sur 30 jours" sont calcules au niveau national uniquement. La dimension
 * "territoire (commune de residence declaree)" du pack n'est pas calculable
 * : Patient (src/modules/patient) n'a aucun champ de commune de residence
 * declaree dans ce depot (uniquement une date de naissance, un sexe et des
 * donnees medicales) ; a ajouter cote Agent Architecture avant de
 * territorialiser cet indicateur.
 */

export const CODES_INDICATEURS_JOUR_ETABLISSEMENT = [
  "IND-01",
  "IND-02",
  "IND-03",
  "IND-04",
  "IND-07",
  "IND-08",
  "IND-09",
  "IND-10",
  "IND-12",
] as const;
export const CODES_INDICATEURS_SYSTEME_JOUR = ["IND-05", "IND-06", "IND-13"] as const;

const FENETRE_JOURS_ETABLISSEMENT_ACTIF = 7;
const FENETRE_JOURS_PROFESSIONNEL_ACTIF = 30;
const PROFESSIONS_COUVERTES_IND06 = ["medecin", "infirmier"] as const;
const JOURS_DELAI_DELIVRANCE_IND08 = 30;
const HEURES_SEUIL_VALIDATION_TARDIVE_IND12 = 48;
const JOURS_FENETRE_ADOPTION_ACTIF_IND13 = 30;

interface LigneAgregat {
  indicateur: string;
  sexe: string | null;
  trancheAge: string | null;
  dimensionLibre: string | null;
  valeur: number;
}

function debutEtFinDuJour(jour: Date): { debut: Date; fin: Date } {
  const debut = new Date(Date.UTC(jour.getUTCFullYear(), jour.getUTCMonth(), jour.getUTCDate()));
  const fin = new Date(debut);
  fin.setUTCDate(fin.getUTCDate() + 1);
  return { debut, fin };
}

interface TerritoireEtablissement {
  commune: { departementId: string } | null;
  zoneSanitaire: { departementId: string } | null;
}

/** Un etablissement sans commune ni zone sanitaire renseignee (champs facultatifs, voir schema.prisma) n'a pas de departement resoluble : exclu des agregats territorialises. */
function resoudreDepartementId(etablissement: TerritoireEtablissement): string | null {
  return etablissement.commune?.departementId ?? etablissement.zoneSanitaire?.departementId ?? null;
}

export async function recalculerJourEtablissement(
  prisma: PrismaClient,
  jour: Date,
  etablissementId: string,
): Promise<void> {
  const { debut, fin } = debutEtFinDuJour(jour);

  const consultations = await prisma.consultation.findMany({
    where: {
      etablissementId,
      // "terminee" designe la consultation validee dans ce depot (voir
      // schema.prisma, commentaire du modele Consultation).
      statut: "terminee",
      saisieParErreur: false,
      date: { gte: debut, lt: fin },
    },
    select: {
      id: true,
      patientId: true,
      conclusion: true,
      date: true,
      dateValidation: true,
      patient: { select: { sexe: true, dateNaissance: true } },
    },
  });

  const lignes: LigneAgregat[] = [];

  const compteursInd01 = new Map<string, number>();
  const patientsInd02 = new Map<string, Set<string>>();
  const compteursInd03 = new Map<string, number>();
  const compteursInd04 = new Map<string, number>();
  let validationsTardivesInd12 = 0;

  for (const consultation of consultations) {
    const { sexe, dateNaissance } = consultation.patient;
    const trancheAge = classifierTrancheAge(dateNaissance, consultation.date);
    const cleSexeTranche = `${sexe}|${trancheAge}`;

    compteursInd01.set(cleSexeTranche, (compteursInd01.get(cleSexeTranche) ?? 0) + 1);

    if (!patientsInd02.has(cleSexeTranche)) patientsInd02.set(cleSexeTranche, new Set());
    patientsInd02.get(cleSexeTranche)!.add(consultation.patientId);

    if (consultation.conclusion) {
      const groupe = classifierGroupeMaladie(consultation.conclusion);
      if (groupe) {
        // RG-PIL-05 : un groupe SENSITIVE n'est JAMAIS compte par etablissement.
        // Il est compte au niveau departement par recalculerSensiblesDepartementJour.
        if (!groupe.sensible) {
          const cleGroupe = `${groupe.code}|${sexe}|${trancheAge}`;
          compteursInd03.set(cleGroupe, (compteursInd03.get(cleGroupe) ?? 0) + 1);
        }

        if (groupe.code === "paludisme") {
          const trancheBinaire = classifierTrancheAgePaludisme(dateNaissance, consultation.date);
          compteursInd04.set(trancheBinaire, (compteursInd04.get(trancheBinaire) ?? 0) + 1);
        }
      }
    }

    if (consultation.dateValidation) {
      const heuresJusquaValidation =
        (consultation.dateValidation.getTime() - consultation.date.getTime()) / (1000 * 60 * 60);
      if (heuresJusquaValidation > HEURES_SEUIL_VALIDATION_TARDIVE_IND12) {
        validationsTardivesInd12 += 1;
      }
    }
  }

  for (const [cle, valeur] of compteursInd01) {
    const [sexe, trancheAge] = cle.split("|");
    lignes.push({ indicateur: "IND-01", sexe, trancheAge, dimensionLibre: null, valeur });
  }
  for (const [cle, ensemble] of patientsInd02) {
    const [sexe, trancheAge] = cle.split("|");
    lignes.push({ indicateur: "IND-02", sexe, trancheAge, dimensionLibre: null, valeur: ensemble.size });
  }
  for (const [cle, valeur] of compteursInd03) {
    const [dimensionLibre, sexe, trancheAge] = cle.split("|");
    lignes.push({ indicateur: "IND-03", sexe, trancheAge, dimensionLibre, valeur });
  }
  for (const [trancheAge, valeur] of compteursInd04) {
    lignes.push({ indicateur: "IND-04", sexe: null, trancheAge, dimensionLibre: null, valeur });
  }

  if (consultations.length > 0) {
    lignes.push({
      indicateur: "IND-12",
      sexe: null,
      trancheAge: null,
      dimensionLibre: "validees_tardivement",
      valeur: validationsTardivesInd12,
    });
    lignes.push({
      indicateur: "IND-12",
      sexe: null,
      trancheAge: null,
      dimensionLibre: "total_validees",
      valeur: consultations.length,
    });
  }

  // IND-07 : rendez-vous pris/honores/annules du jour, attribues a la date
  // planifiee du rendez-vous (pas a sa date de creation). Voir la limite
  // assumee documentee en tete de fichier : ni "absences" ni "service".
  const rendezVousDuJour = await prisma.rendezVous.findMany({
    where: { etablissementId, date: { gte: debut, lt: fin } },
    select: { statut: true },
  });
  if (rendezVousDuJour.length > 0) {
    let honores = 0;
    let annules = 0;
    for (const rendezVous of rendezVousDuJour) {
      if (rendezVous.statut === "termine") honores += 1;
      else if (rendezVous.statut === "annule") annules += 1;
    }
    lignes.push({ indicateur: "IND-07", sexe: null, trancheAge: null, dimensionLibre: "pris", valeur: rendezVousDuJour.length });
    lignes.push({ indicateur: "IND-07", sexe: null, trancheAge: null, dimensionLibre: "honores", valeur: honores });
    lignes.push({ indicateur: "IND-07", sexe: null, trancheAge: null, dimensionLibre: "annules", valeur: annules });
  }

  // IND-08 : ordonnances signees du jour (toute prescription non annulee,
  // creee directement "validee" dans ce depot, voir schema.prisma) et,
  // parmi elles, celles delivrees (totalement ou partiellement) dans le
  // delai de 30 jours prevu par le pack.
  const prescriptionsDuJour = await prisma.prescription.findMany({
    where: {
      consultation: { etablissementId },
      statut: { not: "annulee" },
      date: { gte: debut, lt: fin },
    },
    select: {
      date: true,
      delivrances: { where: { annulee: false }, select: { date: true } },
    },
  });
  if (prescriptionsDuJour.length > 0) {
    let delivreesDansDelai = 0;
    for (const prescription of prescriptionsDuJour) {
      const limiteDelai = new Date(prescription.date);
      limiteDelai.setUTCDate(limiteDelai.getUTCDate() + JOURS_DELAI_DELIVRANCE_IND08);
      if (prescription.delivrances.some((delivrance) => delivrance.date <= limiteDelai)) {
        delivreesDansDelai += 1;
      }
    }
    lignes.push({ indicateur: "IND-08", sexe: null, trancheAge: null, dimensionLibre: "signees", valeur: prescriptionsDuJour.length });
    lignes.push({ indicateur: "IND-08", sexe: null, trancheAge: null, dimensionLibre: "delivrees_30j", valeur: delivreesDansDelai });
  }

  // IND-09 : lignes non delivrees pour rupture de stock declaree ce jour,
  // par medicament (DCI = Medicament.principeActif). Le medicament compte
  // est celui PRESCRIT (lignePrescription.medicament), pas un medicament
  // delivre puisque rien n'a ete delivre pour ces lignes.
  const lignesRuptureDuJour = await prisma.ligneDelivrance.findMany({
    where: {
      motifNonDelivrance: "rupture_stock",
      delivrance: { etablissementId, annulee: false, date: { gte: debut, lt: fin } },
    },
    select: {
      lignePrescription: { select: { medicament: { select: { principeActif: true } } } },
    },
  });
  const compteursInd09 = new Map<string, number>();
  for (const ligne of lignesRuptureDuJour) {
    const dci = ligne.lignePrescription.medicament.principeActif;
    compteursInd09.set(dci, (compteursInd09.get(dci) ?? 0) + 1);
  }
  for (const [dci, valeur] of compteursInd09) {
    lignes.push({ indicateur: "IND-09", sexe: null, trancheAge: null, dimensionLibre: dci, valeur });
  }

  // IND-10 : doses de vaccination administrees en etablissement ce jour,
  // par vaccin et numero de dose (voir limite assumee documentee en tete de
  // fichier sur le lieu "terrain").
  const vaccinationsDuJour = await prisma.vaccination.findMany({
    where: { etablissementId, saisieParErreur: false, dateAdministration: { gte: debut, lt: fin } },
    select: { vaccin: true, numeroDose: true, dateAdministration: true, patient: { select: { dateNaissance: true } } },
  });
  const compteursInd10 = new Map<string, number>();
  for (const vaccination of vaccinationsDuJour) {
    const trancheAge = classifierTrancheAge(vaccination.patient.dateNaissance, vaccination.dateAdministration);
    const cle = `${vaccination.vaccin}:dose${vaccination.numeroDose}|${trancheAge}`;
    compteursInd10.set(cle, (compteursInd10.get(cle) ?? 0) + 1);
  }
  for (const [cle, valeur] of compteursInd10) {
    const [dimensionLibre, trancheAge] = cle.split("|");
    lignes.push({ indicateur: "IND-10", sexe: null, trancheAge, dimensionLibre, valeur });
  }

  await prisma.$transaction([
    prisma.agregatQuotidien.deleteMany({
      where: {
        date: debut,
        etablissementId,
        indicateur: { in: [...CODES_INDICATEURS_JOUR_ETABLISSEMENT] },
      },
    }),
    ...(lignes.length > 0
      ? [
          prisma.agregatQuotidien.createMany({
            data: lignes.map((ligne) => ({
              date: debut,
              etablissementId,
              indicateur: ligne.indicateur,
              sexe: ligne.sexe,
              trancheAge: ligne.trancheAge,
              dimensionLibre: ligne.dimensionLibre,
              valeur: ligne.valeur,
            })),
          }),
        ]
      : []),
  ]);
}

/**
 * RG-PIL-05 du pack : les donnees SENSITIVE (VIH, IST, troubles mentaux,
 * interruption de grossesse, violences, addictions) ne sont comptees qu'au
 * niveau departement ou national, jamais par etablissement ni par commune.
 * Cette fonction recalcule, pour un jour et un departement entiers, les seuls
 * groupes sensibles de IND-03, dans des lignes SANS etablissement
 * (etablissementId null, departementId renseigne). Meme principe
 * d'idempotence que recalculerJourEtablissement (RG-PIL-60) : suppression
 * puis reinsertion dans une transaction.
 *
 * Minimisation volontaire : ni sexe ni tranche d'age, seulement (jour,
 * departement, groupe). Un croisement supplementaire rendrait certaines
 * cellules quasi identifiantes dans un petit departement, et aucun ecran
 * n'a besoin de ce detail.
 *
 * Limite assumee : un etablissement sans commune ni zone sanitaire (donc sans
 * departement resoluble, voir resoudreDepartementId) ne contribue pas a ces
 * comptes, comme pour tous les agregats territorialises.
 */
export async function recalculerSensiblesDepartementJour(
  prisma: PrismaClient,
  jour: Date,
  departementId: string,
): Promise<void> {
  const { debut, fin } = debutEtFinDuJour(jour);

  // Meme priorite que resoudreDepartementId : la commune d'abord, la zone
  // sanitaire seulement si la commune n'est pas renseignee.
  const etablissements = await prisma.etablissementSanitaire.findMany({
    where: {
      OR: [{ commune: { departementId } }, { communeId: null, zoneSanitaire: { departementId } }],
    },
    select: { id: true },
  });

  const compteurs = new Map<string, number>();
  if (etablissements.length > 0) {
    const consultations = await prisma.consultation.findMany({
      where: {
        etablissementId: { in: etablissements.map((etablissement) => etablissement.id) },
        statut: "terminee",
        saisieParErreur: false,
        date: { gte: debut, lt: fin },
      },
      select: { conclusion: true },
    });

    for (const consultation of consultations) {
      if (!consultation.conclusion) continue;
      const groupe = classifierGroupeMaladie(consultation.conclusion);
      if (groupe?.sensible) {
        compteurs.set(groupe.code, (compteurs.get(groupe.code) ?? 0) + 1);
      }
    }
  }

  await prisma.$transaction([
    prisma.agregatQuotidien.deleteMany({
      where: { date: debut, etablissementId: null, departementId, indicateur: "IND-03" },
    }),
    ...(compteurs.size > 0
      ? [
          prisma.agregatQuotidien.createMany({
            data: [...compteurs].map(([dimensionLibre, valeur]) => ({
              date: debut,
              etablissementId: null,
              departementId,
              indicateur: "IND-03",
              sexe: null,
              trancheAge: null,
              dimensionLibre,
              valeur,
            })),
          }),
        ]
      : []),
  ]);
}

/** Departement d'un etablissement, ou null s'il n'a ni commune ni zone sanitaire renseignee. */
async function departementDeLEtablissement(prisma: PrismaClient, etablissementId: string): Promise<string | null> {
  const etablissement = await prisma.etablissementSanitaire.findUnique({
    where: { id: etablissementId },
    select: { commune: { select: { departementId: true } }, zoneSanitaire: { select: { departementId: true } } },
  });
  return etablissement ? resoudreDepartementId(etablissement) : null;
}

interface LigneAgregatSysteme {
  departementId: string | null;
  typeEtablissement: string | null;
  indicateur: string;
  dimensionLibre: string | null;
  valeur: number;
}

/**
 * Recalcule, pour un jour donne, les indicateurs sans grain etablissement :
 * IND-05 (etablissements actifs) et IND-06 (professionnels actifs). Meme
 * principe d'idempotence que recalculerJourEtablissement (RG-PIL-60),
 * transaction de suppression puis reinsertion, mais scope sur (date,
 * etablissementId: null) puisque ces lignes ne portent pas de dimension
 * etablissement.
 */
export async function recalculerIndicateursSystemeJour(prisma: PrismaClient, jour: Date): Promise<void> {
  const { debut, fin } = debutEtFinDuJour(jour);
  const lignes: LigneAgregatSysteme[] = [];

  // --- IND-05 : etablissements actifs (>= 1 consultation validee dans les
  // FENETRE_JOURS_ETABLISSEMENT_ACTIF derniers jours) / total, par type et
  // par territoire (national + departement).
  const etablissements = await prisma.etablissementSanitaire.findMany({
    select: {
      id: true,
      type: true,
      commune: { select: { departementId: true } },
      zoneSanitaire: { select: { departementId: true } },
    },
  });

  const debutFenetre7j = new Date(debut);
  debutFenetre7j.setUTCDate(debutFenetre7j.getUTCDate() - (FENETRE_JOURS_ETABLISSEMENT_ACTIF - 1));

  const consultationsRecentes = await prisma.consultation.findMany({
    where: { statut: "terminee", saisieParErreur: false, date: { gte: debutFenetre7j, lt: fin } },
    select: { etablissementId: true },
    distinct: ["etablissementId"],
  });
  const etablissementsActifsIds = new Set(consultationsRecentes.map((c) => c.etablissementId));

  interface CompteurActifTotal {
    actifs: number;
    total: number;
  }
  const parTypeNational = new Map<string, CompteurActifTotal>();
  const parTypeDepartement = new Map<string, CompteurActifTotal>(); // cle `${departementId}|${type}`

  for (const etablissement of etablissements) {
    const estActif = etablissementsActifsIds.has(etablissement.id);
    const departementId = resoudreDepartementId(etablissement);

    const compteurNational = parTypeNational.get(etablissement.type) ?? { actifs: 0, total: 0 };
    compteurNational.total += 1;
    if (estActif) compteurNational.actifs += 1;
    parTypeNational.set(etablissement.type, compteurNational);

    if (departementId) {
      const cle = `${departementId}|${etablissement.type}`;
      const compteurDepartement = parTypeDepartement.get(cle) ?? { actifs: 0, total: 0 };
      compteurDepartement.total += 1;
      if (estActif) compteurDepartement.actifs += 1;
      parTypeDepartement.set(cle, compteurDepartement);
    }
  }

  for (const [type, compteur] of parTypeNational) {
    lignes.push({ departementId: null, typeEtablissement: type, indicateur: "IND-05", dimensionLibre: "actifs", valeur: compteur.actifs });
    lignes.push({ departementId: null, typeEtablissement: type, indicateur: "IND-05", dimensionLibre: "total", valeur: compteur.total });
  }
  for (const [cle, compteur] of parTypeDepartement) {
    const [departementId, type] = cle.split("|");
    lignes.push({ departementId, typeEtablissement: type, indicateur: "IND-05", dimensionLibre: "actifs", valeur: compteur.actifs });
    lignes.push({ departementId, typeEtablissement: type, indicateur: "IND-05", dimensionLibre: "total", valeur: compteur.total });
  }

  // --- IND-06 : professionnels ayant valide au moins un acte dans les
  // FENETRE_JOURS_PROFESSIONNEL_ACTIF derniers jours, par profession et par
  // territoire. Limite assumee documentee en tete de fichier : seuls
  // medecin/infirmier sont couverts (actes de consultation).
  const debutFenetre30j = new Date(debut);
  debutFenetre30j.setUTCDate(debutFenetre30j.getUTCDate() - (FENETRE_JOURS_PROFESSIONNEL_ACTIF - 1));

  const consultationsProfessionnels = await prisma.consultation.findMany({
    where: { statut: "terminee", saisieParErreur: false, date: { gte: debutFenetre30j, lt: fin } },
    select: {
      professionnelId: true,
      professionnel: {
        select: {
          etablissement: {
            select: {
              commune: { select: { departementId: true } },
              zoneSanitaire: { select: { departementId: true } },
            },
          },
          user: { select: { roles: { select: { nom: true } } } },
        },
      },
    },
    distinct: ["professionnelId"],
  });

  const parProfessionNational = new Map<string, number>();
  const parProfessionDepartement = new Map<string, number>(); // cle `${departementId}|${profession}`

  for (const consultation of consultationsProfessionnels) {
    const nomsRoles = consultation.professionnel.user.roles.map((role) => role.nom);
    const profession = PROFESSIONS_COUVERTES_IND06.find((p) => nomsRoles.includes(p));
    if (!profession) continue;

    parProfessionNational.set(profession, (parProfessionNational.get(profession) ?? 0) + 1);

    const departementId = resoudreDepartementId(consultation.professionnel.etablissement);
    if (departementId) {
      const cle = `${departementId}|${profession}`;
      parProfessionDepartement.set(cle, (parProfessionDepartement.get(cle) ?? 0) + 1);
    }
  }

  for (const [profession, valeur] of parProfessionNational) {
    lignes.push({ departementId: null, typeEtablissement: null, indicateur: "IND-06", dimensionLibre: profession, valeur });
  }
  for (const [cle, valeur] of parProfessionDepartement) {
    const [departementId, profession] = cle.split("|");
    lignes.push({ departementId, typeEtablissement: null, indicateur: "IND-06", dimensionLibre: profession, valeur });
  }

  // --- IND-13 : comptes citoyens crees ce jour et comptes actifs sur les
  // FENETRE_JOURS_ADOPTION_ACTIF_IND13 derniers jours. National uniquement,
  // voir limite assumee documentee en tete de fichier (pas de commune de
  // residence declaree dans ce modele de donnees).
  const debutFenetreAdoption = new Date(debut);
  debutFenetreAdoption.setUTCDate(debutFenetreAdoption.getUTCDate() - (JOURS_FENETRE_ADOPTION_ACTIF_IND13 - 1));

  const [comptesCitoyensCrees, comptesCitoyensActifs30j] = await Promise.all([
    prisma.user.count({ where: { patient: { isNot: null }, dateCreation: { gte: debut, lt: fin } } }),
    prisma.user.count({ where: { patient: { isNot: null }, derniereConnexion: { gte: debutFenetreAdoption, lt: fin } } }),
  ]);
  lignes.push({ departementId: null, typeEtablissement: null, indicateur: "IND-13", dimensionLibre: "comptes_crees", valeur: comptesCitoyensCrees });
  lignes.push({ departementId: null, typeEtablissement: null, indicateur: "IND-13", dimensionLibre: "comptes_actifs_30j", valeur: comptesCitoyensActifs30j });

  await prisma.$transaction([
    prisma.agregatQuotidien.deleteMany({
      where: {
        date: debut,
        etablissementId: null,
        indicateur: { in: [...CODES_INDICATEURS_SYSTEME_JOUR] },
      },
    }),
    ...(lignes.length > 0
      ? [
          prisma.agregatQuotidien.createMany({
            data: lignes.map((ligne) => ({
              date: debut,
              etablissementId: null,
              departementId: ligne.departementId,
              typeEtablissement: ligne.typeEtablissement,
              indicateur: ligne.indicateur,
              sexe: null,
              trancheAge: null,
              dimensionLibre: ligne.dimensionLibre,
              valeur: ligne.valeur,
            })),
          }),
        ]
      : []),
  ]);
}

/**
 * Tache horaire (point 2 de F-PIL-07) : ne recalcule que les couples
 * (jour, etablissement) touches par un evenement publie depuis le dernier
 * passage, pas toute la base.
 */
export async function executerTacheHoraire(prisma: PrismaClient): Promise<{ joursTraites: number }> {
  const maintenant = new Date();
  const aTraiter = await listerJoursEtablissementsATraiter(prisma);
  const joursSystemeATraiter = new Set<string>();
  // RG-PIL-05 : un seul recalcul des groupes sensibles par (jour, departement),
  // pas un par etablissement touche.
  const joursDepartementsSensibles = new Map<string, { date: Date; departementId: string }>();

  for (const { date, etablissementId } of aTraiter) {
    // Cette iteration ne gere que les indicateurs a grille (jour, etablissement) ;
    // un evenement sans etablissement (ex. compte citoyen cree, IND-13) est ignore ici.
    if (!etablissementId) continue;
    await recalculerJourEtablissement(prisma, date, etablissementId);
    joursSystemeATraiter.add(date.toISOString());

    const departementId = await departementDeLEtablissement(prisma, etablissementId);
    if (departementId) {
      joursDepartementsSensibles.set(`${date.toISOString()}|${departementId}`, { date, departementId });
    }
  }

  for (const { date, departementId } of joursDepartementsSensibles.values()) {
    await recalculerSensiblesDepartementJour(prisma, date, departementId);
  }

  // IND-05/IND-06 ne dependent pas d'un etablissement precis : un seul
  // recalcul par jour touche suffit, pas un par etablissement.
  for (const cleJour of joursSystemeATraiter) {
    await recalculerIndicateursSystemeJour(prisma, new Date(cleJour));
  }

  await marquerTachesTraitees(prisma, maintenant);
  return { joursTraites: aTraiter.length };
}

/**
 * Tache nocturne (point 3 de F-PIL-07, 02h00) : filet de securite qui
 * recalcule les 90 derniers jours complets pour tous les etablissements,
 * independamment de la file de taches.
 */
export async function executerTacheNocturne(prisma: PrismaClient): Promise<{ joursTraites: number }> {
  const aujourdHui = new Date();
  aujourdHui.setUTCHours(0, 0, 0, 0);

  const etablissements = await prisma.etablissementSanitaire.findMany({
    select: {
      id: true,
      commune: { select: { departementId: true } },
      zoneSanitaire: { select: { departementId: true } },
    },
  });
  const departementIds = [
    ...new Set(
      etablissements
        .map((etablissement) => resoudreDepartementId(etablissement))
        .filter((departementId): departementId is string => departementId !== null),
    ),
  ];

  let joursTraites = 0;
  for (let decalage = 1; decalage <= 90; decalage++) {
    const jour = new Date(aujourdHui);
    jour.setUTCDate(jour.getUTCDate() - decalage);
    for (const { id } of etablissements) {
      await recalculerJourEtablissement(prisma, jour, id);
      joursTraites++;
    }
    // RG-PIL-05 : groupes sensibles recalcules par departement, pas par etablissement.
    for (const departementId of departementIds) {
      await recalculerSensiblesDepartementJour(prisma, jour, departementId);
    }
    // Un seul recalcul par jour pour IND-05/IND-06 (pas de grain etablissement).
    await recalculerIndicateursSystemeJour(prisma, jour);
  }
  return { joursTraites };
}
