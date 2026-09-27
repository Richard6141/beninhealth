/**
 * Marquage automatique des absences (RG-RDV-40) et cloture des visites
 * abandonnees (RG-RDV-41). Module serveur SANS "use server" :
 * `marquerAbsencesDues(date)`/`cloturerVisitesAbandonnees(date)` passeraient
 * sinon pour des points d'entree atteignables par POST, qui permettraient a
 * n'importe qui de declarer "absents" ou "termines" des rendez-vous d'une
 * date de son choix.
 */

import { prisma } from "@/lib/prisma";
import { suivreExecution } from "@/modules/administration/executions-taches";
import { transitionnerRendezVousEnMasse } from "./rendez-vous-etats";

const DELAI_ABSENCE_MS = 60 * 60 * 1000; // 1h (RG-RDV-33/40)
const INTERVALLE_VERIFICATION_MS = 60 * 60 * 1000; // horaire (RG-RDV-40)

// RG-RDV-41 : "le contexte de soins se ferme 24h apres la cloture de la
// visite (et au plus tard 72h apres l'ouverture)". Simplification assumee :
// ce depot n'a pas d'entite Visite distincte du rendez-vous (le rendez-vous
// EST la visite, statut "en_consultation" = IN_CARE du pack), donc pas de
// date de "cloture" separee de celle d'"ouverture" a partir de laquelle
// calculer les deux seuils du pack. heureArrivee (l'ouverture reelle de la
// visite) sert de seul repere, avec un seuil unique de 24h (le plus cite du
// texte du pack pour ce cas). Verifiee au meme rythme horaire que RG-RDV-40
// (le pack imagine une tache distincte a 23h precises) : sans consequence
// pratique, une visite abandonnee est fermee au plus tard 1h plus tard que
// prevu, jamais plus tard.
const DELAI_CLOTURE_VISITE_MS = 24 * 60 * 60 * 1000;

/**
 * RG-RDV-41 : ferme (statut "termine") les rendez-vous restes "en_consultation"
 * (visite ouverte, IN_CARE) plus de 24h apres l'arrivee du patient, filet de
 * securite pour une visite jamais close par un soignant (consultation jamais
 * validee, ou demarree par erreur). Bornee a une fenetre de recherche de
 * quelques jours, meme raison que marquerAbsencesDues ci-dessous.
 *
 * N'utilise PAS transitionnerRendezVousEnMasse ("terminer" a un `depuis` plus
 * large que la seule "en_consultation" : demande/confirme/absent aussi,
 * requis pour la validation manuelle d'une consultation) : un `where` direct
 * et exact sur "en_consultation" evite de fermer, par exemple, un rendez-vous
 * "confirme" ou le patient est arrive (heureArrivee posee) mais n'a encore
 * jamais ete pris en charge, cas different de celui vise ici.
 */
export async function cloturerVisitesAbandonnees(maintenant: Date = new Date()): Promise<number> {
  const borneBasse = new Date(maintenant.getTime() - 10 * 24 * 60 * 60 * 1000);

  const resultat = await prisma.rendezVous.updateMany({
    where: {
      statut: "en_consultation",
      heureArrivee: { gte: borneBasse, lt: new Date(maintenant.getTime() - DELAI_CLOTURE_VISITE_MS) },
    },
    data: { statut: "termine" },
  });

  return resultat.count;
}

/**
 * RG-RDV-40 : marque "absent" les rendez-vous "confirme" dont l'heure est
 * depassee de plus d'1h sans arrivee. Bornee a une fenetre de recherche de
 * quelques jours (comme rappels-rendez-vous.ts) pour ne jamais reparcourir
 * tout l'historique a chaque passage.
 */
export async function marquerAbsencesDues(maintenant: Date = new Date()): Promise<number> {
  const borneBasse = new Date(maintenant.getTime() - 3 * 24 * 60 * 60 * 1000);

  return transitionnerRendezVousEnMasse(prisma, "marquer_absent", {
    conditions: {
      heureArrivee: null,
      date: { gte: borneBasse, lt: new Date(maintenant.getTime() - DELAI_ABSENCE_MS) },
    },
  });
}

declare global {
  // eslint-disable-next-line no-var
  var __absencesRendezVousDemarrees: boolean | undefined;
}

async function executerAvecJournal(): Promise<void> {
  try {
    await suivreExecution("marquage_absences", async () => {
      const nombre = await marquerAbsencesDues();
      const cloturees = await cloturerVisitesAbandonnees();
      if (nombre > 0) {
        console.log(`[rendez-vous] ${nombre} rendez-vous marque(s) absent (RG-RDV-40)`);
      }
      if (cloturees > 0) {
        console.log(`[rendez-vous] ${cloturees} visite(s) abandonnee(s) cloturee(s) (RG-RDV-41)`);
      }
      return nombre + cloturees;
    });
  } catch (erreur) {
    console.error("[rendez-vous] echec du marquage automatique des absences", erreur);
  }
}

/**
 * Demarre le marquage planifie des absences. Idempotent (drapeau global,
 * meme technique que demarrerRappelsRendezVous/demarrerPurgeNotifications).
 */
export function demarrerMarquageAbsences(): void {
  if (globalThis.__absencesRendezVousDemarrees) {
    return;
  }
  globalThis.__absencesRendezVousDemarrees = true;

  setInterval(() => {
    void executerAvecJournal();
  }, INTERVALLE_VERIFICATION_MS);

  console.log("[rendez-vous] marquage planifie des absences et cloture des visites abandonnees demarre (horaire, RG-RDV-40/41)");
}
