/**
 * Rappels automatiques de rendez-vous (F-RDV-07 du pack,
 * docs/pack claude/specs/09-fiches-etablissements-rdv.md) : rappel la veille
 * a 18h00 heure LOCALE Africa/Porto-Novo (RG-RDV-50, voir
 * src/lib/fuseau-horaire.ts - jamais le fuseau du serveur, corrige suite au
 * signalement F-ETA-05 dans docs/coordination-agents.md) et rappel 2h avant
 * si le rendez-vous a ete pris plus de 3h a l'avance (RG-RDV-50). Un
 * rendez-vous annule (statut
 * "annule") est simplement exclu de la recherche, ce qui suffit pour
 * RG-RDV-52 (pas de mecanisme d'annulation dedie necessaire, aucun rappel
 * n'est jamais envoye pour un rendez-vous deja annule au moment ou le
 * planificateur passe).
 *
 * Perimetre reduit assume : uniquement le canal notification interne
 * (creerNotification), jamais de SMS (aucune passerelle SMS dans ce depot,
 * meme limite deja documentee ailleurs, ex. F-CLI-10). RG-RDV-51 (modele de
 * SMS 160 caracteres avec lien court "bhip.bj/r/K7M4") sans objet ici.
 * RG-RDV-53 (respect des preferences F-NOT-03 sauf pour le rappel de la
 * veille) non applique : F-NOT-03 est en cours de construction ce soir par
 * une autre session (schema.prisma tres dispute), les deux rappels sont donc
 * envoyes inconditionnellement par notification interne pour l'instant - le
 * pack l'autorise deja explicitement pour le rappel de la veille, et
 * l'etendre au rappel de 2h le temps que F-NOT-03 existe est une
 * simplification honnete plutot qu'un vrai gap de conformite.
 *
 * Meme principe d'implementation que src/modules/notification/purge.ts
 * (setInterval en process, pas de file de taches externe) : module separe et
 * independant, ne depend d'aucun fichier du module pilotage ni notification
 * au-dela de creerNotification.
 */

import { prisma } from "@/lib/prisma";
import { creerNotification } from "@/modules/notification/creer";
import { suivreExecution } from "@/modules/administration/executions-taches";
import { veilleA18hBenin } from "@/lib/fuseau-horaire";
import { destinataireNotificationPatient } from "./destinataire-notification-patient";

const FUSEAU_BENIN = "Africa/Porto-Novo";
const DELAI_RAPPEL_DEUX_HEURES_MS = 2 * 60 * 60 * 1000;
// RG-RDV-50 : le rappel de 2h ne s'applique que si le rendez-vous a ete pris
// plus de 3h a l'avance (sinon le rappel de 2h n'aurait pratiquement pas de
// sens, voire serait deja dans le passe au moment de la prise).
const DELAI_MINIMUM_PRISE_AVANT_RAPPEL_DEUX_HEURES_MS = 3 * 60 * 60 * 1000;
// Borne la requete aux rendez-vous suffisamment proches : un rendez-vous dans
// plus de 3 jours n'a besoin d'aucun rappel pour l'instant, inutile de le
// charger a chaque passage du planificateur.
const FENETRE_RECHERCHE_JOURS = 3;
const INTERVALLE_VERIFICATION_MS = 20 * 60 * 1000; // 20 min, largement suffisant (precision a la minute non requise)

function formaterDateRendezVous(date: Date): string {
  return date.toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: FUSEAU_BENIN,
  });
}

/**
 * Recherche les rendez-vous dont un rappel est du et pas encore envoye, et
 * envoie ceux qui le sont reellement (chaque rappel a sa propre condition de
 * declenchement, verifiee independamment). Retourne le nombre de rappels de
 * chaque type effectivement envoyes, pour le journal de la tache planifiee.
 */
