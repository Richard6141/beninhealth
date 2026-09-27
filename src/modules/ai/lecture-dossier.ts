import { prisma } from "@/lib/prisma";
import { libelleParametre, uniteParametre } from "@/modules/laboratoire/referentiel-parametres-examens";
import type { IdentitePatient } from "./minimisation";
import { MOIS_HISTORIQUE_RESUME } from "./regles";
import { estTexteSensible, type DonneesDossierIa } from "./sources";

/**
 * Lecture des donnees d'un dossier pour le resume IA (F-IA-01 etape 3). Module
 * serveur sans "use server" : l'appelant (actions.ts) a deja verifie session,
 * role, fonctionnalite, consentement et limite d'usage.
 *
 * Ne lit que ce qui peut devenir un element source : jamais d'adresse, de
 * numero de dossier, de nom de professionnel ni d'etablissement. Les noms du
 * patient, de ses contacts d'urgence et des professionnels concernes ne sont
 * lus que pour etre RETIRES des textes libres (IdentitePatient.autresNoms).
 */

const MAX_LIGNES_PAR_TYPE = 60;

function listeDeTextes(valeur: string): string[] {
  try {
    const donnees: unknown = JSON.parse(valeur);
    return Array.isArray(donnees) ? donnees.filter((element): element is string => typeof element === "string") : [];
  } catch {
    return [];
  }
}

function nomsDesContactsUrgence(valeur: string): string[] {
  try {
    const donnees: unknown = JSON.parse(valeur);
    if (!Array.isArray(donnees)) return [];
    return donnees
      .map((element) => (typeof element === "object" && element !== null ? (element as { nom?: unknown }).nom : null))
      .filter((nom): nom is string => typeof nom === "string" && nom.trim().length > 0);
  } catch {
    return [];
  }
}

function ageEnAnnees(dateNaissance: Date, maintenant: Date): number {
  let age = maintenant.getUTCFullYear() - dateNaissance.getUTCFullYear();
  const anniversairePasse =
    maintenant.getUTCMonth() > dateNaissance.getUTCMonth() ||
    (maintenant.getUTCMonth() === dateNaissance.getUTCMonth() && maintenant.getUTCDate() >= dateNaissance.getUTCDate());
  if (!anniversairePasse) age -= 1;
  return Math.max(0, age);
}

interface ParametreStocke {
  code?: unknown;
  valeur?: unknown;
  unite?: unknown;
  indicateur?: unknown;
}

function parametresDeExamen(valeur: unknown): DonneesDossierIa["examens"][number]["parametres"] {
  if (!Array.isArray(valeur)) return [];
  const parametres: DonneesDossierIa["examens"][number]["parametres"][number][] = [];
  for (const element of valeur as ParametreStocke[]) {
    if (typeof element?.code !== "string" || typeof element.valeur !== "number" || typeof element.indicateur !== "string") continue;
    parametres.push({
      libelle: libelleParametre(element.code),
      valeur: element.valeur,
      unite: typeof element.unite === "string" ? element.unite : uniteParametre(element.code),
      indicateur: element.indicateur,
    });
  }
  return parametres;
}

export interface DossierPourIa {
  donnees: DonneesDossierIa;
  identite: IdentitePatient;
}

