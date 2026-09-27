"use server";

/**
 * F-AUTH-04 du pack (docs/pack claude/specs/07-fiches-comptes.md) : mot de
 * passe oublie, en libre-service, sans session prealable. Meme principe que
 * le code de connexion par e-mail (src/modules/identity/verification-email.ts) :
 * code a 6 chiffres, jamais stocke en clair, usage unique, courte duree de
 * vie - mais dans une table dediee (CodeReinitialisationMotDePasse, voir
 * prisma/schema.prisma) plutot que reutilisee, pour ne jamais risquer qu'un
 * code de connexion et un code de reinitialisation se substituent l'un a
 * l'autre pour le meme compte.
 *
 * RG anti-enumeration (CA-2 du pack) : la reponse de demanderReinitialisationMotDePasseAction
 * est TOUJOURS le meme message generique, que le compte existe ou non, et ne
 * transmet jamais de jeton lie a un utilisateur reel (contrairement au flux
 * de connexion, ou le mot de passe est deja verifie avant l'etape du code).
 * L'etape suivante (reinitialiserMotDePasseAction) redemande donc l'email en
 * plus du code, et renvoie elle aussi un message generique identique pour
 * "compte inexistant" et "code incorrect".
 *
 * CA-1 du pack ("une session ouverte sur un autre appareil est deconnectee a
 * la requete suivante") est desormais implemente : F-AUTH-09
 * (src/modules/identity/sessions.ts) a ajoute une table `SessionActive` et un
 * `sessionId` verifie a chaque `getSession()` (src/lib/session.ts). La
 * reinitialisation reussie ferme ICI toutes les `SessionActive` du compte
 * (aucune session courante a exclure : ce parcours se fait toujours
 * deconnecte), ce qui les invalide reellement a leur prochaine requete,
 * plutot que d'attendre l'expiration naturelle du JWT (7 jours).
 */

import { randomInt } from "node:crypto";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { codeAfficheALEcran } from "@/lib/demo";
import { getEnv } from "@/lib/env";
import { envoyerEmail } from "@/lib/mail";
import { journaliser } from "@/modules/audit/journaliser";
import { enregistrerEvenement, limiteAtteinte, verifierEtIncrementerDebit } from "@/lib/limite-debit";
import { adresseDeLaRequete } from "./limitation-connexion";
import { evaluerMotDePasse, longueurMinimaleSelonRoles } from "./politique-mot-de-passe";

const UNE_HEURE_MS = 60 * 60 * 1000;
const QUINZE_MINUTES_MS = 15 * 60 * 1000;
const DEMANDES_MAX_PAR_COMPTE_PAR_HEURE = 3;
const DEMANDES_MAX_PAR_ADRESSE_PAR_HEURE = 20;
const ECHECS_MAX_PAR_COMPTE_PAR_QUINZE_MINUTES = 5;

function cleEchecsReinitialisation(email: string): string {
  return `reinitialisation:echecs:${email.trim().toLowerCase()}`;
}

const ROUNDS_BCRYPT = 12;
const DUREE_VALIDITE_CODE_MINUTES = 10;

/**
 * MESSAGE_GENERIQUE_DEMANDE : identique que le compte existe ou non (CA-2).
 * MESSAGE_GENERIQUE_ECHEC_RESET : identique pour "compte inexistant" et
 * "code incorrect ou expire" a l'etape suivante, meme principe.
 */
const MESSAGE_GENERIQUE_DEMANDE = "Si un compte existe, un code vient d'être envoyé par e-mail.";
const MESSAGE_GENERIQUE_ECHEC_RESET = "Code incorrect ou expiré. Vérifiez votre e-mail et réessayez.";

export interface DemandeReinitialisationState {
  message: string | null;
  // Toujours true des qu'un message est renvoye (le message lui-meme ne
  // distingue jamais succes/echec, voir docstring de module) : permet a
  // l'ecran de savoir qu'il peut proposer le lien vers l'etape suivante.
  soumis: boolean;
  // Code en clair, hors production uniquement, pour tester sans boite mail
  // reelle (meme principe que AuthActionState.codeDemo dans identity/actions.ts).
  // Absent si le compte n'existe pas (rien n'a ete genere), ce qui distingue
  // les deux cas UNIQUEMENT dans cet environnement de demonstration, jamais
  // en production ou ce champ n'est jamais renvoye.
  codeDemo?: string;
}

