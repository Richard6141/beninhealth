/**
 * Categories de notification (F-NOT-03 du pack), pour l'ecran de
 * preferences. Module pur (pas de "use server").
 *
 * RG-NOT-10 : les categories "securite" et "codes" ne peuvent jamais etre
 * desactivees (interne + SMS + email toujours actifs pour ces deux-la,
 * quand un canal existe). Elles ne sont donc PAS modifiables et n'ont pas
 * de ligne PreferenceNotification en base : leur etat est fixe, jamais lu
 * ni ecrit, seulement affiche verrouille sur l'ecran de preferences.
 *
 * Perimetre reduit et assume, comme convenu avec la session qui a confie ce
 * chantier (voir docs/coordination-agents.md) : ce depot n'a pas de vrai
 * canal SMS (aucun fournisseur, feature flag "sms.real_provider" jamais
 * active) ni de canal email pour les notifications elles-memes (seul usage
 * email reel : le code de connexion, src/lib/mail.ts, qui ne passe pas par
 * ce systeme de preferences). Les cases SMS/email des categories
 * modifiables sont enregistrees et relues fidelement. A l'emission
 * (creerNotification, creer.ts), la case SMS depose un SMS dans la boite
 * d'envoi simulee (F-NOT-02, aucun SMS reel ne part) ; la case email n'a
 * aucun effet, faute de canal email pour les notifications. Les categories
 * verrouillees ne declenchent pas encore de SMS depuis ce chemin.
 */

export type CategorieNotification =
  | "rendez_vous"
  | "resultats_documents"
  | "traitements"
  | "acces_dossier"
  | "informations_generales";

/** Categories RG-NOT-10 (verrouillees) : incluses ici pour F-NOT-02 (RG-NOT-04 : jamais differees), pas pour une preference modifiable. */
export type CategorieVerrouillee = "securite" | "codes";

export interface DefinitionCategorieNotification {
  code: CategorieNotification;
  libelle: string;
  description: string;
}

export const CATEGORIES_MODIFIABLES: DefinitionCategorieNotification[] = [
  {
    code: "rendez_vous",
    libelle: "Rendez-vous",
    description: "Confirmation, rappel, annulation d'un rendez-vous.",
  },
  {
    code: "resultats_documents",
    libelle: "Résultats et documents",
    description: "Résultat d'examen disponible, document médical ajouté à votre dossier.",
  },
  {
    code: "traitements",
    libelle: "Traitements",
    description: "Ordonnance disponible, délivrance en pharmacie.",
  },
  {
    code: "acces_dossier",
    libelle: "Accès à mon dossier",
    description: "Un professionnel demande ou obtient l'accès à votre dossier (référence, consentement).",
  },
  {
    code: "informations_generales",
    libelle: "Informations sanitaires générales",
    description: "Informations administratives ou sanitaires générales concernant votre dossier.",
  },
];

/** Catégories RG-NOT-10 : jamais désactivables, aucune ligne en base, toujours affichées verrouillées. */
export const CATEGORIES_VERROUILLEES: { code: CategorieVerrouillee; libelle: string; description: string }[] = [
  {
    code: "securite",
    libelle: "Sécurité",
    description: "Connexion, mot de passe, accès d'urgence à votre dossier.",
  },
  {
    code: "codes",
    libelle: "Codes",
    description: "Codes de vérification (connexion, partage de dossier).",
  },
];
