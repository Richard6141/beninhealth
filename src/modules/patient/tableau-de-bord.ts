"use server";

/**
 * Compositions propres au tableau de bord citoyen (F-CIT-02 du pack) qui
 * n'ont pas encore de source unique : "Alertes importantes" et "Derniers
 * documents". Ce module ne lit rien directement en base : il compose les
 * lectures deja existantes de chaque module proprietaire (notification,
 * transfert, prescription, laboratoire, document), chacune deja Zero Trust
 * (derivee de getSession(), jamais d'id en parametre). Pas de nouveau modele.
 *
 * Perimetre reduit assume : le pack impose aussi un selecteur de personne
 * (moi / personnes a charge) permanent dans l'en-tete de tout l'espace
 * citoyen (F-CIT-08). Deja documente comme hors perimetre dans
 * src/modules/proches/actions.ts (un ecran dedie /app/patient/proches/[id]
 * plutot qu'une bascule globale) : ce module ne le reintroduit pas.
 */

import { getSession } from "@/lib/session";
import { getMesDocuments } from "@/modules/document/actions";
import { getMesExamens } from "@/modules/laboratoire/actions";
import { getMesNotifications } from "@/modules/notification/actions";
import { getMesPrescriptions } from "@/modules/prescription/actions";
import { getDemandesAccesRecues } from "@/modules/transfert/demandes-patient";

/** Les cinq types d'alerte du pack (F-CIT-02, section "Alertes importantes"). */
export type TypeAlerteImportante =
  | "resultat_disponible"
  | "rendez_vous_annule"
  | "acces_urgence"
  | "consentement_demande"
  | "profil_incomplet";

export interface AlerteImportante {
  type: TypeAlerteImportante;
  message: string;
  lien: string;
  date: string; // ISO
}

/** Type technique de Notification.type (voir notification/types-notification.ts) -> type d'alerte du tableau de bord. */
const TYPES_NOTIFICATION_ALERTE: Readonly<Record<string, TypeAlerteImportante>> = {
  resultat_examen_disponible: "resultat_disponible",
  rendez_vous_annule_par_etablissement: "rendez_vous_annule",
  rendez_vous_annule_fermeture_etablissement: "rendez_vous_annule",
  acces_urgence: "acces_urgence",
};

const LIEN_PAR_DEFAUT: Readonly<Record<TypeAlerteImportante, string>> = {
  resultat_disponible: "/app/patient/examens",
  rendez_vous_annule: "/app/patient/rendez-vous",
  acces_urgence: "/app/patient/acces",
  consentement_demande: "/app/patient/demandes-acces",
  profil_incomplet: "/app/patient/dossier",
};

const NOMBRE_ALERTES_MAX = 5;

/**
 * Alertes importantes du tableau de bord, les plus recentes en premier.
 * "profilIncomplet" est calcule par l'appelant a partir du dossier deja lu
 * pour la page (evite une deuxieme lecture du meme dossier ici).
 *
 * Trois types viennent d'une notification NON LUE (resultat disponible,
 * rendez-vous annule par l'etablissement, acces d'urgence realise sur le
 * dossier) : une alerte deja lue ailleurs (centre de notifications) ne
 * s'affiche plus ici, coherent avec la cloche de notifications. Le type
 * "consentement_demande" vient directement des demandes en attente
 * (getDemandesAccesRecues), un etat reel plutot qu'un simple evenement passe :
 * une demande deja traitee (acceptee/refusee) disparait immediatement, meme
 * si sa notification n'a pas ete marquee lue.
 */
