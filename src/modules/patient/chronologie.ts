"use server";

/**
 * Chronologie unifiee du dossier citoyen (F-CIT-03 du pack) : fusionne les
 * lectures deja existantes de chaque module proprietaire (consultation,
 * prescription, laboratoire, vaccination, document), du plus recent au plus
 * ancien, avec filtres (type, annee) et pagination. Meme principe de
 * composition que src/modules/patient/tableau-de-bord.ts : aucune lecture
 * Prisma propre ici, chaque module reste seul proprietaire de ses regles
 * d'acces (Zero Trust deja applique par chacun).
 *
 * Perimetre reduit assume : la pagination "20 par page" du pack recharge
 * ici une page de la liste DEJA ENTIEREMENT CHARGEE et fusionnee en memoire
 * (chaque module renvoie l'historique complet du patient connecte, jamais
 * un curseur reel), plutot qu'un vrai curseur traversant cinq sources
 * heterogenes. Adapte a la taille reelle d'un dossier personnel (des
 * dizaines d'elements, jamais un flux) ; a revoir si ce depot construit un
 * jour une vraie pagination par curseur multi-source. Le filtre
 * "etablissement" du pack n'est pas repris : consultation et document ne
 * portent pas encore le nom de l'etablissement dans leur resume (a ajouter
 * par leur module proprietaire).
 *
 * RG-CIT-20 : un resultat de laboratoire marque sensible et non encore
 * libere par le professionnel n'affiche jamais son contenu, seulement "Un
 * resultat vous sera communique par votre medecin" (deja garanti en amont
 * par getMesExamens qui renvoie resultat/dateResultat a null dans ce cas :
 * ce module ne fait que choisir le bon libelle, jamais ne contourne ce
 * masquage).
 * RG-CIT-22 : un element "saisi par erreur" / "retire" apparait barre, avec
 * la mention de retrait (ce module compose l'indicateur "retire" a partir
 * du champ propre a chaque type, jamais une nouvelle donnee).
 */

import { getSession } from "@/lib/session";
import { getMesConsultations, type ConsultationResume } from "@/modules/clinical/actions";
import { getMesDocuments, type DocumentResume } from "@/modules/document/actions";
import { getMesExamens, type ExamenResume } from "@/modules/laboratoire/actions";
import { getMesPrescriptions, type PrescriptionResume } from "@/modules/prescription/actions";
import { getMesVaccinations, type VaccinationResume } from "@/modules/vaccination/actions";
import { NOMBRE_ELEMENTS_PAR_PAGE, type TypeElementChronologie } from "./chronologie-catalogue";

export interface ElementChronologie {
  type: TypeElementChronologie;
  id: string;
  date: string; // ISO, date de tri (voir le commentaire par type ci-dessous)
  titre: string;
  soustitre: string;
  /** Lien vers le detail (consultation) ou l'ecran existant du type (les autres types). */
  lien: string;
  /** RG-CIT-22 : vrai si l'element est barre (saisi par erreur / retire / annule). */
  retire: boolean;
  /** Texte "Retire le [date] par [professionnel] : [motif]" pret a afficher, ou null si non retire ou motif absent. */
  mentionRetrait: string | null;
}

export interface FiltresChronologie {
  type?: TypeElementChronologie;
  annee?: number;
  page?: number;
}

export interface PageChronologie {
  elements: ElementChronologie[];
  page: number;
  nombrePages: number;
  totalElements: number;
  /** Annees disponibles dans la chronologie complete (avant filtre), pour peupler le selecteur "Annee". */
  anneesDisponibles: number[];
}

function anneeDe(dateISO: string): number {
  return new Date(dateISO).getFullYear();
}

function depuisConsultation(consultation: ConsultationResume): ElementChronologie {
  return {
    type: "consultation",
    id: consultation.id,
    date: consultation.date,
    titre: consultation.motif,
    soustitre: consultation.professionnelNomComplet ? `Consultation avec ${consultation.professionnelNomComplet}` : "Consultation",
    lien: `/app/patient/dossier/consultation/${consultation.id}`,
    retire: consultation.saisieParErreur,
    mentionRetrait:
      consultation.saisieParErreur && consultation.motifRetrait
        ? `Retiree : ${consultation.motifRetrait}`
        : null,
  };
}

function depuisPrescription(prescription: PrescriptionResume): ElementChronologie {
  const retire = prescription.statut === "annulee" || prescription.statut === "arretee";
  return {
    type: "ordonnance",
    id: prescription.id,
    date: prescription.date,
    titre: `Ordonnance ${prescription.numero}`,
    soustitre: prescription.medecinNomComplet ? `Prescrite par ${prescription.medecinNomComplet}` : "Ordonnance",
    lien: "/app/patient/prescriptions",
    retire,
    mentionRetrait: prescription.statut === "annulee" ? "Annulee" : prescription.statut === "arretee" ? "Arretee" : null,
  };
}

/** RG-CIT-20 : un resultat non communicable au patient (sensible et non annonce) n'affiche jamais son contenu. */
function libelleResultatExamen(examen: ExamenResume): string {
  if (examen.statut !== "termine") return "Examen en attente de resultat";
  if (examen.sensible && !examen.resultatAnnonceAuPatient) return "Un resultat vous sera communique par votre medecin";
  return "Resultat disponible";
}

function depuisExamen(examen: ExamenResume): ElementChronologie {
  return {
    type: "resultat",
    id: examen.id,
    date: examen.dateResultat ?? examen.date,
    titre: examen.typeExamen,
    soustitre: libelleResultatExamen(examen),
    lien: "/app/patient/examens",
    retire: examen.statut === "annule",
    mentionRetrait: examen.statut === "annule" ? "Examen annule" : null,
  };
}