const schemaDemande = z.object({
  email: z.email("Adresse e-mail invalide."),
});

function genererCode(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, "0");
}

function gabaritEmailCode(code: string): string {
  return `
    <div style="font-family: Arial, sans-serif; color: #1d2530;">
      <p>Voici votre code de réinitialisation de mot de passe pour la Plateforme d'Intelligence Sanitaire du Bénin :</p>
      <p style="font-size: 28px; font-weight: 700; letter-spacing: 0.1em; color: #0a3764;">${code}</p>
      <p>Ce code expire dans ${DUREE_VALIDITE_CODE_MINUTES} minutes. Si vous n'êtes pas à l'origine de cette
      demande, ignorez cet e-mail : votre mot de passe actuel reste inchangé.</p>
    </div>
  `.trim();
}

function gabaritEmailConfirmation(): string {
  return `
    <div style="font-family: Arial, sans-serif; color: #1d2530;">
      <p>Votre mot de passe BHIP a été modifié.</p>
      <p>Si vous n'êtes pas à l'origine de ce changement, contactez le support dès que possible.</p>
    </div>
  `.trim();
}

/**
 * RG-AUTH-31 du pack (PLATFORM_ADMIN/AUDITOR exclus du libre-service, rôles
 * absents de ce dépôt) : routée vers admin_national, le rôle le plus proche
 * en responsabilité, pour rester rigoureux plutôt que de considérer la règle
 * sans objet. Verifiee des l'etape de demande (aucun code genere pour ce
 * role) : la reponse generique ne change pas, donc rien n'est devoile
 * (indiscernable d'un compte inexistant, voir docstring de module).
 */
function libreServiceExclu(roles: { nom: string }[]): boolean {
  return roles.some((role) => role.nom === "admin_national");
}

/**
 * Genere un code, invalide les codes non consommes precedents du meme compte
 * (une seule demande active a la fois, meme principe que
 * creerEtEnvoyerCodeVerificationEmail), l'enregistre (empreinte bcrypt
 * uniquement) puis l'envoie par e-mail.
 */
async function genererEtEnvoyerCodeReinitialisation(userId: string, email: string): Promise<string> {
  const code = genererCode();
  const codeHash = await bcrypt.hash(code, ROUNDS_BCRYPT);
  const expireLe = new Date(Date.now() + DUREE_VALIDITE_CODE_MINUTES * 60_000);

  await prisma.$transaction([
    prisma.codeReinitialisationMotDePasse.deleteMany({ where: { userId, consommeLe: null } }),
    prisma.codeReinitialisationMotDePasse.create({ data: { userId, codeHash, expireLe } }),
  ]);

  try {
    await envoyerEmail({
      to: email,
      subject: "Réinitialisation de votre mot de passe",
      html: gabaritEmailCode(code),
    });
  } catch (erreur) {
    // Meme choix que le code de connexion : en production, un code non livre
    // doit bloquer la demande (aucun autre moyen de le recevoir). Hors
    // production, le relais SMTP local n'est pas toujours joignable.
    if (getEnv().NODE_ENV === "production") {
      throw erreur;
    }
    console.error(
      "Envoi du code de reinitialisation par e-mail impossible (hors production, code affiche a l'ecran a la place) :",
      erreur
    );
  }

  return code;
}

async function verifierEtConsommerCodeReinitialisation(userId: string, code: string): Promise<boolean> {
  if (!/^\d{6}$/.test(code)) {
    return false;
  }

  const enregistrement = await prisma.codeReinitialisationMotDePasse.findFirst({
    where: { userId, consommeLe: null, expireLe: { gt: new Date() } },
    orderBy: { dateCreation: "desc" },
  });

  if (!enregistrement) {
    return false;
  }

  const valide = await bcrypt.compare(code, enregistrement.codeHash);

  await prisma.codeReinitialisationMotDePasse.update({
    where: { id: enregistrement.id },
    data: { consommeLe: new Date() },
  });

  return valide;
}

/**
 * Etape 1 (F-AUTH-04) : demande un code de reinitialisation par e-mail.
 * Renvoie TOUJOURS le meme message, que le compte existe ou non (CA-2) : la
 * seule difference observable en dehors de cet environnement de
 * demonstration est la reception (ou non) d'un e-mail, jamais la reponse de
 * cette action elle-meme.
 */
