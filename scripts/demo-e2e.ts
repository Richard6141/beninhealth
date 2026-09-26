/**
 * Verification automatisee de bout en bout (Phase 7) du scenario de
 * demonstration du cahier des charges (Partie 9) : citoyen cree son espace et
 * consulte son dossier, medecin consulte ses rendez-vous, ministere consulte
 * les indicateurs nationaux agreges.
 *
 * Ce script parle HTTP pur contre une instance deja demarree sur
 * http://localhost:3000 (aucun serveur n'est lance ici, aucune migration
 * n'est jouee). Il rejoue exactement ce que ferait un navigateur SANS
 * JavaScript qui soumet les formulaires des Server Actions Next.js : POST
 * multipart/form-data sur l'URL de la page, avec les champs caches
 * $ACTION_REF_n, $ACTION_n:0, $ACTION_n:1 et $ACTION_KEY extraits du HTML
 * recu, plus un cookie de session gere a la main (pas de vrai navigateur).
 *
 * Usage : npm run demo:e2e
 *
 * Chaque etape reussie affiche une ligne "[OK] ...". A la premiere etape en
 * echec, le script affiche "[ECHEC] ..." avec un message precis et s'arrete
 * avec process.exit(1), pour servir de verification rapide apres toute
 * modification future du projet.
 */

const BASE_URL = "http://localhost:3000";
const MOT_DE_PASSE_DEMO = "Demo1234!";
const DELAI_REQUETE_MS = 15000;

const EMAIL_PATIENT = "patient.demo@benin-health.test";
const EMAIL_MEDECIN = "medecin.demo@benin-health.test";
const EMAIL_MINISTERE = "ministere.demo@benin-health.test";

// ---------------------------------------------------------------------------
// Utilitaires generiques : sortie, assertions, arret immediat en cas d'echec.
// ---------------------------------------------------------------------------

function ok(message: string): void {
  console.log(`[OK] ${message}`);
}

function echouer(message: string): never {
  console.error(`[ECHEC] ${message}`);
  process.exit(1);
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    echouer(message);
  }
}

function extrait(html: string, tailleMax = 300): string {
  return html.replace(/\s+/g, " ").trim().slice(0, tailleMax);
}

function contientErreurServeur(html: string): boolean {
  return /application error/i.test(html);
}

// ---------------------------------------------------------------------------
// Cookie de session, gere a la main (le script ne dispose pas d'un vrai
// navigateur : chaque reponse peut poser un Set-Cookie qu'il faut relire tel
// quel dans le Cookie des requetes suivantes).
// ---------------------------------------------------------------------------

class PotACookies {
  private valeurs = new Map<string, string>();

  appliquerReponse(reponse: Response): void {
    const entetes = reponse.headers as Headers & { getSetCookie?: () => string[] };
    const brutes =
      typeof entetes.getSetCookie === "function"
        ? entetes.getSetCookie()
        : (() => {
            const unique = reponse.headers.get("set-cookie");
            return unique ? [unique] : [];
          })();

    for (const brute of brutes) {
      const premierMorceau = brute.split(";")[0] ?? "";
      const indexEgal = premierMorceau.indexOf("=");
      if (indexEgal > -1) {
        const nom = premierMorceau.slice(0, indexEgal).trim();
        const valeur = premierMorceau.slice(indexEgal + 1).trim();
        if (nom) {
          this.valeurs.set(nom, valeur);
        }
      }
    }
  }

  entete(): string {
    return Array.from(this.valeurs.entries())
      .map(([nom, valeur]) => `${nom}=${valeur}`)
      .join("; ");
  }
}

const cookies = new PotACookies();

// ---------------------------------------------------------------------------
// Requetes HTTP : redirect "manual" partout, pour pouvoir lire nous-memes le
// Set-Cookie et le Location d'une reponse de redirection, plutot que de
// laisser fetch enchainer automatiquement une requete qui perdrait ce cookie.
// ---------------------------------------------------------------------------

interface ReponseBrute {
  status: number;
  location: string | null;
  corps: string;
}

