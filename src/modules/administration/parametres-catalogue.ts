/**
 * Catalogue des parametres numeriques administrables (F-ADM-07 du pack).
 * Module pur (pas de "use server", qui interdirait d'exporter des valeurs) :
 * les consommateurs importent la cle et sa valeur par defaut d'ici plutot que
 * de recopier une chaine ou un nombre. La lecture en base est dans
 * parametres-lecture.ts, la gestion (ecran, modification) dans parametres.ts.
 */

export const CLES_PARAMETRES = [
  "identity.code_verification_duree_minutes",
  "reference.duree_acces_jours",
  "urgence.limite_acces_24h",
  "partage.code_duree_minutes",
  "urgence.numero_appel",
  "audit.seuil_acces_urgence_7j",
  "audit.seuil_ip_multiples_1h",
  "audit.seuil_dossiers_distincts_jour",
] as const;

export type CleParametre = (typeof CLES_PARAMETRES)[number];

export interface DefinitionParametre {
  cle: CleParametre;
  valeurDefaut: number;
  borneMin: number;
  borneMax: number;
  description: string;
}

export const PARAMETRES_PAR_DEFAUT: readonly DefinitionParametre[] = [
  {
    cle: "identity.code_verification_duree_minutes",
    valeurDefaut: 10,
    borneMin: 5,
    borneMax: 60,
    description:
      "Duree de validite du code de verification envoye par e-mail a la connexion (lu a chaque envoi par src/modules/identity/verification-email.ts).",
  },
  {
    cle: "reference.duree_acces_jours",
    valeurDefaut: 30,
    borneMin: 1,
    borneMax: 90,
    description:
      "Duree de l'acces temporaire accorde a l'etablissement destinataire d'une reference de patient (lu a chaque reference par src/modules/reference/actions.ts).",
  },
  {
    cle: "urgence.limite_acces_24h",
    valeurDefaut: 5,
    borneMin: 1,
    borneMax: 20,
    description:
      "Nombre maximal d'acces d'urgence (bris de glace) autorises par professionnel sur 24 heures (lu a chaque acces par src/modules/urgence/actions.ts).",
  },
  {
    cle: "partage.code_duree_minutes",
    valeurDefaut: 10,
    borneMin: 5,
    borneMax: 60,
    description:
      "Duree de validite du code de partage temporaire du dossier patient (lu a chaque generation par src/modules/partage/actions.ts).",
  },
  {
    cle: "urgence.numero_appel",
    valeurDefaut: 0,
    borneMin: 0,
    borneMax: 99999999,
    description:
      "Numero d'urgence cite par l'assistant citoyen (0 = non renseigne : l'assistant renvoie alors vers les secours de la region et le centre de sante le plus proche). A renseigner par le ministere, jamais deduit (lu a chaque question par src/modules/ai/assistant-actions.ts).",
  },
  {
    cle: "audit.seuil_acces_urgence_7j",
    valeurDefaut: 3,
    borneMin: 1,
    borneMax: 20,
    description:
      "F-AUD-03 : au-dela de ce nombre d'acces d'urgence par professionnel sur 7 jours, un signalement d'anomalie est cree (lu a chaque execution horaire par src/modules/audit/detection-anomalies.ts).",
  },
  {
    cle: "audit.seuil_ip_multiples_1h",
    valeurDefaut: 3,
    borneMin: 1,
    borneMax: 20,
    description:
      "F-AUD-03 : au-dela de ce nombre d'adresses techniques differentes en 1 heure pour un meme compte, un signalement d'anomalie est cree.",
  },
  {
    cle: "audit.seuil_dossiers_distincts_jour",
    valeurDefaut: 60,
    borneMin: 10,
    borneMax: 500,
    description:
      "F-AUD-03 : au-dela de ce nombre de dossiers patients distincts ouverts par un professionnel dans la journee, un signalement d'anomalie est cree.",
  },
];

const PAR_CLE = new Map<string, DefinitionParametre>(PARAMETRES_PAR_DEFAUT.map((definition) => [definition.cle, definition]));

export function definitionParametre(cle: CleParametre): DefinitionParametre {
  const definition = PAR_CLE.get(cle);
  if (!definition) {
    throw new Error(`Parametre inconnu du catalogue : ${cle}`);
  }
  return definition;
}
