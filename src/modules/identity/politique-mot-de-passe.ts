/**
 * Politique de mot de passe (RG-AUTH-02 et RG-AUTH-43 du pack) : longueur
 * minimale (8 pour un citoyen, 12 pour un compte professionnel), 128 au plus,
 * pas de mot de passe courant, pas de numero de telephone ni de date de
 * naissance. Aucune obligation de majuscule, de chiffre ou de symbole.
 *
 * Module pur, sans "use server" : utilisable par toutes les actions qui
 * definissent un mot de passe (inscription, changement, reinitialisation,
 * reclamation d'un dossier, creation d'un compte).
 *
 * Limite assumee : la liste ci-dessous ne contient que les mots de passe les
 * plus courants (anglais, francais, Benin) ; le pack demande les 10 000
 * premiers. Elle est completee par des regles de forme (suite, repetition,
 * mot courant suivi de chiffres) qui couvrent l'essentiel des variantes.
 */

export const LONGUEUR_MIN_CITOYEN = 8;
export const LONGUEUR_MIN_PROFESSIONNEL = 12;
export const LONGUEUR_MAX_MOT_DE_PASSE = 128;

export interface ContexteMotDePasse {
  telephone?: string | null;
  dateNaissance?: Date | string | null;
  email?: string | null;
  nom?: string | null;
  prenom?: string | null;
}

const MOTS_COURANTS = new Set(
  (
    "password passw0rd passe passer motdepasse motdepasse1 mdp monmotdepasse secret secure admin administrateur administrator " +
    "root toor user utilisateur login welcome bienvenue bonjour bonsoir salut coucou azerty azertyuiop qwerty qwertyui qwertyuiop qwertz " +
    "qazwsx azerty123 qwerty123 abc abcd abcde abcdef abcdefg abcdefgh azertyui iloveyou jetaime jetaime1 monamour mon amour " +
    "football foot soccer barcelona realmadrid arsenal chelsea liverpool psg marseille lyon mercedes ferrari bmw toyota " +
    "dragon master monkey shadow sunshine princess superman batman spiderman naruto pokemon starwars trustno1 letmein " +
    "michael jordan hunter tigger charlie thomas robert daniel jessica jennifer ashley nicole amanda maria maman papa " +
    "mama dieu jesus christ god allah bible church eglise benin cotonou porto-novo portonovo parakou abomey calavi ouidah " +
    "bohicon djougou natitingou lokossa kandi dahomey bj229 sante health hopital hospital clinic clinique docteur doctor " +
    "medecin infirmier pharmacie pharmacien laboratoire ministere gouvernement gouv gov afrique africa senegal togo nigeria " +
    "ghana ivoire abidjan dakar lome lagos accra paris france canada 123 1234 12345 123456 1234567 12345678 123456789 " +
    "1234567890 0123456789 987654321 87654321 111111 000000 11111111 00000000 121212 123123 112233 654321 666666 555555 " +
    "789456 789456123 147258 147258369 159753 741852 963852 963852741 121212 131313 696969 555555 777777 888888 999999 " +
    "1q2w3e 1q2w3e4r 1qaz2wsx 1qazxsw2 zaq12wsx q1w2e3r4 qwe123 asdfgh asdfghjk asdfghjkl zxcvbn zxcvbnm zxcvbnm123 " +
    "poiuytreza mlkjhgfdsq wxcvbn nbvcxw test test123 testtest essai essai123 demo demo123 changeme changeit default " +
    "guest invite public private prive temp temporaire tempo temp123 0000 1111 2222 3333 4444 5555 6666 7777 8888 9999 " +
    "lovely lover loveme loving baby babygirl beautiful cheese chocolate cookie flower fleur soleil etoile star stars " +
    "sunshine summer winter spring autumn ete hiver soleil lune moon money argent bank banque cash rich riche " +
    "computer ordinateur internet mobile phone telephone samsung iphone android google facebook whatsapp youtube tiktok " +
    "snapchat instagram gmail yahoo hotmail outlook orange mtn moov celtiis mtn123 moov123 " +
    "bonheur bienvenue1 famille family ami amis friend friends frere soeur brother sister enfant enfants kids " +
    "azertyuiop1 motdepasse123 password1 password12 password123 password1234 admin123 admin1234 administrateur1 " +
    "ministere1 sante123 benin123 benin2020 benin2021 benin2022 benin2023 benin2024 benin2025 benin2026 " +
    "bhip bhip123 bhip2026 hopital123 clinique123 medecin123 pharmacie123"
  )
    .split(/\s+/)
    .filter((mot) => mot.length > 0)
);