async function requete(
  chemin: string,
  options: { method?: string; corps?: FormData } = {}
): Promise<ReponseBrute> {
  const controleur = new AbortController();
  const minuteur = setTimeout(() => controleur.abort(), DELAI_REQUETE_MS);

  let reponse: Response;
  try {
    reponse = await fetch(`${BASE_URL}${chemin}`, {
      method: options.method ?? "GET",
      body: options.corps,
      redirect: "manual",
      signal: controleur.signal,
      headers: {
        Cookie: cookies.entete(),
      },
    });
  } catch (erreur) {
    echouer(
      `Impossible de joindre ${BASE_URL}${chemin} (${(erreur as Error).message}). ` +
        "Le serveur de developpement partage sur le port 3000 ne repond pas."
    );
  } finally {
    clearTimeout(minuteur);
  }

  cookies.appliquerReponse(reponse);
  const corps = await reponse.text();

  return {
    status: reponse.status,
    location: reponse.headers.get("location"),
    corps,
  };
}

// ---------------------------------------------------------------------------
// Extraction des champs caches d'une Server Action Next.js depuis le HTML
// d'une page (voir contexte technique en tete de mission). Une page peut
// contenir plusieurs formulaires : on isole celui qui contient le champ
// "marqueur" indique par l'appelant avant d'en extraire les champs caches.
// ---------------------------------------------------------------------------

