/**
 * Assistant citoyen d'orientation (F-IA-02, chapitre 16 du pack). Module pur :
 * aucun acces base ni reseau, l'annuaire des etablissements est INJECTE. Il
 * ne lit jamais le dossier du patient et ne renvoie que le contenu valide de
 * assistant-faq.ts ou une liste d'etablissements publics.
 *
 * Ordre de decision, fail-closed cote sante : (1) question vide, (2) question
 * de sante (symptome, traitement, diagnostic, grossesse...) : reponse FIXE,
 * jamais d'avis medical (RG-IA-01), (3) recherche d'etablissement, (4) sujet de
 * la FAQ validee, (5) "je n'ai pas la reponse" avec des sujets proposes.
 */

import { FAQ, SUGGESTIONS_ASSISTANT, type EntreeFaq } from "./assistant-faq";

export const VERSION_BASE_ASSISTANT = "faq-v1";
export const MODELE_ASSISTANT = "faq-locale-v1";
export const LONGUEUR_MAX_QUESTION = 300;
/** Le controle de sante lit la question presque en entier : un signe cache apres la limite ne doit pas passer. */
const LONGUEUR_MAX_CONTROLE_SANTE = 2000;
export const LIMITE_QUESTIONS_PAR_HEURE = 60;
export const NOMBRE_MAX_ETABLISSEMENTS = 5;

export const MENTION_ASSISTANT = "Réponse automatique tirée d'une base de questions validée. Elle ne remplace pas un avis médical.";

export interface EtablissementTrouve {
  id: string;
  nom: string;
  type: string;
  localisation: string;
}

export interface DependancesAssistant {
  /** Numero d'urgence renseigne par l'administration, 0 si non renseigne. */
  numeroUrgence: number;
  /** Annuaire public : etablissements actifs dont le nom ou la localisation contient le terme. */
  rechercherEtablissements: (terme: string) => Promise<EtablissementTrouve[]>;
}

export type TypeReponseAssistant = "faq" | "annuaire" | "symptome" | "inconnu" | "vide";

export interface ReponseAssistant {
  type: TypeReponseAssistant;
  texte: string;
  lien: { libelle: string; href: string } | null;
  etablissements: EtablissementTrouve[];
  suggestions: string[];
  /** Identifiant du sujet de la FAQ, null hors FAQ. */
  sujet: string | null;
  /** Vrai pour une situation qui semble urgente : l'ecran la met en avant. */
  urgence: boolean;
}

const LIEN_ANNUAIRE = { libelle: "Trouver un établissement", href: "/etablissements" } as const;

