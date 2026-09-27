/**
 * Fiches des fonctionnalites d'IA (F-IA-05 : objectif, donnees utilisees,
 * modele et version, consigne systeme et sa version, limites connues).
 * Module pur : texte statique versionne avec le code, donc toujours en phase
 * avec la consigne et les regles reellement appliquees.
 */

import type { CleFonctionnalite } from "@/modules/administration/fonctionnalites-catalogue";
import { CONSIGNE_SYSTEME_RESUME, LIMITE_RESUMES_PAR_HEURE, MOIS_HISTORIQUE_RESUME, NOMBRE_MAX_PUCES, VERSION_CONSIGNE_RESUME } from "./regles";

export interface FicheIa {
  id: string;
  titre: string;
  fiche: string;
  /** Fonctionnalite activable qui gouverne cet usage (F-ADM-07). */
  cleFonctionnalite: CleFonctionnalite;
  objectif: string;
  donneesUtilisees: string[];
  donneesExclues: string[];
  versionConsigne: string;
  consigne: string;
  limites: string[];
}

export const FICHES_IA: readonly FicheIa[] = [
  {
    id: "resume_dossier",
    titre: "Résumé de dossier pour le médecin",
    fiche: "F-IA-01",
    cleFonctionnalite: "ai.summary",
    objectif:
      "Aider un médecin à relire rapidement un dossier : au plus " +
      `${NOMBRE_MAX_PUCES} puces, chacune reliée à l'élément du dossier qui la justifie. L'IA assiste, elle ne remplace pas le professionnel : ` +
      "aucun diagnostic, aucun traitement proposé, rien n'est enregistré dans le dossier ni envoyé au patient.",
    donneesUtilisees: [
      `Allergies, maladies chroniques et antécédents déclarés`,
      `Prescriptions des ${MOIS_HISTORIQUE_RESUME} derniers mois (médicament, posologie, durée)`,
      `Résultats d'examens anormaux des ${MOIS_HISTORIQUE_RESUME} derniers mois (paramètre, valeur, indicateur)`,
      `Consultations des ${MOIS_HISTORIQUE_RESUME} derniers mois (motif, conclusion)`,
      `Vaccinations des ${MOIS_HISTORIQUE_RESUME} derniers mois`,
      "Âge et sexe du patient, désigné seulement par « le patient »",
    ],
    donneesExclues: [
      "Nom, prénoms, téléphone, adresse, identifiant santé, NPI, e-mail (retirés des textes libres, puis contrôle final avant tout appel)",
      "Noms des proches et des professionnels, remplacés par « [retiré] »",
      "Tout élément d'un groupe de maladies sensible (VIH, santé mentale, IST, violences, addictions, interruption de grossesse) et tout examen sensible",
    ],
    versionConsigne: VERSION_CONSIGNE_RESUME,
    consigne: CONSIGNE_SYSTEME_RESUME,
    limites: [
      "Le fournisseur actuel fonctionne par règles locales : une puce par élément, sans reformulation ni synthèse. Aucun modèle de langage externe n'est branché.",
      "La détection des éléments sensibles repose sur des mots-clés, faute de codage CIM-10 systématique : en cas de doute, l'élément est écarté.",
      "Seuls les résultats anormaux sont repris ; un dossier sans résultat structuré ne produit pas de puce d'examen.",
      `Limite d'usage : ${LIMITE_RESUMES_PAR_HEURE} résumés par heure et par médecin. Moins de 2 puces conformes : « résumé indisponible ».`,
      "Données fictives uniquement tant que l'autorité de protection des données n'a pas autorisé le traitement (RG-IA-03).",
    ],
  },
];