/** "Password123!!" devient "password" : on retire la casse puis les chiffres et symboles de fin. */
function racine(motDePasse: string): string {
  return motDePasse
    .toLowerCase()
    .replace(/[^a-z0-9]+$/g, "")
    .replace(/\d+$/g, "")
    .replace(/[^a-z0-9]+$/g, "");
}

function estUneSuite(chaine: string): boolean {
  if (chaine.length < 4) return false;
  let croissante = true;
  let decroissante = true;
  for (let i = 1; i < chaine.length; i++) {
    const ecart = chaine.charCodeAt(i) - chaine.charCodeAt(i - 1);
    if (ecart !== 1) croissante = false;
    if (ecart !== -1) decroissante = false;
  }
  return croissante || decroissante;
}

function chiffresSeuls(valeur: string): string {
  return valeur.replace(/\D/g, "");
}

function formesDeDate(dateNaissance: Date | string): string[] {
  const date = dateNaissance instanceof Date ? dateNaissance : new Date(dateNaissance);

  if (Number.isNaN(date.getTime())) {
    return [];
  }

  const jour = String(date.getUTCDate()).padStart(2, "0");
  const mois = String(date.getUTCMonth() + 1).padStart(2, "0");
  const annee = String(date.getUTCFullYear());
  const annee2 = annee.slice(2);

  return [
    `${jour}${mois}${annee}`,
    `${annee}${mois}${jour}`,
    `${mois}${jour}${annee}`,
    `${jour}${mois}${annee2}`,
    `${annee2}${mois}${jour}`,
  ];
}

/**
 * Renvoie le message d'erreur a afficher, ou null si le mot de passe est acceptable.
 */
export function evaluerMotDePasse(
  motDePasse: string,
  options: { minimum: number; contexte?: ContexteMotDePasse }
): string | null {
  if (motDePasse.length < options.minimum) {
    return `Le mot de passe doit contenir au moins ${options.minimum} caracteres.`;
  }

  if (motDePasse.length > LONGUEUR_MAX_MOT_DE_PASSE) {
    return `Le mot de passe ne doit pas depasser ${LONGUEUR_MAX_MOT_DE_PASSE} caracteres.`;
  }

  const minuscule = motDePasse.toLowerCase();
  const message = "Ce mot de passe est trop facile a deviner. Choisissez une phrase ou des mots que vous seul connaissez.";

  if (MOTS_COURANTS.has(minuscule) || MOTS_COURANTS.has(racine(motDePasse))) {
    return message;
  }

  if (new Set(minuscule).size <= 2) {
    return message;
  }

  if (estUneSuite(minuscule.replace(/[^a-z0-9]/g, ""))) {
    return message;
  }

  const contexte = options.contexte;

  if (contexte) {
    const chiffres = chiffresSeuls(motDePasse);

    if (contexte.telephone) {
      const telephone = chiffresSeuls(contexte.telephone);
      const local = telephone.length > 8 ? telephone.slice(-10) : telephone;

      if (local.length >= 8 && (chiffres.includes(local) || chiffres.includes(local.slice(-8)))) {
        return "Le mot de passe ne doit pas contenir votre numero de telephone.";
      }
    }

    if (contexte.dateNaissance && formesDeDate(contexte.dateNaissance).some((forme) => chiffres.includes(forme))) {
      return "Le mot de passe ne doit pas contenir votre date de naissance.";
    }

    if (contexte.email) {
      const local = contexte.email.split("@")[0]?.toLowerCase() ?? "";

      if (local.length >= 5 && minuscule.includes(local)) {
        return "Le mot de passe ne doit pas contenir votre adresse e-mail.";
      }
    }
  }

  return null;
}
