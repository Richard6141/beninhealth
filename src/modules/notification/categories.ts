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
 * modifiables sont donc bien enregistrees et relues fidelement, mais n'ont
 * aujourd'hui AUCUN effet reel sur l'envoi : seul le canal interne
 * (affichage dans /app/notifications) est reellement actif. A cabler
 * veritablement le jour ou un fournisseur SMS/email existe.
 */

export type CategorieNotification =
  | "rendez_vous"
  | "resultats_documents"
  | "traitements"
  | "acces_dossier"
  | "informations_generales";

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
export const CATEGORIES_VERROUILLEES = [
  {
    libelle: "Sécurité",
    description: "Connexion, mot de passe, accès d'urgence à votre dossier.",
  },
  {
    libelle: "Codes",
    description: "Codes de vérification (connexion, partage de dossier).",
  },
];
