/**
 * Redirection post-connexion (F-ETA-02) : la fiche publique d'un
 * établissement ("Prendre rendez-vous") envoie un visiteur non connecté vers
 * `/connexion?next=...` pour qu'il retrouve, une fois connecté, l'écran de
 * prise de rendez-vous plutôt que de devoir tout rechercher à nouveau.
 *
 * Ce fichier n'est volontairement PAS un fichier "use server" : il n'exporte
 * qu'une fonction synchrone de validation, jamais consommée directement
 * depuis un formulaire, et `src/modules/identity/actions.ts` (qui, lui, est
 * "use server") ne peut exporter que des fonctions async.
 *
 * Règle de sécurité (open redirect classique, RG absente du pack mais
 * imposée par la vigilance de base) : ce paramètre est fourni par le client,
 * donc jamais fiable tel quel. On refuse tout ce qui n'est pas un chemin
 * relatif interne :
 *  - doit commencer par un seul `/` (jamais un schéma `http(s)://`, ni tout
 *    autre schéma comme `javascript:`) ;
 *  - jamais `//...` (URL "protocol relative" : le navigateur la résout vers
 *    un AUTRE domaine, alors qu'elle ressemble à un chemin interne) ;
 *  - jamais de `\` (certains navigateurs le traitent comme un `/`, ce qui
 *    permettrait de reconstituer un `//` ou un couple `/\` contournant les
 *    deux contrôles ci-dessus) ;
 *  - restreint en plus à une liste explicite de préfixes de routes
 *    attendues, plutôt qu'accepté pour tout chemin interne : une route
 *    interne qui redirigerait elle-même ailleurs (ou un futur chemin
 *    sensible) n'est jamais une cible valide de ce paramètre.
 */

/**
 * Chaque entrée est la route exacte, sans requête : un chemin n'est accepté
 * que s'il correspond exactement à l'une d'elles, ou commence par l'une
 * d'elles suivie de `/` ou `?` (jamais un simple `startsWith` brut, qui
 * accepterait par erreur une route voisine comme
 * `/app/patient/rendez-vous-autre-chose`).
 */
const ROUTES_REDIRECTION_AUTORISEES = ["/app/patient/rendez-vous"];

/**
 * Renvoie le chemin (avec sa requête éventuelle) s'il est un chemin interne
 * valide et attendu pour une redirection post-connexion, sinon null.
 */
export function cheminRedirectionValide(valeur: unknown): string | null {
  if (typeof valeur !== "string" || valeur.length === 0) {
    return null;
  }

  if (!valeur.startsWith("/") || valeur.startsWith("//") || valeur.includes("\\")) {
    return null;
  }

  let route: string;
  let chemin: string;

  try {
    const url = new URL(valeur, "http://origine-locale.invalid");
    route = url.pathname;
    chemin = `${url.pathname}${url.search}`;
  } catch {
    return null;
  }

  const correspond = ROUTES_REDIRECTION_AUTORISEES.some(
    (autorisee) => route === autorisee || chemin.startsWith(`${autorisee}/`) || chemin.startsWith(`${autorisee}?`)
  );

  if (!correspond) {
    return null;
  }

  return chemin;
}