function depuisVaccination(vaccination: VaccinationResume): ElementChronologie {
  return {
    type: "vaccination",
    id: vaccination.id,
    date: vaccination.dateAdministration,
    titre: `${vaccination.vaccin} (dose ${vaccination.numeroDose})`,
    soustitre: vaccination.lieu === "campagne" ? "Campagne de vaccination" : vaccination.etablissementNom,
    lien: "/app/patient/dossier",
    retire: vaccination.saisieParErreur,
    mentionRetrait:
      vaccination.saisieParErreur && vaccination.motifRetrait ? `Retiree : ${vaccination.motifRetrait}` : null,
  };
}

function depuisDocument(document: DocumentResume): ElementChronologie {
  return {
    type: "document",
    id: document.id,
    date: document.dateDocument,
    titre: document.titre,
    soustitre: `Ajoute par ${document.auteurNomComplet}`,
    lien: `/api/documents/${document.id}`,
    retire: document.retirePourErreur,
    mentionRetrait:
      document.retirePourErreur && document.motifRetrait ? `Retire : ${document.motifRetrait}` : null,
  };
}

/**
 * Chronologie complete et fusionnee (avant filtre/pagination), du plus
 * recent au plus ancien. Fonction interne : jamais exportee "use server"
 * telle quelle (une page entiere non filtree serait une lecture excessive
 * exposee sans besoin), voir getChronologieDossier ci-dessous.
 */
async function chronologieComplete(): Promise<ElementChronologie[]> {
  const [consultations, prescriptions, examens, vaccinations, documents] = await Promise.all([
    getMesConsultations(),
    getMesPrescriptions(),
    getMesExamens(),
    getMesVaccinations(),
    getMesDocuments(),
  ]);

  const elements: ElementChronologie[] = [
    ...consultations.map(depuisConsultation),
    ...prescriptions.map(depuisPrescription),
    ...examens.map(depuisExamen),
    ...vaccinations.map(depuisVaccination),
    ...documents.map(depuisDocument),
  ];

  return elements.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

/**
 * Page filtree de la chronologie du dossier (F-CIT-03). Chaque appel
 * recompose la chronologie complete (voir la limite assumee en tete de
 * fichier) puis filtre et pagine en memoire : le filtre par type ou par
 * annee ne demande donc aucune lecture supplementaire.
 */
export async function getChronologieDossier(filtres: FiltresChronologie = {}): Promise<PageChronologie> {
  // Point d'entree "use server" a part entiere (atteignable par POST) : verifie
  // sa propre session, meme si chaque fonction composee refait deja la sienne
  // (convention de ce depot, voir src/security/service-guard.test.ts).
  if (!(await getSession())) {
    return { elements: [], page: 1, nombrePages: 1, totalElements: 0, anneesDisponibles: [] };
  }

  const complete = await chronologieComplete();
  const anneesDisponibles = [...new Set(complete.map((element) => anneeDe(element.date)))].sort((a, b) => b - a);

  const filtres_ = complete.filter((element) => {
    if (filtres.type && element.type !== filtres.type) return false;
    if (filtres.annee && anneeDe(element.date) !== filtres.annee) return false;
    return true;
  });

  const totalElements = filtres_.length;
  const nombrePages = Math.max(1, Math.ceil(totalElements / NOMBRE_ELEMENTS_PAR_PAGE));
  const page = Math.min(Math.max(1, Math.trunc(filtres.page ?? 1)), nombrePages);
  const debut = (page - 1) * NOMBRE_ELEMENTS_PAR_PAGE;

  return {
    elements: filtres_.slice(debut, debut + NOMBRE_ELEMENTS_PAR_PAGE),
    page,
    nombrePages,
    totalElements,
    anneesDisponibles,
  };
}

export interface ConsultationDetailPourPatient {
  consultation: ConsultationResume;
  /** Ordonnances liees a cette consultation (F-CIT-03 : "ordonnance liee"). */
  prescriptions: PrescriptionResume[];
  /** Examens demandes lors de cette consultation (F-CIT-03 : "analyses demandees"). */
  examens: ExamenResume[];
}

/**
 * Detail d'une consultation vu par le patient (F-CIT-03) : diagnostic en
 * langage courant (ConsultationResume.diagnosticPrincipalLibelle, deja un
 * libelle simplifie du referentiel CIM-10, jamais le seul code), ordonnance
 * liee, analyses demandees. Les observations cliniques reservees ne sont
 * jamais exposees ici : ConsultationResume.observations est deja vide pour
 * un patient (RG-CLI-54, voir getMesConsultations). Composition pure de
 * lectures deja existantes : aucune lecture Prisma propre, Zero Trust deja
 * applique par chacune (le patient ne voit jamais la consultation d'un
 * autre, meme avec un id devine).
 */
export async function getMaConsultationDetail(consultationId: string): Promise<ConsultationDetailPourPatient | null> {
  if (!(await getSession())) {
    return null;
  }

  const [consultations, prescriptions, examens] = await Promise.all([
    getMesConsultations(),
    getMesPrescriptions(),
    getMesExamens(),
  ]);

  const consultation = consultations.find((candidate) => candidate.id === consultationId);

  if (!consultation) {
    return null;
  }

  return {
    consultation,
    prescriptions: prescriptions.filter((prescription) => prescription.consultationId === consultationId),
    examens: examens.filter((examen) => examen.consultationId === consultationId),
  };
}