/** Minuscules, sans accents ; apostrophes, tirets et ponctuation deviennent des espaces. */
export function normaliser(texte: string): string {
  return texte
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Un fragment se cherche en debut de mot ; "mot=" exige le mot entier. */
function contient(normalise: string, fragment: string): boolean {
  const exact = fragment.endsWith("=");
  const motif = exact ? fragment.slice(0, -1) : fragment;
  const debut = ` ${normalise}`;
  return exact ? ` ${debut} `.includes(` ${motif} `) : debut.includes(` ${motif}`);
}

const FRAGMENTS_SANTE = [
  "mal a", "mal au", "mal aux", "mal de", "mal=", "douleur", "fievre", "toux", "tousse", "vomi", "diarrhee", "saign", "nausee",
  "vertige", "malaise", "evanou", "convuls", "etouff", "respire", "respirer", "essouffl", "poitrine", "palpitation", "eruption",
  "boutons", "demangeaison", "gonfl", "fatigue", "maux", "symptom", "malade", "maladie", "infection", "paludisme", "palu=",
  "typhoide", "cholera", "diabete", "hypertension", "cancer", "vih", "sida=", "grave", "diagnostic", "diagnostiquer",
  "quel medicament", "quels medicaments", "medicament pour", "medicament contre", "medicaments pour", "medicaments contre",
  "prendre un medicament", "prendre des medicaments", "posologie", "dose", "doses", "surdos", "effets secondaires", "antibiotique",
  "paracetamol", "traitement pour", "traitement contre", "soigner", "guerir", "que prendre", "quoi prendre", "dois je prendre",
  "puis je prendre", "enceinte", "grossesse", "accouch", "avort", "blessure", "brulure", "morsure", "fracture", "empoison", "suicid",
  "triste", "depress", "angoiss", "stress", "anxi", "mourir", "ne mange pas", "ne dort pas", "pleure", "contagi",
  "ambulance", "numero d urgence", "numero des urgences", "samu", "urgence=", "urgences=",
] as const;

const FRAGMENTS_URGENCE = [
  "ne respire plus", "inconscient", "perdu connaissance", "convuls", "saigne beaucoup", "hemorragie", "douleur a la poitrine",
  "douleur dans la poitrine", "etouff", "empoison", "suicid", "crise cardiaque", "avc=",
] as const;

export function classerQuestionSante(question: string): { sante: boolean; urgence: boolean } {
  const normalise = normaliser(question);
  const urgence = FRAGMENTS_URGENCE.some((fragment) => contient(normalise, fragment));
  // Un signe d'urgence est toujours une question de sante, meme sans mot de la liste des symptomes.
  return { sante: urgence || FRAGMENTS_SANTE.some((fragment) => contient(normalise, fragment)), urgence };
}

/** Reponse fixe a toute question de sante (F-IA-02) : le numero d'urgence n'est cite que s'il est renseigne. */
export function reponseSymptome(numeroUrgence: number): string {
  const secours = numeroUrgence > 0 ? `appelez le ${numeroUrgence}` : "appelez les secours (le numéro d'urgence de votre région)";
  return `Je ne peux pas donner d'avis médical. En cas d'urgence, ${secours} ou rendez-vous au centre de santé le plus proche.`;
}

const TYPES_ETABLISSEMENT = [
  "hopital", "hopitaux", "centre de sante", "centres de sante", "clinique", "cliniques", "pharmacie", "pharmacies", "dispensaire",
  "maternite", "laboratoire", "laboratoires", "etablissement", "etablissements", "cabinet", "annuaire", "prise de sang", "analyse",
  "analyses", "radio", "radiographie", "echographie",
];
const MOTS_VACCINATION = ["vacciner", "vaccination", "vaccin", "vaccins"];
const INDICES_LOCALISATION = [
  "ou aller", "ou se", "ou puis je", "ou peut on", "ou trouver", "ou est", "ou sont", "ou y a t il", "trouver un", "trouver une",
  "trouver le", "trouver la", "chercher un", "chercher une", "cherche un", "cherche une", "pres de", "proche de", "a cote de",
  "il y a un", "il y a une", "adresse", "annuaire", "liste des", "liste de", "ou faire", "ou passer", "ou realiser", "y a t il",
  "existe t il",
];
const PREPOSITIONS_LIEU = new Set(["a", "au", "aux", "de", "d", "du", "dans", "sur", "vers", "en"]);
/** Mots qui ne designent pas un lieu : articles, politesse, types d'etablissement, verbes de la demande. */
const MOTS_A_IGNORER = new Set([
  "la", "le", "les", "l", "un", "une", "des", "ville", "quartier", "commune", "village", "mon", "ma", "mes", "chez", "moi", "ici",
  "svp", "stp", "merci", "s", "il", "vous", "plait", "pres", "proche", "cote", "se", "faire", "vacciner", "vaccin", "vaccination",
  "sante", "centre", "centres", "hopital", "hopitaux", "clinique", "cliniques", "pharmacie", "pharmacies", "laboratoire",
  "laboratoires", "etablissement", "etablissements", "dispensaire", "maternite", "cabinet", "prise", "sang", "analyse", "analyses",
  "radio", "radiographie", "echographie",
]);

/** Terme de lieu de la question (dernier groupe apres une preposition), en gardant accents et tirets d'origine. */
export function extraireLieu(question: string): string | null {
  const jetons = question
    .replace(/([dDlL])['’]/g, "$1 ")
    .split(/[\s,;:!?«»"()]+/)
    .filter((jeton) => jeton.length > 0);

  let derniere = -1;
  jetons.forEach((jeton, index) => {
    if (PREPOSITIONS_LIEU.has(normaliser(jeton))) derniere = index;
  });
  if (derniere < 0) return null;

  const apres = jetons.slice(derniere + 1).filter((jeton) => !MOTS_A_IGNORER.has(normaliser(jeton)));
  return apres.length > 0 ? apres.slice(0, 3).join(" ") : null;
}

function questionLocalisation(normalise: string): boolean {
  const cible = TYPES_ETABLISSEMENT.some((type) => contient(normalise, type)) || MOTS_VACCINATION.some((mot) => contient(normalise, mot));
  return cible && INDICES_LOCALISATION.some((indice) => contient(normalise, indice));
}

function meilleureEntreeFaq(normalise: string): EntreeFaq | null {
  let meilleure: EntreeFaq | null = null;
  let meilleurScore = 0;
  for (const entree of FAQ) {
    const nombreForts = entree.forts.filter((fragment) => contient(normalise, fragment)).length;
    const score = nombreForts * 2 + entree.faibles.filter((fragment) => contient(normalise, fragment)).length;
    // Au moins un declencheur fort : plusieurs mots courants seuls ("ou", "voir") ne designent jamais un sujet.
    if (nombreForts >= 1 && score >= 2 && score > meilleurScore) {
      meilleure = entree;
      meilleurScore = score;
    }
  }
  return meilleure;
}

/** Formules seules (sans question) : bonjour, merci... Une politesse ajoutee a une vraie question ne compte pas. */
const SALUTATIONS = new Set(["bonjour", "bonsoir", "salut", "coucou", "hello", "merci", "merci beaucoup", "ok merci", "d accord", "ok", "au revoir", "bonne journee"]);

const REPONSE_VIDE: ReponseAssistant = {
  type: "vide",
  texte: "Posez votre question, par exemple : « Comment prendre rendez-vous ? ».",
  lien: null,
  etablissements: [],
  suggestions: [...SUGGESTIONS_ASSISTANT],
  sujet: null,
  urgence: false,
};

async function repondreLocalisation(question: string, dependances: DependancesAssistant): Promise<ReponseAssistant> {
  const lieu = extraireLieu(question);
  let trouves: EtablissementTrouve[] = [];
  if (lieu) {
    trouves = await dependances.rechercherEtablissements(lieu);
    // Une formule de politesse ou un mot en trop peut gener : on retente avec le premier mot du lieu.
    const premierMot = lieu.split(" ")[0];
    if (trouves.length === 0 && premierMot !== lieu) trouves = await dependances.rechercherEtablissements(premierMot);
  }

  if (trouves.length > 0) {
    return {
      type: "annuaire",
      texte: `Voici des établissements actifs pour « ${lieu} ». Ouvrez une fiche pour son adresse et ses services.`,
      lien: LIEN_ANNUAIRE,
      etablissements: trouves.slice(0, NOMBRE_MAX_ETABLISSEMENTS),
      suggestions: [],
      sujet: null,
      urgence: false,
    };
  }

  return {
    type: "annuaire",
    texte: lieu
      ? `Je n'ai trouvé aucun établissement actif pour « ${lieu} ». L'annuaire permet de chercher par nom ou par lieu.`
      : "L'annuaire des établissements de santé actifs permet de chercher par nom ou par lieu.",
    lien: LIEN_ANNUAIRE,
    etablissements: [],
    suggestions: [],
    sujet: null,
    urgence: false,
  };
}

/** Repond a une question du citoyen. Ne renvoie jamais que du contenu valide (FAQ, annuaire public, message fixe). */
export async function repondreQuestion(question: string, dependances: DependancesAssistant): Promise<ReponseAssistant> {
  const propre = question.trim().slice(0, LONGUEUR_MAX_QUESTION);
  if (propre.length === 0) return REPONSE_VIDE;

  const sante = classerQuestionSante(question.slice(0, LONGUEUR_MAX_CONTROLE_SANTE));
  if (sante.sante) {
    return {
      type: "symptome",
      texte: reponseSymptome(dependances.numeroUrgence),
      lien: LIEN_ANNUAIRE,
      etablissements: [],
      suggestions: [],
      sujet: null,
      urgence: sante.urgence,
    };
  }

  const normalise = normaliser(propre);
  if (SALUTATIONS.has(normalise)) {
    return {
      type: "faq",
      texte: "Bonjour. Je réponds aux questions pratiques sur la plateforme : rendez-vous, ordonnances, examens, consentements, carte santé, compte et établissements. Je ne peux pas donner d'avis médical.",
      lien: null,
      etablissements: [],
      suggestions: [...SUGGESTIONS_ASSISTANT],
      sujet: "salutation",
      urgence: false,
    };
  }
  if (questionLocalisation(normalise)) return repondreLocalisation(propre, dependances);

  const entree = meilleureEntreeFaq(normalise);
  if (entree) {
    return { type: "faq", texte: entree.reponse, lien: entree.lien, etablissements: [], suggestions: [], sujet: entree.id, urgence: false };
  }

  return {
    type: "inconnu",
    texte: "Je n'ai pas la réponse à cette question, et je ne peux pas donner d'avis médical. Voici des sujets sur lesquels je peux vous aider.",
    lien: null,
    etablissements: [],
    suggestions: [...SUGGESTIONS_ASSISTANT],
    sujet: null,
    urgence: false,
  };
}