/** Retourne null si le patient n'existe pas. */
export async function lireDossierPourIa(patientId: string, maintenant: Date = new Date()): Promise<DossierPourIa | null> {
  const patient = await prisma.patient.findUnique({
    where: { id: patientId },
    select: {
      identifiantSante: true,
      dateNaissance: true,
      sexe: true,
      allergies: true,
      antecedents: true,
      maladiesChroniques: true,
      contactsUrgence: true,
      user: { select: { nom: true, prenom: true, telephone: true } },
    },
  });
  if (!patient) return null;

  const debutFenetre = new Date(maintenant);
  debutFenetre.setUTCMonth(debutFenetre.getUTCMonth() - MOIS_HISTORIQUE_RESUME);

  const [consultations, prescriptions, examens, vaccinations] = await Promise.all([
    prisma.consultation.findMany({
      where: { patientId, statut: "terminee", saisieParErreur: false, date: { gte: debutFenetre } },
      select: {
        id: true,
        date: true,
        motif: true,
        conclusion: true,
        tensionSystolique: true,
        tensionDiastolique: true,
        professionnel: { select: { user: { select: { nom: true, prenom: true } } } },
      },
      orderBy: { date: "desc" },
      take: MAX_LIGNES_PAR_TYPE,
    }),
    prisma.prescription.findMany({
      where: { patientId, statut: { in: ["validee", "delivree_partiellement", "delivree"] }, date: { gte: debutFenetre } },
      select: {
        date: true,
        consultation: { select: { motif: true, conclusion: true, saisieParErreur: true } },
        lignes: { select: { posologie: true, dureeTraitementJours: true, medicament: { select: { nom: true } } } },
      },
      orderBy: { date: "desc" },
      take: MAX_LIGNES_PAR_TYPE,
    }),
    prisma.examenMedical.findMany({
      where: { patientId, statut: "termine", date: { gte: debutFenetre } },
      select: {
        date: true,
        typeExamen: true,
        sensible: true,
        resultatsParametres: true,
        consultation: { select: { motif: true, conclusion: true } },
      },
      orderBy: { date: "desc" },
      take: MAX_LIGNES_PAR_TYPE,
    }),
    prisma.vaccination.findMany({
      where: { patientId, saisieParErreur: false, dateAdministration: { gte: debutFenetre } },
      select: { vaccin: true, numeroDose: true, dateAdministration: true },
      orderBy: { dateAdministration: "desc" },
      take: MAX_LIGNES_PAR_TYPE,
    }),
  ]);

  // Une prescription ou un examen issu d'une consultation sensible en revele l'objet (traitement, bilan) : ecarte comme elle (RG-IA-05).
  const consultationSensible = (consultation: { motif: string; conclusion: string } | null) =>
    consultation !== null && estTexteSensible(`${consultation.motif} ${consultation.conclusion}`);

  const autresNoms = [
    ...nomsDesContactsUrgence(patient.contactsUrgence),
    ...consultations.flatMap((consultation) => [consultation.professionnel.user.nom, consultation.professionnel.user.prenom]),
  ];

  return {
    identite: {
      nom: patient.user.nom,
      prenom: patient.user.prenom,
      identifiantSante: patient.identifiantSante,
      telephone: patient.user.telephone,
      autresNoms,
    },
    donnees: {
      dateReference: maintenant,
      age: ageEnAnnees(patient.dateNaissance, maintenant),
      sexe: patient.sexe,
      allergies: listeDeTextes(patient.allergies),
      antecedents: listeDeTextes(patient.antecedents),
      maladiesChroniques: listeDeTextes(patient.maladiesChroniques),
      traitements: prescriptions
        .filter((prescription) => !prescription.consultation.saisieParErreur && !consultationSensible(prescription.consultation))
        .map((prescription) => ({
          date: prescription.date,
          lignes: prescription.lignes.map((ligne) => ({
            medicament: ligne.medicament.nom,
            posologie: ligne.posologie,
            dureeJours: ligne.dureeTraitementJours,
          })),
        })),
      consultations: consultations.map((consultation) => ({
        date: consultation.date,
        motif: consultation.motif,
        conclusion: consultation.conclusion,
        tensionSystolique: consultation.tensionSystolique,
        tensionDiastolique: consultation.tensionDiastolique,
      })),
      examens: examens.map((examen) => ({
        date: examen.date,
        typeExamen: examen.typeExamen,
        sensible: examen.sensible || consultationSensible(examen.consultation),
        parametres: parametresDeExamen(examen.resultatsParametres),
      })),
      vaccinations: vaccinations.map((vaccination) => ({
        date: vaccination.dateAdministration,
        vaccin: vaccination.vaccin,
        numeroDose: vaccination.numeroDose,
      })),
    },
  };
}