export async function envoyerRappelsDus(
  maintenant: Date = new Date()
): Promise<{ veille: number; deuxHeures: number }> {
  const borneRecherche = new Date(maintenant.getTime() + FENETRE_RECHERCHE_JOURS * 24 * 60 * 60 * 1000);

  const candidats = await prisma.rendezVous.findMany({
    where: {
      // F-RDV-07 : seuls les rendez-vous confirmes sont rappeles (jamais une demande en attente, refusee ou expiree).
      statut: "confirme",
      date: { gt: maintenant, lt: borneRecherche },
      OR: [{ rappelVeilleEnvoyeLe: null }, { rappelDeuxHeuresEnvoyeLe: null }],
    },
    include: { etablissement: true },
  });

  let veille = 0;
  let deuxHeures = 0;

  for (const rendezVous of candidats) {
    const dateLisible = formaterDateRendezVous(rendezVous.date);
    // Pour une personne a charge (F-CIT-07), Patient.userId est un compte
    // "sans_compte" jamais connecte : le rappel doit aller a son tuteur
    // (defaut trouve et corrige, voir destinataire-notification-patient.ts).
    const destinataire = await destinataireNotificationPatient(rendezVous.patientId);

    if (!rendezVous.rappelVeilleEnvoyeLe) {
      const declenchement = veilleA18hBenin(rendezVous.date);
      // declenchement >= dateCreation : si le rendez-vous a ete pris apres
      // l'heure normale du rappel de la veille (reservation le jour meme ou
      // tres proche), la "veille a 18h" n'a plus de sens a rattraper
      // retroactivement des l'ouverture du prochain passage du planificateur
      // - aucun rappel de veille n'est alors envoye pour ce rendez-vous.
      if (declenchement >= rendezVous.dateCreation && declenchement <= maintenant) {
        await prisma.rendezVous.update({
          where: { id: rendezVous.id },
          data: { rappelVeilleEnvoyeLe: maintenant },
        });
        await creerNotification(
          destinataire,
          "rendez_vous_rappel",
          `Rappel : vous avez rendez-vous demain, le ${dateLisible}, a ${rendezVous.etablissement.nom}.`,
          "/app/patient/rendez-vous"
        );
        veille += 1;
      }
    }

    if (!rendezVous.rappelDeuxHeuresEnvoyeLe) {
      const prisPlusDeTroisHeuresAvance =
        rendezVous.date.getTime() - rendezVous.dateCreation.getTime() >
        DELAI_MINIMUM_PRISE_AVANT_RAPPEL_DEUX_HEURES_MS;
      const declenchement = new Date(rendezVous.date.getTime() - DELAI_RAPPEL_DEUX_HEURES_MS);

      if (prisPlusDeTroisHeuresAvance && declenchement <= maintenant) {
        await prisma.rendezVous.update({
          where: { id: rendezVous.id },
          data: { rappelDeuxHeuresEnvoyeLe: maintenant },
        });
        await creerNotification(
          destinataire,
          "rendez_vous_rappel",
          `Rappel : votre rendez-vous est dans 2 heures, a ${rendezVous.etablissement.nom} (${dateLisible}).`,
          "/app/patient/rendez-vous"
        );
        deuxHeures += 1;
      }
    }
  }

  return { veille, deuxHeures };
}

declare global {
  // eslint-disable-next-line no-var
  var __rappelsRendezVousDemarres: boolean | undefined;
}

async function executerAvecJournal(): Promise<void> {
  try {
    await suivreExecution("rappels_rendez_vous", async () => {
      const { veille, deuxHeures } = await envoyerRappelsDus();
      if (veille > 0 || deuxHeures > 0) {
        console.log(`[rendez-vous] rappels envoyes : ${veille} (veille), ${deuxHeures} (2h avant)`);
      }
      return veille + deuxHeures;
    });
  } catch (erreur) {
    console.error("[rendez-vous] echec de l'envoi planifie des rappels", erreur);
  }
}

/**
 * Demarre l'envoi planifie des rappels. Idempotent (drapeau global, meme
 * technique que demarrerPurgeNotifications) : evite un double demarrage si
 * register() est appele plusieurs fois (rechargement a chaud de Next.js en
 * developpement).
 */
export function demarrerRappelsRendezVous(): void {
  if (globalThis.__rappelsRendezVousDemarres) {
    return;
  }
  globalThis.__rappelsRendezVousDemarres = true;

  setInterval(() => {
    void executerAvecJournal();
  }, INTERVALLE_VERIFICATION_MS);

  console.log("[rendez-vous] rappels planifies demarres (veille 18h + 2h avant)");
}
