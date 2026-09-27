/**
 * Adaptateur de fournisseur d'IA (chapitre 16.2 du pack) : le code n'appelle
 * jamais un fournisseur directement, il passe par cette interface unique.
 * Module pur (pas de "use server").
 *
 * Trois implementations, AUCUNE n'envoie de donnee hors du serveur :
 * - FournisseurDesactive : refuse tout appel (etat par defaut, sur).
 * - FournisseurReglesLocales : resume deterministe par regles, sans modele de
 *   langage, calcule localement a partir des seuls elements etiquetes recus.
 * - FournisseurFactice : reponse predefinie, pour les tests et la demonstration
 *   hors ligne (chapitre 16.2).
 * Un fournisseur externe (modele de langage par API) n'existe PAS dans ce
 * depot : il exigerait l'autorisation de l'APDP et un contrat de sous-traitance
 * (RG-IA-03) ; le brancher revient a ajouter une implementation de cette
 * interface derriere un drapeau desactive.
 */

import { LIBELLES_TYPE_ELEMENT, NOMBRE_MAX_PUCES, type TypeElement } from "./regles";

export interface RequeteIa {
  system: string;
  input: string;
  maxTokens: number;
}

export interface ReponseIa {
  texte: string;
  /** Identifiant du modele ou du jeu de regles, journalise (RG-IA-08). */
  modele: string;
}

export interface FournisseurIa {
  readonly nom: string;
  generate(requete: RequeteIa): Promise<ReponseIa>;
}

export class ErreurIaIndisponible extends Error {}

export const FournisseurDesactive: FournisseurIa = {
  nom: "desactive",
  async generate() {
    throw new ErreurIaIndisponible("Aucun fournisseur d'IA n'est actif.");
  },
};

export function creerFournisseurFactice(reponse: string, modele = "factice-v1"): FournisseurIa {
  return {
    nom: "factice",
    async generate() {
      return { texte: reponse, modele };
    },
  };
}

const MOTIF_LIGNE_ELEMENT = /^\[(S\d+)\]\s+([^:]+?)\s*:\s*(.+)$/;

/** Ordre de priorite des puces du resume par regles (le plus important d'abord). */
const PRIORITE: TypeElement[] = ["allergie", "traitement", "maladie_chronique", "resultat_anormal", "antecedent", "consultation", "vaccination", "information_manquante"];

/** Elements dont le texte ne dit pas de quoi il s'agit (un nom d'allergie, un libelle de maladie) : la puce reprend leur type. Les autres se decrivent eux-memes. */
const TYPES_AVEC_LIBELLE = new Set<TypeElement>(["allergie", "antecedent", "maladie_chronique", "resultat_anormal", "vaccination"]);

const TYPE_PAR_LIBELLE = new Map<string, TypeElement>(
  (Object.entries(LIBELLES_TYPE_ELEMENT) as [TypeElement, string][]).map(([type, libelle]) => [libelle, type])
);

/**
 * Resume par regles : une puce par element, dans l'ordre de priorite, en
 * citant son etiquette. Ne lit QUE `input` (comme le ferait un fournisseur
 * externe) ; ne reformule ni ne complete jamais ce qui n'y figure pas.
 */
export const FournisseurReglesLocales: FournisseurIa = {
  nom: "regles_locales",
  async generate({ input }) {
    const elements = input
      .split(/\r?\n/)
      .map((ligne) => ligne.match(MOTIF_LIGNE_ELEMENT))
      .filter((correspondance): correspondance is RegExpMatchArray => correspondance !== null)
      .map((correspondance) => ({
        etiquette: correspondance[1],
        type: TYPE_PAR_LIBELLE.get(correspondance[2].trim()) ?? ("antecedent" as TypeElement),
        texte: correspondance[3].trim(),
      }));

    const classes = PRIORITE.flatMap((type) => elements.filter((element) => element.type === type));
    const lignes = classes
      .slice(0, NOMBRE_MAX_PUCES)
      .map((element) => `- ${TYPES_AVEC_LIBELLE.has(element.type) ? `${LIBELLES_TYPE_ELEMENT[element.type]} : ` : ""}${element.texte} [${element.etiquette}]`);

    return { texte: lignes.join("\n"), modele: "regles-locales-v1" };
  },
};

/** Choix du fournisseur par configuration. Nom inconnu ou absent : fournisseur desactive (echec ferme). */
export function choisirFournisseur(nom: string | undefined): FournisseurIa {
  if (nom === "regles_locales") return FournisseurReglesLocales;
  return FournisseurDesactive;
}
