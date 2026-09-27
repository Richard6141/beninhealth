/**
 * Base de connaissances validee de l'assistant citoyen (F-IA-02, chapitre 16
 * du pack). Module pur : texte statique, revu avec le code, jamais genere. Un
 * sujet absent de cette liste recoit "je n'ai pas la reponse", jamais une
 * invention. Aucune reponse ne parle de sante : les questions de symptome,
 * de traitement ou de diagnostic sont traitees a part (assistant.ts).
 *
 * Declencheurs : fragments normalises (minuscules, sans accents, tirets et
 * apostrophes remplaces par des espaces) recherches en debut de mot. Un
 * fragment termine par "=" doit correspondre a un mot entier. Poids : un
 * declencheur "fort" vaut 2, un "faible" vaut 1 ; un sujet n'est retenu qu'avec
 * au moins un declencheur fort et 2 points, le plus haut score l'emporte, a
 * egalite le premier de la liste. Les libelles de menu cites entre guillemets sont ceux de la
 * navigation patient (src/app/app/layout.tsx).
 */

export interface EntreeFaq {
  id: string;
  /** Question type, proposee comme suggestion et utilisee pour verifier que l'entree se retrouve elle-meme. */
  question: string;
  forts: readonly string[];
  faibles: readonly string[];
  reponse: string;
  lien: { libelle: string; href: string } | null;
}

