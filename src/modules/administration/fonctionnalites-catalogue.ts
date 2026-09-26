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
] as const;

export type CleFonctionnalite = (typeof CLES_FONCTIONNALITES)[number];

export const DESCRIPTIONS_FONCTIONNALITES: Record<CleFonctionnalite, string> = {
  "ai.summary": "Resume automatique par IA d'un dossier ou d'une consultation.",
  "ai.citizen_assistant": "Assistant conversationnel IA pour le citoyen.",
  "sms.real_provider": "Envoi de SMS reels (passerelle operateur), au lieu du canal de notification interne uniquement.",
  "pharmacy.module": "Module pharmacie (delivrance des prescriptions).",
  "lab.module": "Module laboratoire (examens medicaux).",
  "community.module": "Module de suivi communautaire (agents de terrain).",
  "fhir.api": "Exposition d'une API HL7 FHIR reelle (aujourd'hui, seule la projection est documentee, jamais exposee).",
  "demo.banner": "Bandeau \"environnement de demonstration\" affiche sur toutes les pages.",
};
