/**
 * Minimisation (RG-IA-04) : le texte propose au modele ne contient ni nom, ni
 * prenom, ni telephone, ni adresse, ni identifiant sante, ni NPI. Module pur.
 *
 * Deux barrieres complementaires : (1) les elements sont construits a partir
 * de champs structures, jamais de la fiche identite ; (2) tout texte libre
 * (motif, conclusion, posologie...) passe par assainirTexte, qui retire les
 * identites connues du patient et les formes reconnaissables de donnees
 * personnelles (telephone, identifiant sante, NPI, e-mail).
 */

export interface IdentitePatient {
  nom: string;
  prenom: string;
  identifiantSante: string;
  telephone: string;
  /** Noms de proches ou de professionnels a retirer aussi (contacts d'urgence, medecin...). */
  autresNoms?: readonly string[];
}

const REMPLACEMENT_PATIENT = "le patient";
const REMPLACEMENT_RETIRE = "[retiré]";

function normaliser(texte: string): string {
  return texte.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

function echapper(texte: string): string {
  return texte.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Vrai si le nom est assez long pour etre retire sans abimer le texte. */
function nomExploitable(nom: string): boolean {
  return normaliser(nom).replace(/[^a-z]/g, "").length >= 3;
}

/**
 * Remplace, sans tenir compte de la casse ni des accents, chaque occurrence
 * d'un nom connu : le texte d'origine est parcouru sur sa version normalisee
 * (meme longueur apres retrait des diacritiques combinants) pour retrouver les
 * positions.
 */
function remplacerNom(texte: string, nom: string, remplacement: string): string {
  const motif = new RegExp(`(?<![\\p{L}\\p{N}])${echapper(normaliser(nom))}(?![\\p{L}\\p{N}])`, "gu");
  const normalise = normaliser(texte);
  if (normalise.length !== texte.length) {
    // Cas rare (caracteres dont la normalisation change la longueur) : on retombe sur une recherche insensible a la casse.
    return texte.replace(new RegExp(`(?<![\\p{L}\\p{N}])${echapper(nom)}(?![\\p{L}\\p{N}])`, "giu"), remplacement);
  }
  let resultat = "";
  let curseur = 0;
  for (const correspondance of normalise.matchAll(motif)) {
    const debut = correspondance.index ?? 0;
    resultat += texte.slice(curseur, debut) + remplacement;
    curseur = debut + correspondance[0].length;
  }
  return resultat + texte.slice(curseur);
}

// Formes reconnaissables, retirees meme si la personne n'est pas connue.
const MOTIF_EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const MOTIF_IDENTIFIANT_SANTE = /\b[A-Z]{2}-\d{4}-\d{4,8}\b/g;
// Une ponctuation apres le nombre (virgule, point de fin de phrase) ne l'exclut pas ; un chiffre apres la ponctuation oui (decimale).
const MOTIF_NPI = /(?<![\d.,])\d{13}(?!\d)(?![.,]\d)/g;
// Numero du Benin : +229 ou 00229 suivi de 8 a 10 chiffres, ou 8 chiffres groupes par deux (avec ou sans le
// prefixe 01 a 10 chiffres). Une date ISO (2026-09-26) n'est jamais prise pour un telephone.
const MOTIF_TELEPHONE =
  /(?<![\d.,/-])(?!\d{4}-\d{2}-\d{2})(?:(?:\+|00)?229[ .-]?(?:\d[ .-]?){7,9}\d|(?:01[ .-]?)?(?:\d{2}[ .-]?){3}\d{2})(?!\d)(?![.,/-]\d)/g;

/** Assainit un texte libre avant qu'il ne soit propose au modele (RG-IA-04). */
export function assainirTexte(texte: string, identite: IdentitePatient): string {
  let resultat = texte;

  // Noms complets d'abord : sinon "Kossi Agbodjan" deviendrait "le patient le patient".
  for (const nom of [`${identite.prenom} ${identite.nom}`, `${identite.nom} ${identite.prenom}`, identite.nom, identite.prenom]) {
    if (nomExploitable(nom)) resultat = remplacerNom(resultat, nom, REMPLACEMENT_PATIENT);
  }
  for (const nom of identite.autresNoms ?? []) {
    if (nomExploitable(nom)) resultat = remplacerNom(resultat, nom, REMPLACEMENT_RETIRE);
  }
  if (identite.identifiantSante) {
    resultat = resultat.split(identite.identifiantSante).join(REMPLACEMENT_RETIRE);
  }
  const chiffresTelephone = identite.telephone.replace(/\D/g, "");
  if (chiffresTelephone.length >= 8) {
    resultat = resultat.split(identite.telephone).join(REMPLACEMENT_RETIRE);
  }

  return resultat
    .replace(MOTIF_EMAIL, REMPLACEMENT_RETIRE)
    .replace(MOTIF_IDENTIFIANT_SANTE, REMPLACEMENT_RETIRE)
    .replace(MOTIF_NPI, REMPLACEMENT_RETIRE)
    .replace(MOTIF_TELEPHONE, REMPLACEMENT_RETIRE)
    .replace(/\s{2,}/g, " ")
    .trim();
}

/**
 * Controle final, independant de l'assainissement : renvoie la liste des
 * fuites detectees dans le texte deja construit (vide si rien). Sert de
 * garde-fou avant tout appel et de test automatique sur les requetes
 * interceptees (CA-2).
 */
export function detecterFuites(texte: string, identite: IdentitePatient): string[] {
  const fuites: string[] = [];
  const normalise = normaliser(texte);

  for (const nom of [identite.nom, identite.prenom, ...(identite.autresNoms ?? [])]) {
    if (nomExploitable(nom) && new RegExp(`(?<![\\p{L}\\p{N}])${echapper(normaliser(nom))}(?![\\p{L}\\p{N}])`, "u").test(normalise)) {
      fuites.push(`nom:${nom}`);
    }
  }
  if (identite.identifiantSante && texte.includes(identite.identifiantSante)) fuites.push("identifiant_sante");
  const chiffresTelephone = identite.telephone.replace(/\D/g, "");
  if (chiffresTelephone.length >= 8 && texte.replace(/\D/g, "").includes(chiffresTelephone)) fuites.push("telephone");
  if (new RegExp(MOTIF_EMAIL.source).test(texte)) fuites.push("email");
  if (new RegExp(MOTIF_IDENTIFIANT_SANTE.source).test(texte)) fuites.push("identifiant_sante_motif");
  if (new RegExp(MOTIF_NPI.source).test(texte)) fuites.push("npi");
  if (new RegExp(MOTIF_TELEPHONE.source).test(texte)) fuites.push("telephone_motif");
  return fuites;
}
