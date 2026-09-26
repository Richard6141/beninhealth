/**
 * Acheminement du code de confirmation au patient : WhatsApp (Wapy.pro) en
 * premier, puis SMS. Module serveur pur (pas de "use server"), appele
 * uniquement depuis actions.ts, dans after() pour que le delai de reponse ne
 * revele pas au professionnel si un patient a ete trouve.
 *
 * Le texte contient le code : il n'est jamais journalise ici, ni renvoye a
 * l'appelant.
 */

import { getEnv } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { normaliserTelephoneBenin } from "@/lib/telephone";
import { envoyerMessageWapy, wapyConfigure } from "@/lib/wapy";
import { creerNotification } from "@/modules/notification/creer";
import { envoyerSms } from "@/modules/notification/sms/envoyer";
import {
  DUREE_VALIDITE_CODE_MINUTES,
  composerMessageCode,
  libelleDuree,
  type MotifAcces,
} from "./code-acces";

export type CanalEnvoi = "whatsapp" | "sms_simule" | "aucun";

const LONGUEUR_MAX_NOM_ETABLISSEMENT_SMS = 40;

function composerTexteSms(p: {
  code: string;
  demandeur: string;
  etablissementNom: string;
  dureeAccesHeures: number;
}): string {
  // Le code vient en premier : formaterTexteSms tronque a 160 caracteres.
  const etablissement = p.etablissementNom.slice(0, LONGUEUR_MAX_NOM_ETABLISSEMENT_SMS);
  return `Code ${p.code} (${DUREE_VALIDITE_CODE_MINUTES} min) : ${p.demandeur}, ${etablissement}, demande l'acces a votre dossier ${libelleDuree(p.dureeAccesHeures)}. Inconnu ? Ne donnez pas ce code.`;
}

/**
 * Envoie `code` au patient de la demande `demandeId` et memorise le canal
 * utilise. Ne leve jamais : un echec d'envoi ne doit pas changer la reponse
 * faite au professionnel (voir docs/conception-transfert-dossier.md).
 */
export async function envoyerCodeDemande(params: {
  demandeId: string;
  code: string;
  numeroEnvoi: number;
}): Promise<CanalEnvoi> {
  try {
    const demande = await prisma.demandeAccesDossier.findUnique({
      where: { id: params.demandeId },
      include: {
        etablissement: true,
        patient: { include: { user: true } },
        demandeur: { include: { roles: true } },
      },
    });

    if (!demande || !demande.patient) {
      return "aucun";
    }

    const estMedecin = demande.demandeur.roles.some((role) => role.nom === "medecin");
    const titre = estMedecin ? "Dr." : "Infirmier(ère)";
    const nom = `${demande.demandeur.prenom} ${demande.demandeur.nom}`;
    const telephone = normaliserTelephoneBenin(demande.patient.user.telephone);
    const compteActif = demande.patient.user.statut === "actif";

    // Le patient qui utilise l'application voit la demande, lisible, dans ses
    // notifications : il peut l'autoriser ou la refuser sans dicter de code.
    if (compteActif && params.numeroEnvoi === 0) {
      try {
        await creerNotification(
          demande.patient.userId,
          "demande_acces_dossier",
          `${titre} ${nom} (${demande.etablissement.nom}) demande l'accès à votre dossier (${libelleDuree(demande.dureeAccesHeures)}). Répondez depuis votre espace patient dans les ${DUREE_VALIDITE_CODE_MINUTES} minutes.`,
          "/app/patient/demandes-acces"
        );
      } catch {
        // Le code par WhatsApp ou SMS reste disponible.
      }
    }

    let canal: CanalEnvoi = "aucun";

    if (telephone === null) {
      await prisma.demandeAccesDossier.update({ where: { id: demande.id }, data: { canal } });
      return canal;
    }

    if (wapyConfigure() && getEnv().NODE_ENV !== "test") {
      const resultat = await envoyerMessageWapy({
        destinataire: telephone,
        texte: composerMessageCode({
          code: params.code,
          titreProfessionnel: titre,
          nomProfessionnel: nom,
          etablissementNom: demande.etablissement.nom,
          motif: demande.motif as MotifAcces,
          dureeAccesHeures: demande.dureeAccesHeures,
          confirmationEnLigne: compteActif,
        }),
        consentement: `dossier-${demande.patient.identifiantSante}`,
        cleIdempotence: `acces-dossier-${demande.id}-${params.numeroEnvoi}`,
      });

      if (resultat.ok) {
        canal = "whatsapp";
      }
    }

    // Tant qu'aucun fournisseur SMS reel n'existe (F-NOT-02, HttpSmsProvider),
    // la boite d'envoi est simulee et consultable par l'administration : y
    // ecrire un code valide n'atteindrait aucun patient et l'exposerait a la
    // lecture. Repli SMS donc reserve aux environnements hors production.
    if (canal === "aucun" && getEnv().NODE_ENV !== "production") {
      await envoyerSms({
        destinataire: telephone,
        texte: composerTexteSms({
          code: params.code,
          demandeur: `${titre} ${nom}`.trim(),
          etablissementNom: demande.etablissement.nom,
          dureeAccesHeures: demande.dureeAccesHeures,
        }),
        categorie: "codes",
        modele: "acces_dossier_code",
      });
      canal = "sms_simule";
    }

    await prisma.demandeAccesDossier.update({ where: { id: demande.id }, data: { canal } });
    return canal;
  } catch (erreur) {
    console.error("Echec d'acheminement du code d'acces au dossier :", erreur instanceof Error ? erreur.name : "erreur");
    return "aucun";
  }
}
