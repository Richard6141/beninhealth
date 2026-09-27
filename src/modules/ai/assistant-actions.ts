"use server";

/**
 * Server Action de l'assistant citoyen d'orientation (F-IA-02, chapitre 16 du
 * pack). N'accede JAMAIS au dossier du patient : la question est traitee sur le
 * serveur par des regles deterministes (assistant.ts) et n'est ni conservee ni
 * transmise. Seul un compteur par type de reponse est journalise (RG-IA-08).
 *
 * Controles : session et role patient, fonctionnalite ai.citizen_assistant
 * active (RG-IA-02, relue en base a chaque appel), limite de 60 questions par
 * heure et par utilisateur.
 */

import { getSession } from "@/lib/session";
import { estFonctionnaliteActive } from "@/modules/administration/parametres";
import { lireParametre } from "@/modules/administration/parametres-lecture";
import { getAnnuairePublicEtablissements } from "@/modules/facility/annuaire-public";
import { can } from "@/security/permissions";
import {
  LIMITE_QUESTIONS_PAR_HEURE,
  MODELE_ASSISTANT,
  repondreQuestion,
  VERSION_BASE_ASSISTANT,
  type ReponseAssistant,
} from "./assistant";
import { compterAppelsDeLHeure, enregistrerAppelTermine, FONCTIONNALITE_ASSISTANT, type StatutAppel } from "./journal";

export interface ResultatAssistant {
  succes: boolean;
  erreur: string | null;
  reponse: ReponseAssistant | null;
}

function refus(erreur: string): ResultatAssistant {
  return { succes: false, erreur, reponse: null };
}

function statutJournal(reponse: ReponseAssistant): StatutAppel {
  if (reponse.type === "symptome") return "symptome";
  if (reponse.type === "inconnu") return "inconnu";
  return "ok";
}

/** Repond a une question pratique du citoyen connecte. */
export async function poserQuestionAssistantAction(question: string): Promise<ResultatAssistant> {
  const session = await getSession();
  if (!session || !session.roles.some((role) => can(role, "create", "assistant_citoyen"))) {
    return refus("Action réservée aux patients.");
  }
  if (typeof question !== "string") return refus("Question invalide.");

  if (!(await estFonctionnaliteActive("ai.citizen_assistant"))) return refus("L'assistant est désactivé.");

  if ((await compterAppelsDeLHeure(session.userId, FONCTIONNALITE_ASSISTANT)) >= LIMITE_QUESTIONS_PAR_HEURE) {
    return refus(`Limite atteinte : ${LIMITE_QUESTIONS_PAR_HEURE} questions par heure. Réessayez plus tard.`);
  }

  try {
    const debut = Date.now();
    const numeroUrgence = await lireParametre("urgence.numero_appel");
    const reponse = await repondreQuestion(question, {
      numeroUrgence,
      rechercherEtablissements: async (terme) => {
        const etablissements = await getAnnuairePublicEtablissements(terme);
        return etablissements.map((etablissement) => ({
          id: etablissement.id,
          nom: etablissement.nom,
          type: etablissement.type,
          localisation: etablissement.communeNom ?? etablissement.localisation,
        }));
      },
    });

    // Une question vide n'est pas un appel : rien n'est journalise ni compte dans la limite.
    if (reponse.type !== "vide") {
      await enregistrerAppelTermine(
        { utilisateurId: session.userId, patientId: null, fonctionnalite: FONCTIONNALITE_ASSISTANT, modele: MODELE_ASSISTANT, versionConsigne: VERSION_BASE_ASSISTANT },
        {
          statut: statutJournal(reponse),
          modele: MODELE_ASSISTANT,
          nombreSources: reponse.etablissements.length + (reponse.sujet ? 1 : 0),
          pucesLues: 0,
          pucesSupprimees: 0,
          dureeMs: Date.now() - debut,
        }
      );
    }

    return { succes: true, erreur: null, reponse };
  } catch (erreur) {
    console.error("[ia] echec de l'assistant citoyen", erreur);
    return refus("L'assistant n'a pas pu répondre. Réessayez plus tard.");
  }
}
