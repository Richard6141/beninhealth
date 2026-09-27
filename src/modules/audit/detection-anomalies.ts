/**
 * Detection d'anomalies d'acces (F-AUD-03 du pack), regles de detection et
 * tache planifiee. Module pur (pas de "use server") : aucune de ces
 * fonctions n'est un point d'entree, appelees uniquement par
 * src/instrumentation.ts (tache planifiee) et par les tests.
 *
 * Deplace hors de audit/anomalies.ts (qui reste "use server") pour corriger
 * un ecart reel du pack ("executees chaque heure") : la detection tournait
 * auparavant a l'interieur d'une lecture (getSignalementsAnomalies, appelee
 * au chargement de l'ecran, donc une ecriture dans un GET) et ne s'executait
 * jamais si personne n'ouvrait l'ecran. Meme principe que les autres taches
 * planifiees de ce depot (purge.ts, relances.ts) : setInterval en process,
 * suivi dans ExecutionTache (F-ADM-01), reclamation idempotente par
 * signalerSiNouveau (jamais de doublon meme si deux instances tournent).
 *
 * RG-ADM-50 : les 3 seuils sont administrables (parametres.ts), relus a
 * chaque execution, jamais mis en cache.
 *
 * 4 des 7 regles du pack sont implementees ici, celles calculables sans
 * ajouter de journalisation dans un module hors de ce perimetre (limite
 * assumee, documentee dans docs/reste-a-faire.md) : les 3 autres (recherches
 * sans resultat, acces refuses au sens large, arrivees "sur piece") exigent
 * soit une instrumentation qui n'existe pas encore dans les modules
 * proprietaires (F-CLI-02, F-RDV-04), soit un champ Prisma absent (methode
 * de verification d'arrivee).
 */

import { prisma } from "@/lib/prisma";
import { lireParametre } from "@/modules/administration/parametres-lecture";
import { suivreExecution } from "@/modules/administration/executions-taches";

const INTERVALLE_VERIFICATION_MS = 60 * 60 * 1000; // "chaque heure" (pack)

declare global {
  var __detectionAnomaliesDemarree: boolean | undefined;
}

/**
 * Cree un signalement pour (regle, utilisateurId) s'il n'en existe pas deja
 * un ouvert (statut "nouveau") pour ce meme couple : une execution horaire
 * repetee ne duplique jamais un signalement pas encore traite.
 */
async function signalerSiNouveau(regle: string, utilisateurId: string, detail: string): Promise<void> {
  const existant = await prisma.signalementAnomalieAcces.findFirst({
    where: { regle, utilisateurId, statut: "nouveau" },
  });
  if (existant) return;

  await prisma.signalementAnomalieAcces.create({ data: { regle, utilisateurId, detail } });
}

/**
 * Execute les 4 regles de detection implementees et cree les signalements
 * correspondants. Volontairement silencieux sur les erreurs individuelles
 * d'une regle : une regle en echec ne doit jamais empecher les autres de
 * s'executer. Retourne le nombre de signalements nouvellement crees.
 */