export const FAQ: readonly EntreeFaq[] = [
  {
    id: "rdv_proches",
    question: "Comment prendre rendez-vous pour mon enfant ?",
    forts: ["pour mon enfant", "pour ma fille", "pour mon fils", "mon enfant", "ma fille", "mon fils", "un proche", "mes proches", "ajouter un enfant", "ajouter un proche", "tuteur"],
    faibles: ["enfant", "famille", "rendez", "dossier"],
    reponse:
      "Dans « Mes proches », ajoutez la personne dont vous vous occupez (par exemple un enfant). Vous pouvez ensuite prendre rendez-vous pour elle depuis cet espace.",
    lien: { libelle: "Ouvrir Mes proches", href: "/app/patient/proches" },
  },
  {
    id: "rdv_prendre",
    question: "Comment prendre rendez-vous ?",
    forts: ["prendre rendez", "prendre un rdv", "reserver", "reservation", "fixer un rendez", "obtenir un rendez", "demander un rendez", "rdv", "voir un medecin", "voir un docteur", "consulter un medecin", "chez le medecin"],
    faibles: ["rendez", "consulter", "medecin", "consultation", "comment"],
    reponse:
      "Ouvrez « Mes rendez-vous », choisissez un établissement, éventuellement un professionnel, puis une date et une heure. L'établissement confirme ou refuse votre demande, et vous êtes prévenu par une notification.",
    lien: { libelle: "Ouvrir Mes rendez-vous", href: "/app/patient/rendez-vous" },
  },
  {
    id: "rdv_annuler",
    question: "Comment annuler un rendez-vous ?",
    forts: ["annuler", "annulation", "decommander", "reporter", "deplacer", "changer mon rendez", "modifier mon rendez"],
    faibles: ["rendez", "rdv"],
    reponse:
      "Dans « Mes rendez-vous », ouvrez le rendez-vous et choisissez Annuler. L'annulation n'est possible que jusqu'à 2 heures avant l'heure prévue. Pour changer la date, annulez puis prenez un nouveau rendez-vous.",
    lien: { libelle: "Ouvrir Mes rendez-vous", href: "/app/patient/rendez-vous" },
  },
  {
    id: "rdv_statut",
    question: "Pourquoi mon rendez-vous est refusé ?",
    forts: ["confirmer", "confirme", "confirmation", "refuse", "refus", "statut de mon rendez", "mon rendez vous est"],
    faibles: ["rendez", "rdv", "pourquoi"],
    reponse:
      "L'état de votre rendez-vous (demandé, confirmé, refusé, annulé) est visible dans « Mes rendez-vous ». L'établissement confirme ou refuse chaque demande et vous êtes prévenu par une notification. Si la demande est refusée, vous pouvez en faire une nouvelle sur un autre créneau ou dans un autre établissement.",
    lien: { libelle: "Ouvrir Mes rendez-vous", href: "/app/patient/rendez-vous" },
  },
  {
    id: "ordonnance_partielle",
    question: "Que signifie « délivrée en partie » ?",
    forts: ["delivree en partie", "delivree partiellement", "delivrance partielle", "en partie", "partiellement"],
    faibles: ["ordonnance", "delivre", "pharmacie", "prescription", "signifie", "veut dire"],
    reponse:
      "Une ordonnance est « délivrée en partie » lorsque la pharmacie n'a pu remettre qu'une partie des médicaments prescrits, par exemple faute de stock. Le reste pourra être délivré ensuite, tant que l'ordonnance est valide.",
    lien: { libelle: "Ouvrir Mes prescriptions", href: "/app/patient/prescriptions" },
  },
  {
    id: "ordonnance_ou",
    question: "Où trouver mes ordonnances ?",
    forts: ["ordonnance", "prescription", "prescriptions"],
    faibles: ["ou=", "voir", "trouver", "retrouver", "pharmacie", "medicament"],
    reponse:
      "Vos ordonnances sont dans « Mes prescriptions ». Chacune porte un numéro (RX suivi de chiffres) à présenter à la pharmacie.",
    lien: { libelle: "Ouvrir Mes prescriptions", href: "/app/patient/prescriptions" },
  },
  {
    id: "examens_resultats",
    question: "Où voir mes résultats d'examens ?",
    forts: ["resultat", "analyse", "examen", "laboratoire", "bilan"],
    faibles: ["voir", "ou=", "consulter"],
    reponse:
      "Vos examens et leurs résultats sont dans « Mes examens ». Un résultat n'apparaît qu'une fois validé par le laboratoire, et certains résultats sensibles vous sont d'abord annoncés par votre médecin.",
    lien: { libelle: "Ouvrir Mes examens", href: "/app/patient/examens" },
  },
  {
    id: "consentement",
    question: "Comment autoriser un professionnel à voir mon dossier ?",
    forts: ["consentement", "autoriser", "autorisation", "donner acces", "donner l acces", "accorder", "retirer l acces", "retirer mon acces"],
    faibles: ["dossier", "medecin", "professionnel", "acces"],
    reponse:
      "Dans « Mes consentements », vous choisissez qui peut accéder à votre dossier et pour quel type d'accès. Vous pouvez retirer un accès à tout moment.",
    lien: { libelle: "Ouvrir Mes consentements", href: "/app/patient/consentements" },
  },
  {
    id: "acces_journal",
    question: "Qui a consulté mon dossier ?",
    forts: ["qui a consulte", "qui a vu", "qui a acces", "historique des acces", "journal des acces", "qui regarde", "qui consulte", "qui a regarde", "qui a ouvert", "qui a lu"],
    faibles: ["dossier", "consulte", "acces"],
    reponse:
      "« Qui a consulté mon dossier » liste chaque consultation de votre dossier : qui l'a consulté et quand.",
    lien: { libelle: "Ouvrir la liste des accès", href: "/app/patient/acces" },
  },
  {
    id: "carte_sante",
    question: "Comment utiliser ma carte santé ?",
    forts: ["carte sante", "carte de sante", "qr", "carte numerique", "ma carte"],
    faibles: ["carte", "presenter", "accueil"],
    reponse:
      "« Ma carte santé » affiche un code QR valable 5 minutes et utilisable une seule fois. Présentez-le à l'accueil de l'établissement.",
    lien: { libelle: "Ouvrir Ma carte santé", href: "/app/patient/carte" },
  },
  {
    id: "mot_de_passe",
    question: "J'ai oublié mon mot de passe, que faire ?",
    forts: ["mot de passe", "mdp", "reinitialiser", "identifiants oublies", "me connecter", "connexion"],
    faibles: ["oublie", "perdu", "connecter"],
    reponse:
      "Sur la page de connexion, choisissez « Mot de passe oublié » et suivez les instructions. Un code de vérification vous est envoyé pour choisir un nouveau mot de passe.",
    lien: { libelle: "Mot de passe oublié", href: "/mot-de-passe-oublie" },
  },
  {
    id: "inscription",
    question: "Comment créer mon compte ?",
    forts: ["creer un compte", "creer mon compte", "inscrire", "inscription", "ouvrir un compte", "enregistrer"],
    faibles: ["compte", "nouveau", "premiere fois"],
    reponse:
      "Sur la page d'inscription, renseignez vos informations et suivez les étapes de validation. Votre espace patient est créé à la fin de l'inscription.",
    lien: { libelle: "Ouvrir l'inscription", href: "/inscription" },
  },
  {
    id: "droits_donnees",
    question: "Comment télécharger ou corriger mes données ?",
    forts: ["exporter", "telecharger mes donnees", "supprimer mes donnees", "corriger", "rectifier", "rectification", "mes droits", "copie de mes donnees"],
    faibles: ["donnees", "dossier", "erreur"],
    reponse:
      "« Mes droits sur mes données » permet de télécharger une copie de vos données, de demander la correction d'une information et de signaler un accès suspect.",
    lien: { libelle: "Ouvrir Mes droits", href: "/app/patient/droits" },
  },
  {
    id: "notifications",
    question: "Où voir mes notifications ?",
    forts: ["notification", "cloche", "sms", "rappel"],
    faibles: ["recevoir", "message", "alerte", "voir"],
    reponse:
      "La cloche en haut de l'écran ouvre le centre de notifications : les messages de la plateforme (rendez-vous, ordonnances, résultats d'examens) y apparaissent.",
    lien: { libelle: "Ouvrir les notifications", href: "/app/notifications" },
  },
  {
    id: "securite_compte",
    question: "Comment sécuriser mon compte ?",
    forts: ["deux etapes", "2fa", "double authentification", "securiser", "authentificateur", "code de secours"],
    faibles: ["securite", "compte", "appareil", "activer"],
    reponse:
      "Dans « Sécurité », vous pouvez activer la vérification en deux étapes avec une application d'authentification et conserver vos codes de secours.",
    lien: { libelle: "Ouvrir Sécurité", href: "/app/securite" },
  },
  {
    id: "confidentialite",
    question: "Mes données sont-elles protégées ?",
    forts: ["confidentialite", "vie privee", "protegees", "securite de mes donnees", "qui peut voir", "qui peut acceder", "donnees protegees", "mes informations"],
    faibles: ["donnees", "protege", "securise", "dossier"],
    reponse:
      "Seuls les professionnels que vous autorisez accèdent à votre dossier, et chaque accès est enregistré : vous le retrouvez dans « Qui a consulté mon dossier ».",
    lien: { libelle: "Ouvrir la liste des accès", href: "/app/patient/acces" },
  },
  {
    id: "aide",
    question: "Que peux-tu faire ?",
    forts: ["que peux tu", "que sais tu", "qui es tu", "comment tu marches", "a quoi sers tu", "aide moi", "besoin d aide"],
    faibles: ["aide", "aider", "assistant"],
    reponse:
      "Je réponds aux questions pratiques sur l'utilisation de la plateforme : rendez-vous, ordonnances, examens, consentements, carte santé, compte et établissements. Je ne peux pas donner d'avis médical.",
    lien: null,
  },
];

/** Sujets proposes quand aucune reponse n'est trouvee. */
export const SUGGESTIONS_ASSISTANT: readonly string[] = [
  "Comment prendre rendez-vous ?",
  "Où voir mes ordonnances ?",
  "Comment autoriser un professionnel à voir mon dossier ?",
  "Comment trouver un établissement de santé ?",
];