function decoderEntitesHtml(valeur: string): string {
  return valeur
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

interface ChampsAction {
  numero: string;
  action0: string;
  action1: string;
  cle: string;
}

function extraireFormulaire(html: string, champMarqueur: string): string {
  const blocs = html.match(/<form[\s\S]*?<\/form>/g) ?? [];
  const trouve = blocs.find((bloc) => bloc.includes(`name="${champMarqueur}"`));

  assert(
    trouve,
    `Formulaire introuvable dans la page recue (aucun <form> ne contient un champ "${champMarqueur}"). ` +
      "La structure de la page a peut-etre change. Extrait recu : " +
      extrait(html)
  );

  return trouve;
}

function extraireChampsAction(formulaireHtml: string): ChampsAction {
  const numeroMatch = formulaireHtml.match(/\$ACTION_REF_(\d+)/);
  assert(
    numeroMatch,
    "Champ $ACTION_REF_<n> introuvable dans le formulaire. Extrait : " + extrait(formulaireHtml)
  );
  const numero = numeroMatch[1];

  const action0Match = formulaireHtml.match(
    new RegExp(`\\$ACTION_${numero}:0" value="([^"]*)"`)
  );
  const action1Match = formulaireHtml.match(
    new RegExp(`\\$ACTION_${numero}:1" value="([^"]*)"`)
  );
  const cleMatch = formulaireHtml.match(/\$ACTION_KEY" value="([^"]*)"/);

  assert(action0Match, `Champ $ACTION_${numero}:0 introuvable dans le formulaire.`);
  assert(action1Match, `Champ $ACTION_${numero}:1 introuvable dans le formulaire.`);
  assert(cleMatch, "Champ $ACTION_KEY introuvable dans le formulaire.");

  return {
    numero,
    action0: decoderEntitesHtml(action0Match[1]),
    action1: decoderEntitesHtml(action1Match[1]),
    cle: decoderEntitesHtml(cleMatch[1]),
  };
}

function construireFormData(
  champs: ChampsAction,
  champsMetier: Record<string, string>
): FormData {
  const donnees = new FormData();
  donnees.set(`$ACTION_REF_${champs.numero}`, "");
  donnees.set(`$ACTION_${champs.numero}:0`, champs.action0);
  donnees.set(`$ACTION_${champs.numero}:1`, champs.action1);
  donnees.set("$ACTION_KEY", champs.cle);

  for (const [nom, valeur] of Object.entries(champsMetier)) {
    donnees.set(nom, valeur);
  }

  return donnees;
}

/** Valeur d'un champ cache ordinaire (pas un champ $ACTION_*), ex. name="preAuthToken" value="...". */
function extraireValeurChampCache(formulaireHtml: string, nom: string): string {
  const match = formulaireHtml.match(new RegExp(`name="${nom}" value="([^"]*)"`));
  assert(
    match,
    `Champ cache "${nom}" introuvable dans le formulaire. Extrait : ${extrait(formulaireHtml)}`
  );
  return decoderEntitesHtml(match[1]);
}

// ---------------------------------------------------------------------------
// Etape generique de connexion : POST du formulaire de connexion, franchit
// automatiquement l'etape obligatoire de code de verification par e-mail
// (Phase 7-durcissement) en lisant le code affiche a l'ecran hors production
// (AuthActionState.codeDemo, voir src/modules/identity/actions.ts), puis
// verifie stricte que la reponse finale est bien une redirection vers la
// cible attendue (pas un ecran de double authentification TOTP que ce script
// ne sait pas franchir automatiquement, celui-la reste gere en echec explicite).
// ---------------------------------------------------------------------------

async function franchirEtapeCodeEmail(email: string, reponseConnexion: ReponseBrute): Promise<ReponseBrute> {
  const formulaireCode = extraireFormulaire(reponseConnexion.corps, "code");
  const champs = extraireChampsAction(formulaireCode);
  const preAuthToken = extraireValeurChampCache(formulaireCode, "preAuthToken");

  const codeMatch = reponseConnexion.corps.match(/chiffres font-semibold">(\d{6})</);
  assert(
    codeMatch,
    `Connexion de ${email} : etape "code recu par e-mail" affichee mais aucun code de ` +
      "demonstration trouve dans la page (AuthActionState.codeDemo n'est jamais renvoye en " +
      `production). Extrait recu : ${extrait(reponseConnexion.corps)}`
  );

  const corps = construireFormData(champs, { preAuthToken, code: codeMatch[1] });
  return requete("/connexion", { method: "POST", corps });
}

async function seConnecter(email: string, cibleAttendue: string): Promise<void> {
  const pageConnexion = await requete("/connexion");
  assert(
    pageConnexion.status === 200,
    `La page /connexion a repondu avec le statut ${pageConnexion.status} au lieu de 200.`
  );

  const formulaire = extraireFormulaire(pageConnexion.corps, "motDePasse");
  const champs = extraireChampsAction(formulaire);
  const corps = construireFormData(champs, { email, motDePasse: MOT_DE_PASSE_DEMO });

  let reponse = await requete("/connexion", { method: "POST", corps });

  const estRedirection = (r: ReponseBrute) => r.status === 303 || r.status === 302 || r.status === 307;

  if (!estRedirection(reponse) && /Vérification par e-mail|emailCodeRequis/.test(reponse.corps)) {
    reponse = await franchirEtapeCodeEmail(email, reponse);
  }

  if (!estRedirection(reponse)) {
    if (/Double authentification|mfaRequis/.test(reponse.corps)) {
      echouer(
        `Connexion de ${email} bloquee : la double authentification (MFA) est active sur ce ` +
          "compte de demonstration et ce script ne peut pas saisir de code automatiquement. " +
          "Desactivez la MFA sur ce compte (page /app/securite) puis relancez ce script."
      );
    }
    if (/Connexion impossible|Identifiants incorrects|Code refuse/.test(reponse.corps)) {
      echouer(
        `Connexion de ${email} refusee par le serveur (identifiants ou code rejetes). ` +
          "Verifiez que le jeu de donnees de demonstration (prisma/seed.ts) est bien charge."
      );
    }
    echouer(
      `Connexion de ${email} : reponse inattendue (statut ${reponse.status} au lieu d'une ` +
        `redirection). Extrait recu : ${extrait(reponse.corps)}`
    );
  }

  assert(
    reponse.location === cibleAttendue,
    `Connexion de ${email} : redirection vers "${reponse.location}" au lieu de "${cibleAttendue}" attendu.`
  );

  ok(`Connexion ${email} reussie (redirection vers ${cibleAttendue}).`);
}

// ---------------------------------------------------------------------------
// Etape generique de verification d'une page de tableau de bord : statut 200
// et absence de toute trace d'erreur serveur visible dans le HTML.
// ---------------------------------------------------------------------------

async function chargerPageEtVerifier(chemin: string, nomEtape: string): Promise<string> {
  const reponse = await requete(chemin);

  assert(
    reponse.status < 500,
    `${nomEtape} : le serveur a repondu avec le statut ${reponse.status} (erreur serveur) sur ${chemin}.`
  );
  assert(
    reponse.status === 200,
    `${nomEtape} : statut ${reponse.status} recu sur ${chemin} au lieu de 200 attendu. ` +
      `Extrait : ${extrait(reponse.corps)}`
  );
  assert(
    !contientErreurServeur(reponse.corps),
    `${nomEtape} : trace d'erreur serveur ("Application error") detectee dans le HTML de ${chemin}.`
  );

  ok(`${nomEtape} (${chemin} : statut 200, sans erreur serveur).`);
  return reponse.corps;
}

// ---------------------------------------------------------------------------
// Etape optionnelle (bonus) : prise d'un nouveau rendez-vous par le patient,
// puis verification qu'il apparait bien ensuite dans sa liste de
// rendez-vous. Extrait dynamiquement l'etablissement disponible et les
// champs caches de la Server Action depuis le HTML recu, plutot que de coder
// en dur un identifiant d'etablissement.
// ---------------------------------------------------------------------------

function formaterDateHeureLocale(date: Date): string {
  const complete2 = (valeur: number) => String(valeur).padStart(2, "0");
  return (
    `${date.getFullYear()}-${complete2(date.getMonth() + 1)}-${complete2(date.getDate())}` +
    `T${complete2(date.getHours())}:${complete2(date.getMinutes())}`
  );
}

function extrairePremierEtablissement(formulaireHtml: string): string {
  const selectMatch = formulaireHtml.match(
    /<select[^>]*name="etablissementId"[^>]*>([\s\S]*?)<\/select>/
  );
  assert(selectMatch, "Champ de selection d'etablissement introuvable dans le formulaire de rendez-vous.");

  const optionRegex = /<option value="([^"]*)"([^>]*)>/g;
  let correspondance: RegExpExecArray | null;
  while ((correspondance = optionRegex.exec(selectMatch[1])) !== null) {
    const [, valeur, attributsRestants] = correspondance;
    if (valeur && !attributsRestants.includes("disabled")) {
      return valeur;
    }
  }

  return echouer(
    "Aucun etablissement disponible dans le formulaire de prise de rendez-vous : " +
      "impossible de tester l'etape optionnelle de creation de rendez-vous."
  );
}

async function etapeOptionnelleNouveauRendezVous(): Promise<void> {
  console.log("");
  console.log("Etape optionnelle : prise d'un nouveau rendez-vous par le patient.");

  // Le patient a ete deconnecte logiquement des l'instant ou une autre
  // connexion (medecin, ministere) a ecrase le cookie de session : on se
  // reconnecte explicitement avant cette etape.
  await seConnecter(EMAIL_PATIENT, "/app/patient");

  const pageRendezVous = await requete("/app/patient/rendez-vous");
  assert(
    pageRendezVous.status === 200,
    `Impossible de charger /app/patient/rendez-vous (statut ${pageRendezVous.status}).`
  );

  const formulaire = extraireFormulaire(pageRendezVous.corps, "etablissementId");
  const champs = extraireChampsAction(formulaire);
  const etablissementId = extrairePremierEtablissement(formulaire);

  const dateFutureLointaine = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
  const motifUnique = `Verification automatisee du scenario de demonstration (script demo:e2e, ${Date.now()})`;

  const corps = construireFormData(champs, {
    etablissementId,
    professionnelId: "",
    date: formaterDateHeureLocale(dateFutureLointaine),
    motif: motifUnique,
  });

  const reponseCreation = await requete("/app/patient/rendez-vous", { method: "POST", corps });

  assert(
    reponseCreation.status === 200,
    `La creation du rendez-vous a repondu avec le statut ${reponseCreation.status} au lieu de 200. ` +
      `Extrait : ${extrait(reponseCreation.corps)}`
  );
  assert(
    !/Demande impossible/.test(reponseCreation.corps),
    "La creation du rendez-vous a ete refusee par le serveur (alerte \"Demande impossible\" affichee). " +
      `Extrait : ${extrait(reponseCreation.corps)}`
  );
  assert(
    reponseCreation.corps.includes(motifUnique),
    "Le motif du nouveau rendez-vous n'apparait pas dans la reponse recue juste apres l'envoi du formulaire."
  );

  ok("Demande de rendez-vous envoyee (alerte de succes recue).");

  // Re-verification par une requete GET independante, pour confirmer que le
  // rendez-vous est bien persiste et pas seulement echo dans la reponse du
  // POST (correspond a l'exigence : "verifie qu'il apparait ensuite dans sa
  // liste de rendez-vous").
  const pageRendezVousApres = await requete("/app/patient/rendez-vous");
  assert(
    pageRendezVousApres.status === 200,
    `Impossible de recharger /app/patient/rendez-vous apres creation (statut ${pageRendezVousApres.status}).`
  );
  assert(
    pageRendezVousApres.corps.includes(motifUnique),
    "Le nouveau rendez-vous n'apparait pas dans la liste des rendez-vous apres rechargement de la page."
  );

  ok("Le nouveau rendez-vous apparait bien dans la liste des rendez-vous du patient.");
}

// ---------------------------------------------------------------------------
// Verification prealable : un serveur repond-il vraiment sur le port 3000 ?
// Ce script ne doit jamais demarrer de serveur lui-meme.
// ---------------------------------------------------------------------------

async function verifierServeurDemarre(): Promise<void> {
  try {
    const controleur = new AbortController();
    const minuteur = setTimeout(() => controleur.abort(), DELAI_REQUETE_MS);
    await fetch(BASE_URL, { redirect: "manual", signal: controleur.signal });
    clearTimeout(minuteur);
  } catch (erreur) {
    echouer(
      `Aucun serveur ne repond sur ${BASE_URL} (${(erreur as Error).message}). ` +
        "Ce script ne demarre jamais de serveur lui-meme : demarrez le serveur de developpement " +
        "partage (next dev) avant de relancer npm run demo:e2e."
    );
  }
}

// ---------------------------------------------------------------------------
// Scenario complet.
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  await verifierServeurDemarre();

  // 1. Connexion du patient.
  await seConnecter(EMAIL_PATIENT, "/app/patient");

  // 2. Tableau de bord patient : donnees reelles du dossier.
  const dashboardPatient = await chargerPageEtVerifier(
    "/app/patient",
    "Tableau de bord patient charge"
  );
  assert(
    dashboardPatient.includes("BJ-SANTE-PAT-0001"),
    "L'identifiant sante \"BJ-SANTE-PAT-0001\" du patient de demonstration est absent du tableau de bord."
  );
  assert(
    dashboardPatient.includes("O+"),
    "Le groupe sanguin \"O+\" du patient de demonstration est absent du tableau de bord."
  );
  ok("Le tableau de bord patient contient bien les donnees reelles du dossier (identifiant sante, groupe sanguin).");

  // 3. Connexion du medecin, puis tableau de bord medecin.
  await seConnecter(EMAIL_MEDECIN, "/app/medecin");
  const dashboardMedecin = await chargerPageEtVerifier(
    "/app/medecin",
    "Tableau de bord medecin charge"
  );

  // 4. Liste des rendez-vous et des consultations du medecin.
  await chargerPageEtVerifier(
    "/app/medecin/rendez-vous",
    "Liste des rendez-vous du medecin chargee"
  );
  await chargerPageEtVerifier(
    "/app/medecin/consultations",
    "Liste des consultations du medecin chargee"
  );

  // 5. Connexion du ministere, puis tableau de bord ministere.
  await seConnecter(EMAIL_MINISTERE, "/app/ministere");
  const dashboardMinistere = await chargerPageEtVerifier(
    "/app/ministere",
    "Tableau de bord ministere charge"
  );
  assert(
    dashboardMinistere.includes("Indicateurs nationaux"),
    "Le texte \"Indicateurs nationaux\" est absent du tableau de bord ministere."
  );
  ok("Le tableau de bord ministere contient bien la section des indicateurs nationaux agreges.");

  // 6. Verification explicite, sur les trois tableaux de bord, de l'absence
  // de toute trace d'erreur serveur (deja verifie individuellement plus
  // haut : cette etape le reaffirme explicitement, comme demande).
  const tableauxDeBord: Array<[string, string]> = [
    ["patient", dashboardPatient],
    ["medecin", dashboardMedecin],
    ["ministere", dashboardMinistere],
  ];
  for (const [nom, html] of tableauxDeBord) {
    assert(
      !contientErreurServeur(html),
      `Trace d'erreur serveur ("Application error") detectee sur le tableau de bord ${nom}.`
    );
  }
  ok("Aucune trace d'erreur serveur sur les trois tableaux de bord (patient, medecin, ministere).");

  // 7. Etape optionnelle (bonus) : prise d'un nouveau rendez-vous.
  await etapeOptionnelleNouveauRendezVous();

  console.log("");
  console.log("Scenario de demonstration verifie de bout en bout avec succes.");
}

main().catch((erreur: unknown) => {
  echouer(`Erreur inattendue non geree : ${(erreur as Error).stack ?? String(erreur)}`);
});