export async function getAlertesImportantes(profilIncomplet: boolean): Promise<AlerteImportante[]> {
  // Point d'entree "use server" a part entiere (atteignable par POST) : verifie
  // sa propre session, meme si chaque fonction composee ci-dessous refait deja
  // le meme controle (convention de ce depot, voir src/security/service-guard.test.ts).
  if (!(await getSession())) {
    return [];
  }

  const [{ notifications }, demandesAcces] = await Promise.all([
    getMesNotifications(),
    getDemandesAccesRecues(),
  ]);

  const alertes: AlerteImportante[] = [];

  for (const notification of notifications) {
    if (notification.lu) continue;

    const type = TYPES_NOTIFICATION_ALERTE[notification.type];
    if (!type) continue;

    alertes.push({
      type,
      message: notification.message,
      lien: notification.lien ?? LIEN_PAR_DEFAUT[type],
      date: notification.date,
    });
  }

  if (demandesAcces.length > 0) {
    const laPlusRecente = demandesAcces[0];
    alertes.push({
      type: "consentement_demande",
      message:
        demandesAcces.length === 1
          ? `${laPlusRecente.demandeurNomComplet} (${laPlusRecente.etablissementNom}) demande l'accès à votre dossier.`
          : `${demandesAcces.length} demandes d'accès à votre dossier sont en attente.`,
      lien: LIEN_PAR_DEFAUT.consentement_demande,
      date: laPlusRecente.dateCreation,
    });
  }

  // "Profil incomplet" n'est pas un evenement date : trie APRES les alertes
  // reelles (plus recente d'abord), jamais mele a leur tri par date (une date
  // artificielle "maintenant" l'aurait fait passer, a tort, devant une alerte
  // recente mais reelle comme un acces d'urgence).
  const alertesTriees = alertes.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  if (profilIncomplet) {
    alertesTriees.push({
      type: "profil_incomplet",
      message: "Votre profil est incomplet : complétez-le pour une prise en charge optimale.",
      lien: LIEN_PAR_DEFAUT.profil_incomplet,
      date: new Date().toISOString(),
    });
  }

  return alertesTriees.slice(0, NOMBRE_ALERTES_MAX);
}

export type TypeDocumentTableauDeBord = "ordonnance" | "resultat" | "compte_rendu";

export interface DocumentTableauDeBord {
  type: TypeDocumentTableauDeBord;
  titre: string;
  soustitre: string;
  date: string; // ISO
  lien: string;
}

const NOMBRE_DERNIERS_DOCUMENTS = 3;

/**
 * "Derniers documents" du tableau de bord : les 3 plus recents, tous types
 * confondus (ordonnance, resultat, compte rendu), comme l'impose le pack.
 * Un resultat d'examen non encore disponible pour le patient (masque par
 * getMesExamens, RG-LAB-02/41, RG-CIT-20) a sa dateResultat a null : il
 * n'apparait donc jamais ici tant qu'il n'est pas reellement communicable.
 * Un document retire pour erreur (RG-CLI-113) est exclu.
 */
export async function getDerniersDocuments(): Promise<DocumentTableauDeBord[]> {
  // Meme convention que getAlertesImportantes ci-dessus : controle direct,
  // meme si chaque fonction composee refait deja le sien.
  if (!(await getSession())) {
    return [];
  }

  const [prescriptions, examens, documents] = await Promise.all([
    getMesPrescriptions(),
    getMesExamens(),
    getMesDocuments(),
  ]);

  const elements: DocumentTableauDeBord[] = [
    ...prescriptions.map((prescription) => ({
      type: "ordonnance" as const,
      titre: `Ordonnance ${prescription.numero}`,
      soustitre: prescription.consultationMotif,
      date: prescription.date,
      lien: "/app/patient/prescriptions",
    })),
    ...examens
      .filter((examen) => examen.dateResultat !== null)
      .map((examen) => ({
        type: "resultat" as const,
        titre: examen.typeExamen,
        soustitre: examen.laboratoireNom,
        // dateResultat non nul par le filtre ci-dessus.
        date: examen.dateResultat as string,
        lien: "/app/patient/examens",
      })),
    ...documents
      .filter((document) => !document.retirePourErreur)
      .map((document) => ({
        type: "compte_rendu" as const,
        titre: document.titre,
        soustitre: document.auteurNomComplet,
        date: document.dateDocument,
        lien: "/app/patient/dossier",
      })),
  ];

  return elements
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, NOMBRE_DERNIERS_DOCUMENTS);
}
