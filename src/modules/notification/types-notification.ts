/**
 * Correspondance entre le type technique d'une notification interne (colonne
 * Notification.type, chaine libre posee par chaque appelant de
 * creerNotification) et la categorie de preferences du pack (F-NOT-03).
 * Module pur (pas de "use server").
 *
 * Seuls les types destines au patient qui correspondent a une categorie
 * MODIFIABLE y figurent. Un type absent (notification a un professionnel,
 * categories verrouillees "securite" et "codes" comme acces_urgence, type
 * inconnu) n'ouvre AUCUN canal externe par ce chemin : c'est le choix sur,
 * jamais un SMS envoye sur une correspondance devinee.
 *
 * Limite assumee : les categories verrouillees (RG-NOT-10, toujours actives
 * sur tous les canaux) ne declenchent pas encore de SMS depuis ici ; elles
 * devront etre cablees a leur source (N-EMERGENCY-ACCESS, N-NEW-DEVICE...).
 */

import type { CategorieNotification } from "./categories";

const CATEGORIE_PAR_TYPE: Readonly<Record<string, CategorieNotification>> = {
  rendez_vous_confirme: "rendez_vous",
  rendez_vous_rappel: "rendez_vous",
  rendez_vous_annule_fermeture_etablissement: "rendez_vous",
  rendez_vous_annule_par_etablissement: "rendez_vous",
  rendez_vous_refuse: "rendez_vous",
  rendez_vous_expire: "rendez_vous",
  resultat_examen_disponible: "resultats_documents",
  examen_annule: "resultats_documents",
  echantillon_rejete: "resultats_documents",
  consultation: "resultats_documents",
  prescription: "traitements",
  delivrance: "traitements",
  demande_acces_dossier: "acces_dossier",
  reponse_demande_personne: "informations_generales",
};

/** Categorie de preferences d'un type de notification, ou null si aucun canal externe ne doit etre ouvert. */
export function categorieDuType(type: string): CategorieNotification | null {
  return CATEGORIE_PAR_TYPE[type] ?? null;
}