export async function executerDetectionAnomalies(maintenant: Date = new Date()): Promise<number> {
  const il7Jours = new Date(maintenant.getTime() - 7 * 24 * 60 * 60 * 1000);
  const il1Heure = new Date(maintenant.getTime() - 60 * 60 * 1000);
  const debutJour = new Date(maintenant);
  debutJour.setHours(0, 0, 0, 0);

  const [seuilAccesUrgence7j, seuilIpMultiples1h, seuilDossiersDistinctsJour] = await Promise.all([
    lireParametre("audit.seuil_acces_urgence_7j"),
    lireParametre("audit.seuil_ip_multiples_1h"),
    lireParametre("audit.seuil_dossiers_distincts_jour"),
  ]);

  let nombreCrees = 0;

  try {
    const accesUrgence = await prisma.journalAudit.findMany({
      where: { action: "acces_urgence", date: { gte: il7Jours } },
      select: { utilisateurId: true },
    });
    const parProfessionnel = new Map<string, number>();
    for (const entree of accesUrgence) {
      parProfessionnel.set(entree.utilisateurId, (parProfessionnel.get(entree.utilisateurId) ?? 0) + 1);
    }
    for (const [utilisateurId, nombre] of parProfessionnel) {
      if (nombre > seuilAccesUrgence7j) {
        await signalerSiNouveau(
          "acces_urgence_frequents",
          utilisateurId,
          `${nombre} accès d'urgence déclenchés sur les 7 derniers jours (seuil : ${seuilAccesUrgence7j}).`
        );
        nombreCrees += 1;
      }
    }
  } catch (erreur) {
    console.error("[audit] erreur regle acces_urgence_frequents :", erreur);
  }

  try {
    const connexions = await prisma.journalAudit.findMany({
      where: { action: "connexion", date: { gte: il1Heure } },
      select: { utilisateurId: true, adresseTechnique: true },
    });
    const ipParUtilisateur = new Map<string, Set<string>>();
    for (const entree of connexions) {
      const ips = ipParUtilisateur.get(entree.utilisateurId) ?? new Set<string>();
      ips.add(entree.adresseTechnique);
      ipParUtilisateur.set(entree.utilisateurId, ips);
    }
    for (const [utilisateurId, ips] of ipParUtilisateur) {
      if (ips.size > seuilIpMultiples1h) {
        await signalerSiNouveau(
          "connexions_ip_multiples",
          utilisateurId,
          `${ips.size} adresses techniques différentes en 1 heure (seuil : ${seuilIpMultiples1h}).`
        );
        nombreCrees += 1;
      }
    }
  } catch (erreur) {
    console.error("[audit] erreur regle connexions_ip_multiples :", erreur);
  }

  try {
    const consultationsResume = await prisma.journalAudit.findMany({
      where: { action: "consultation_resume_patient", date: { gte: debutJour } },
      select: { utilisateurId: true, donneeConcernee: true },
    });

    const dossiersParUtilisateur = new Map<string, Set<string>>();
    for (const entree of consultationsResume) {
      const dossiers = dossiersParUtilisateur.get(entree.utilisateurId) ?? new Set<string>();
      dossiers.add(entree.donneeConcernee);
      dossiersParUtilisateur.set(entree.utilisateurId, dossiers);
    }
    for (const [utilisateurId, dossiers] of dossiersParUtilisateur) {
      if (dossiers.size > seuilDossiersDistinctsJour) {
        await signalerSiNouveau(
          "dossiers_distincts_eleves",
          utilisateurId,
          `${dossiers.size} dossiers patients distincts ouverts aujourd'hui (seuil : ${seuilDossiersDistinctsJour}).`
        );
        nombreCrees += 1;
      }
    }

    const patientIds = consultationsResume
      .map((e) => (e.donneeConcernee.startsWith("patient:") ? e.donneeConcernee.slice("patient:".length) : null))
      .filter((id): id is string => id !== null);

    if (patientIds.length > 0) {
      const [professionnels, patients] = await Promise.all([
        prisma.user.findMany({
          where: { id: { in: [...new Set(consultationsResume.map((e) => e.utilisateurId))] } },
          select: { id: true, nom: true },
        }),
        prisma.patient.findMany({
          where: { id: { in: [...new Set(patientIds)] } },
          include: { user: { select: { nom: true } } },
        }),
      ]);
      const nomParProfessionnel = new Map(professionnels.map((p) => [p.id, p.nom.toLowerCase()]));
      const nomParPatient = new Map(patients.map((p) => [p.id, p.user.nom.toLowerCase()]));

      for (const entree of consultationsResume) {
        if (!entree.donneeConcernee.startsWith("patient:")) continue;
        const patientId = entree.donneeConcernee.slice("patient:".length);
        const nomProfessionnel = nomParProfessionnel.get(entree.utilisateurId);
        const nomPatient = nomParPatient.get(patientId);
        if (nomProfessionnel && nomPatient && nomProfessionnel === nomPatient) {
          await signalerSiNouveau(
            "nom_famille_identique",
            entree.utilisateurId,
            `Dossier consulté d'un patient partageant le même nom de famille (${nomPatient}).`
          );
          nombreCrees += 1;
        }
      }
    }
  } catch (erreur) {
    console.error("[audit] erreur regles dossiers_distincts_eleves/nom_famille_identique :", erreur);
  }

  return nombreCrees;
}

async function executerDetectionAvecJournal(): Promise<void> {
  try {
    await suivreExecution("detection_anomalies_acces", async () => {
      const nombreCrees = await executerDetectionAnomalies();
      if (nombreCrees > 0) {
        console.log(`[audit] detection d'anomalies : ${nombreCrees} nouveau(x) signalement(s)`);
      }
      return nombreCrees;
    });
  } catch (erreur) {
    console.error("[audit] echec de la detection planifiee d'anomalies", erreur);
  }
}

/** Demarre la detection planifiee (toutes les heures, pack : "executees chaque heure"). Idempotent (drapeau global). */
export function demarrerDetectionAnomalies(): void {
  if (globalThis.__detectionAnomaliesDemarree) {
    return;
  }
  globalThis.__detectionAnomaliesDemarree = true;

  setInterval(() => {
    void executerDetectionAvecJournal();
  }, INTERVALLE_VERIFICATION_MS);

  console.log("[audit] detection planifiee d'anomalies d'acces demarree (toutes les heures)");
}