export async function demanderReinitialisationMotDePasseAction(
  prevState: DemandeReinitialisationState,
  formData: FormData
): Promise<DemandeReinitialisationState> {
  const validation = schemaDemande.safeParse({ email: formData.get("email") });

  if (!validation.success) {
    // Format d'e-mail invalide : seul cas ou l'on peut repondre differemment
    // sans rien reveler sur un compte particulier, la validation de format
    // ne portant sur aucun email reel.
    return { message: "Adresse e-mail invalide.", soumis: false };
  }

  const { email } = validation.data;

  // Au-dela de 3 demandes par heure pour un compte (20 pour une adresse), rien
  // n'est envoye et la reponse reste identique : sinon cette page servirait a
  // inonder de courriels la boite d'un tiers.
  const adresse = await adresseDeLaRequete();
  const autorise =
    verifierEtIncrementerDebit(`reinitialisation:demande:compte:${email.toLowerCase()}`, DEMANDES_MAX_PAR_COMPTE_PAR_HEURE, UNE_HEURE_MS).autorise &&
    (adresse === null ||
      verifierEtIncrementerDebit(`reinitialisation:demande:adresse:${adresse}`, DEMANDES_MAX_PAR_ADRESSE_PAR_HEURE, UNE_HEURE_MS).autorise);

  if (!autorise) {
    return { message: MESSAGE_GENERIQUE_DEMANDE, soumis: true };
  }

  try {
    const utilisateur = await prisma.user.findUnique({
      where: { email },
      include: { roles: true },
    });

    if (utilisateur && utilisateur.statut === "actif" && !libreServiceExclu(utilisateur.roles)) {
      const codeDemo = await genererEtEnvoyerCodeReinitialisation(utilisateur.id, utilisateur.email);
      return {
        message: MESSAGE_GENERIQUE_DEMANDE,
        soumis: true,
        codeDemo: codeAfficheALEcran(utilisateur.email) ? codeDemo : undefined,
      };
    }
  } catch (erreur) {
    console.error("Erreur lors de la demande de reinitialisation de mot de passe :", erreur);
    // Une erreur technique (ex. e-mail injoignable en production, voir
    // genererEtEnvoyerCodeReinitialisation) reste silencieuse cote reponse,
    // toujours pour ne rien reveler : seule la vraie erreur est journalisee
    // cote serveur (console.error ci-dessus).
  }

  return { message: MESSAGE_GENERIQUE_DEMANDE, soumis: true };
}

export interface ReinitialisationMotDePasseState {
  error: string | null;
  success: boolean;
}

const schemaReinitialisation = z
  .object({
    email: z.email("Adresse e-mail invalide."),
    code: z.string().trim().min(1, "Le code est obligatoire."),
    nouveauMotDePasse: z.string().min(1, "Le nouveau mot de passe est obligatoire."),
    confirmationMotDePasse: z.string(),
  })
  .refine((donnees) => donnees.nouveauMotDePasse === donnees.confirmationMotDePasse, {
    message: "Les deux mots de passe ne correspondent pas.",
    path: ["confirmationMotDePasse"],
  });

/**
 * Etape 2 (F-AUTH-04) : verifie le code puis change le mot de passe.
 * RG-AUTH-30 : refuse si le nouveau mot de passe est identique a l'actuel.
 * Message generique identique pour "compte inexistant" et "code incorrect ou
 * expire" (meme principe anti-enumeration qu'a l'etape 1).
 */
