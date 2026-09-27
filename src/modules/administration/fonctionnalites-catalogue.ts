/**
 * Catalogue des fonctionnalites activables du MVP (F-ADM-07 du pack, section
 * 15). Module pur (pas de "use server", qui interdirait d'exporter autre
 * chose que des fonctions async) : une future fonctionnalite qui doit
 * verifier une de ces cles l'importe directement d'ici plutot que de
 * recopier la chaine, pour eviter une faute de frappe silencieuse. Voir
 * src/modules/administration/parametres.ts pour la lecture/ecriture en base.
 */

export const CLES_FONCTIONNALITES = [
  "ai.summary",
  "ai.citizen_assistant",
  "sms.real_provider",
  "pharmacy.module",
  "lab.module",
  "community.module",
  "fhir.api",
  "demo.banner",
  "access.by_npi",
  "professionnels.exige_validation_ordre",
  "securite.mfa_obligatoire",
] as const;

export type CleFonctionnalite = (typeof CLES_FONCTIONNALITES)[number];

/**
 * Etat d'une fonctionnalite quand aucune ligne n'existe encore en base.
 * Les 3 modules metier (pharmacie, laboratoire, communautaire) sont ACTIFS par
 * defaut : ils existent et fonctionnent, seule une decision explicite de
 * l'administration nationale les retire. Toutes les autres fonctionnalites
 * (IA, fournisseur SMS reel, API FHIR, bandeau de demonstration, acces par
 * NPI, exigence du numero d'Ordre) sont DESACTIVEES par defaut (RG-IA-02).
 */
export const ACTIVE_PAR_DEFAUT: Record<CleFonctionnalite, boolean> = {
  "ai.summary": false,
  "ai.citizen_assistant": false,
  "sms.real_provider": false,
  "pharmacy.module": true,
  "lab.module": true,
  "community.module": true,
  "fhir.api": false,
  "demo.banner": false,
  "access.by_npi": false,
  "professionnels.exige_validation_ordre": false,
  "securite.mfa_obligatoire": false,
};

export const DESCRIPTIONS_FONCTIONNALITES: Record<CleFonctionnalite, string> = {
  "ai.summary": "Resume automatique par IA d'un dossier ou d'une consultation.",
  "ai.citizen_assistant": "Assistant conversationnel IA pour le citoyen.",
  "sms.real_provider": "Envoi de SMS reels (passerelle operateur), au lieu du canal de notification interne uniquement.",
  "pharmacy.module": "Module pharmacie (delivrance des prescriptions).",
  "lab.module": "Module laboratoire (examens medicaux).",
  "community.module": "Module de suivi communautaire (agents de terrain).",
  "fhir.api": "Exposition d'une API HL7 FHIR reelle (aujourd'hui, seule la projection est documentee, jamais exposee).",
  "demo.banner": "Bandeau \"environnement de demonstration\" affiche sur toutes les pages.",
  "access.by_npi":
    "Acces au dossier d'un patient par son NPI (avec code de confirmation). A n'activer avec des donnees reelles qu'apres l'autorisation de l'APDP (art. 407 du Code du numerique).",
  "professionnels.exige_validation_ordre":
    "Exige que le numero d'Ordre du professionnel ait ete verifie par le ministere (moins d'un an) pour les actes sensibles : demande d'acces par code ou NPI, signature d'une prescription, validation d'une consultation. Desactive par defaut (demonstration et integration des etablissements) ; a activer en production.",
  "securite.mfa_obligatoire":
    "Rend la double authentification obligatoire pour tous les comptes sauf patient (F-AUTH-06) : sans elle, le compte ne peut qu'activer son second facteur. Desactive par defaut (demonstration) ; a activer en production.",
};