export async function reinitialiserMotDePasseAction(
  prevState: ReinitialisationMotDePasseState,
  formData: FormData
): Promise<ReinitialisationMotDePasseState> {
  const validation = schemaReinitialisation.safeParse({
    email: formData.get("email"),
    code: formData.get("code"),
    nouveauMotDePasse: formData.get("nouveauMotDePasse"),
    confirmationMotDePasse: formData.get("confirmationMotDePasse"),
  });

  if (!validation.success) {
    return {
      error: validation.error.issues[0]?.message ?? "Donnees invalides.",
      success: false,
    };
  }

  const { email, code, nouveauMotDePasse } = validation.data;

  // 5 echecs en 15 minutes : le code a 6 chiffres ne doit pas se deviner par
  // essais repetes. Meme message que tout autre echec (aucune fuite).
  if (limiteAtteinte(cleEchecsReinitialisation(email), ECHECS_MAX_PAR_COMPTE_PAR_QUINZE_MINUTES, QUINZE_MINUTES_MS)) {
    return { error: MESSAGE_GENERIQUE_ECHEC_RESET, success: false };
  }

  try {
    const utilisateur = await prisma.user.findUnique({ where: { email }, include: { roles: true, patient: true } });

    if (!utilisateur || utilisateur.statut !== "actif") {
      enregistrerEvenement(cleEchecsReinitialisation(email), QUINZE_MINUTES_MS);
      return { error: MESSAGE_GENERIQUE_ECHEC_RESET, success: false };
    }

    const codeValide = await verifierEtConsommerCodeReinitialisation(utilisateur.id, code);

    if (!codeValide) {
      enregistrerEvenement(cleEchecsReinitialisation(email), QUINZE_MINUTES_MS);
      return { error: MESSAGE_GENERIQUE_ECHEC_RESET, success: false };
    }

    // RG-AUTH-31 : verifiee ici aussi (pas seulement a la demande) - un code
    // valide ne suffit pas a contourner l'exclusion si, par hypothese, un
    // code avait malgre tout ete genere avant un changement de role.
    if (libreServiceExclu(utilisateur.roles)) {
      return { error: MESSAGE_GENERIQUE_ECHEC_RESET, success: false };
    }

    // RG-AUTH-02 et RG-AUTH-43 : politique de mot de passe (longueur selon le
    // role, mots courants, telephone, date de naissance). Verifiee apres le
    // code : un code faux ne renseigne jamais sur la politique.
    const erreurPolitique = evaluerMotDePasse(nouveauMotDePasse, {
      minimum: longueurMinimaleSelonRoles(utilisateur.roles.map((role) => role.nom)),
      contexte: {
        telephone: utilisateur.telephone,
        email: utilisateur.email,
        dateNaissance: utilisateur.patient?.dateNaissance,
      },
    });

    if (erreurPolitique) {
      return { error: erreurPolitique, success: false };
    }

    // RG-AUTH-30 : le nouveau mot de passe ne doit pas etre identique a l'actuel.
    const identiqueActuel = await bcrypt.compare(nouveauMotDePasse, utilisateur.motDePasseHash);
    if (identiqueActuel) {
      return {
        error: "Le nouveau mot de passe doit être différent de l'actuel.",
        success: false,
      };
    }

    const nouveauHash = await bcrypt.hash(nouveauMotDePasse, ROUNDS_BCRYPT);

    await prisma.user.update({ where: { id: utilisateur.id }, data: { motDePasseHash: nouveauHash } });

    // CA-1 (F-AUTH-09) : aucune session courante ici (parcours toujours
    // deconnecte), donc toutes les SessionActive du compte sont fermees.
    const sessionsFermees = await prisma.sessionActive.deleteMany({ where: { userId: utilisateur.id } });

    await journaliser({
      utilisateurId: utilisateur.id,
      action: "reinitialisation_mot_de_passe",
      donneeConcernee: `utilisateur:${utilisateur.id}`,
      adresseTechnique: "inconnue",
      justification: `Mot de passe reinitialise via le parcours mot de passe oublie (code e-mail verifie). ${sessionsFermees.count} session(s) active(s) fermee(s) (CA-1, F-AUTH-09).`,
    });

    try {
      await envoyerEmail({
        to: utilisateur.email,
        subject: "Votre mot de passe a été modifié",
        html: gabaritEmailConfirmation(),
      });
    } catch (erreur) {
      // Le mot de passe est deja change a ce stade : un e-mail de
      // confirmation manque ne doit jamais faire echouer l'operation
      // elle-meme (meme principe que les autres notifications "best effort"
      // de ce depot).
      console.error("Envoi de l'e-mail de confirmation de reinitialisation impossible :", erreur);
    }

    return { error: null, success: true };
  } catch (erreur) {
    console.error("Erreur lors de la reinitialisation du mot de passe :", erreur);
    return {
      error: "Une erreur est survenue. Veuillez réessayer.",
      success: false,
    };
  }
}
