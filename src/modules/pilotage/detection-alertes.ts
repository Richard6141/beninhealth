/**
 * Detection des alertes epidemiologiques (F-PIL-06 du pack), regle de
 * detection et tache planifiee. Module pur (pas de "use server") : aucune de
 * ces fonctions n'est un point d'entree, appelees uniquement par
 * src/instrumentation.ts (tache planifiee) et par les tests.
 *
 * Deplace hors de pilotage/alertes.ts (qui reste "use server") le
 * 2026-09-28 : la detection tournait auparavant a l'interieur d'une lecture
 * (getAlertesEpidemiologiques, appelee au chargement de /app/pilotage et de
 * /app/pilotage/alertes, donc une ecriture pendant un GET) et ne s'executait
 * jamais si personne n'ouvrait ces ecrans. Meme patron que
 * audit/detection-anomalies.ts (F-AUD-03) : setInterval en process, suivi
 * dans ExecutionTache (F-ADM-01), reclamation idempotente (createMany avec
 * skipDuplicates sur la contrainte unique (zoneSanitaireId, groupeMaladies,
 * semaine) de HealthAlertReview : jamais de doublon, meme si deux instances
 * tournent en meme temps ou si la tache repasse toutes les heures).
 *
 * Source : uniquement AgregatQuotidien (IND-03), jamais Consultation
 * (RG-PIL-01). Granularite REELLEMENT ecrite par agregation.ts : une ligne
 * IND-03 par (jour UTC, etablissementId, groupe, sexe, tranche d'age), avec
 * zoneSanitaireId et departementId toujours nuls ; les seules lignes IND-03
 * sans etablissement sont celles des groupes SENSITIVE (par departement,
 * RG-PIL-05), dont aucun n'est surveille ici. La zone sanitaire est donc
 * resolue via l'etablissement :
 *   1. EtablissementSanitaire.zoneSanitaireId s'il est renseigne (seed) ;
 *   2. sinon, la zone "a affiner" du departement de sa commune
 *      (code "<DEP>-A-AFFINER", referentiel-territoire.ts), qui represente
 *      par construction le departement entier tant que le decoupage officiel
 *      n'est pas saisi. Necessaire : l'import CSV (F-ADM-02) et le
 *      provisionnement ministeriel (identity/gestion-comptes.ts) renseignent
 *      communeId mais jamais zoneSanitaireId, ces etablissements etaient
 *      auparavant ignores en silence ;
 *   3. sinon (ni zone, ni zone "a affiner" dans son departement) :
 *      etablissement ignore, et compte dans le journal de la tache pour que
 *      l'exclusion reste visible. Aucune zone n'est creee par cette tache
 *      (elle n'ecrit jamais dans le referentiel territorial).
 *
 * Regle du pack : pour chaque zone et chaque groupe surveille, alerte si les
 * cas de la semaine depassent la moyenne des 8 semaines precedentes + 2
 * ecarts-types, avec un minimum de 10 cas ; 1 cas suffit pour une maladie a
 * declaration immediate. Semaines ISO calculees en UTC, comme les dates des
 * agregats (minuit UTC, agregation.ts) : jamais de decalage de semaine selon
 * le fuseau du serveur.
 *
 * Semaines evaluees a chaque passage : la semaine ecoulee (celle du pack) ET
 * la semaine en cours (signal plus precoce, la tache etant horaire). La
 * semaine ecoulee reste evaluee car un recalcul tardif (tache nocturne de 90
 * jours, consultation validee en retard) peut la faire franchir le seuil
 * apres coup. Une alerte deja creee pour une semaine n'est jamais mise a
 * jour : casObserves reste la valeur au moment de la detection (limite
 * assumee, affichee comme telle a l'ecran).
 *
 * Historique : les 8 semaines qui precedent la semaine evaluee, une semaine
 * sans aucune ligne comptant pour 0 cas (agregation.ts n'ecrit aucune ligne
 * quand le compte est nul : l'absence de ligne signifie bien 0 cas, pas une
 * donnee manquante). Corrige le 2026-09-28 : l'ancienne version ne moyennait
 * que les semaines ayant au moins un cas, ce qui gonflait la moyenne et le
 * seuil. Limite assumee : juste apres la mise en service, les semaines
 * anterieures au premier agregat comptent aussi pour 0 (indistinguables au
 * niveau des agregats) ; le minimum de 10 cas protege alors des faux
 * positifs sur de tres petits effectifs.
 *
 * Limite assumee, liste "declaration immediate" : le pack la dit
 * "parametrable", mais le systeme de parametres administrables de ce depot
 * (administration/parametres-catalogue.ts, RG-ADM-50) ne gere que des
 * valeurs numeriques bornees ; une liste de groupes demanderait d'etendre ce
 * systeme (type de valeur, ecran d'edition). Elle reste donc en dur
 * ci-dessous : rougeole, meningite, fievre hemorragique (caractere
 * epidemique aigu), paludisme et diarrhee etant endemiques et couverts par la
 * regle statistique. A ajuster si le ministere fournit une vraie liste.
 */

import { prisma } from "@/lib/prisma";
import { suivreExecution } from "@/modules/administration/executions-taches";

export const GROUPES_SURVEILLES = ["paludisme", "diarrhee", "rougeole", "meningite", "fievre_hemorragique"] as const;
const GROUPES_SURVEILLES_ENSEMBLE: ReadonlySet<string> = new Set(GROUPES_SURVEILLES);
export const DECLARATION_IMMEDIATE:ReadonlySet<string> = new Set(["rougeole", "meningite", "fievre_hemorragique"]);
export const NB_SEMAINES_HISTORIQUE = 8;
export const MINIMUM_CAS = 10;
export const MINIMUM_CAS_DECLARATION_IMMEDIATE = 1;

const SUFFIXE_ZONE_A_AFFINER = "-A-AFFINER";
const JOUR_MS = 24 * 60 * 60 * 1000;
const SEMAINE_MS = 7 * JOUR_MS;
const INTERVALLE_VERIFICATION_MS = 60 * 60 * 1000; // horaire, meme cadence que F-PIL-07

declare global {
  var __detectionAlertesEpidemiologiquesDemarree: boolean | undefined;
}

/** Semaine ISO 8601 ("AAAA-Wss") d'une date, calculee en UTC. */
export function semaineISO(date: Date): string {
  const jeudi = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  // Jeudi de la meme semaine ISO (lundi = 1 ... dimanche = 7).
  const jourIso = jeudi.getUTCDay() === 0 ? 7 : jeudi.getUTCDay();
  jeudi.setUTCDate(jeudi.getUTCDate() + 4 - jourIso);
  const anneeIso = jeudi.getUTCFullYear();
  const premierJanvier = Date.UTC(anneeIso, 0, 1);
  const numero = Math.ceil(((jeudi.getTime() - premierJanvier) / JOUR_MS + 1) / 7);
  return `${anneeIso}-W${String(numero).padStart(2, "0")}`;
}

/** Lundi 00:00 UTC de la semaine ISO contenant `date`. */
export function debutSemaineUTC(date: Date): Date {
  const debut = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const decalageDepuisLundi = (debut.getUTCDay() + 6) % 7;
  debut.setUTCDate(debut.getUTCDate() - decalageDepuisLundi);
  return debut;
}

function ecartType(valeurs: number[], moyenne: number): number {
  if (valeurs.length === 0) return 0;
  const variance = valeurs.reduce((acc, v) => acc + (v - moyenne) ** 2, 0) / valeurs.length;
  return Math.sqrt(variance);
}

/**
 * Seuil d'alerte d'un groupe pour une semaine, a partir des cas des semaines
 * precedentes (zeros compris) : 1 cas pour une maladie a declaration
 * immediate, sinon max(10, moyenne + 2 ecarts-types).
 */
export function calculerSeuil(groupeMaladies: string, historique: number[]): number {
  if (DECLARATION_IMMEDIATE.has(groupeMaladies)) return MINIMUM_CAS_DECLARATION_IMMEDIATE;
  const moyenne = historique.length > 0 ? historique.reduce((a, b) => a + b, 0) / historique.length : 0;
  return Math.max(MINIMUM_CAS, moyenne + 2 * ecartType(historique, moyenne));
}

export interface ResultatDetectionAlertes {
  /** Alertes nouvellement creees (jamais les doublons ignores). */
  alertesCreees: number;
  /** Etablissements ayant des cas surveilles mais aucune zone resoluble. */
  etablissementsSansZone: number;
}

/**
 * Resout la zone sanitaire de chaque etablissement (voir l'ordre documente
 * en tete de fichier). Les etablissements absents de la carte renvoyee n'ont
 * aucune zone resoluble.
 */
async function resoudreZones(etablissementIds: string[]): Promise<Map<string, string>> {
  const zoneParEtablissement = new Map<string, string>();
  if (etablissementIds.length === 0) return zoneParEtablissement;

  const etablissements = await prisma.etablissementSanitaire.findMany({
    where: { id: { in: etablissementIds } },
    select: { id: true, zoneSanitaireId: true, commune: { select: { departementId: true } } },
  });

  const departementsSansZone = new Set<string>();
  for (const etablissement of etablissements) {
    if (etablissement.zoneSanitaireId) {
      zoneParEtablissement.set(etablissement.id, etablissement.zoneSanitaireId);
    } else if (etablissement.commune) {
      departementsSansZone.add(etablissement.commune.departementId);
    }
  }

  if (departementsSansZone.size > 0) {
    const zonesAAffiner = await prisma.zoneSanitaire.findMany({
      where: { departementId: { in: [...departementsSansZone] }, code: { endsWith: SUFFIXE_ZONE_A_AFFINER } },
      select: { id: true, departementId: true },
    });
    const zoneAAffinerParDepartement = new Map(zonesAAffiner.map((zone) => [zone.departementId, zone.id]));
    for (const etablissement of etablissements) {
      if (etablissement.zoneSanitaireId || !etablissement.commune) continue;
      const zoneId = zoneAAffinerParDepartement.get(etablissement.commune.departementId);
      if (zoneId) zoneParEtablissement.set(etablissement.id, zoneId);
    }
  }

  return zoneParEtablissement;
}

/**
 * Evalue la semaine ecoulee et la semaine en cours pour chaque couple
 * (zone, groupe surveille) et cree les alertes pas encore signalees.
 * Les erreurs remontent a l'appelant (suivreExecution les journalise en
 * "erreur" dans ExecutionTache).
 */
export async function executerDetectionAlertes(maintenant: Date = new Date()): Promise<ResultatDetectionAlertes> {
  const debutSemaineCourante = debutSemaineUTC(maintenant);
  const debutSemaineEcoulee = new Date(debutSemaineCourante.getTime() - SEMAINE_MS);
  const semainesEvaluees = [debutSemaineEcoulee, debutSemaineCourante];
  // Historique de la semaine la plus ancienne evaluee + la semaine en cours.
  const debutFenetre = new Date(debutSemaineEcoulee.getTime() - NB_SEMAINES_HISTORIQUE * SEMAINE_MS);
  const finFenetre = new Date(debutSemaineCourante.getTime() + SEMAINE_MS);

  const lignes = await prisma.agregatQuotidien.findMany({
    where: {
      indicateur: "IND-03",
      date: { gte: debutFenetre, lt: finFenetre },
      etablissementId: { not: null },
      dimensionLibre: { in: [...GROUPES_SURVEILLES] },
    },
    select: { date: true, etablissementId: true, dimensionLibre: true, valeur: true },
  });

  const etablissementIds = [...new Set(lignes.map((l) => l.etablissementId).filter((id): id is string => id !== null))];
  const zoneParEtablissement = await resoudreZones(etablissementIds);
  const etablissementsSansZone = etablissementIds.filter((id) => !zoneParEtablissement.has(id)).length;

  // cas["zone|groupe"]["AAAA-Wss"] = total des cas de cette semaine.
  const cas = new Map<string, Map<string, number>>();
  for (const ligne of lignes) {
    const zoneId = ligne.etablissementId ? zoneParEtablissement.get(ligne.etablissementId) : undefined;
    // Defensif : jamais un groupe non surveille, meme si la requete en laissait passer un.
    if (!zoneId || !ligne.dimensionLibre || !GROUPES_SURVEILLES_ENSEMBLE.has(ligne.dimensionLibre)) continue;
    const cle = `${zoneId}|${ligne.dimensionLibre}`;
    const semaine = semaineISO(ligne.date);
    const parSemaine = cas.get(cle) ?? new Map<string, number>();
    parSemaine.set(semaine, (parSemaine.get(semaine) ?? 0) + ligne.valeur);
    cas.set(cle, parSemaine);
  }

  const candidates: { zoneSanitaireId: string; groupeMaladies: string; semaine: string; casObserves: number; seuilCalcule: number }[] = [];
  for (const [cle, parSemaine] of cas) {
    const [zoneSanitaireId, groupeMaladies] = cle.split("|");
    for (const debutSemaine of semainesEvaluees) {
      const semaine = semaineISO(debutSemaine);
      const casObserves = parSemaine.get(semaine) ?? 0;
      if (casObserves === 0) continue;

      const historique: number[] = [];
      for (let recul = 1; recul <= NB_SEMAINES_HISTORIQUE; recul++) {
        historique.push(parSemaine.get(semaineISO(new Date(debutSemaine.getTime() - recul * SEMAINE_MS))) ?? 0);
      }
      const seuilCalcule = calculerSeuil(groupeMaladies, historique);
      if (casObserves < seuilCalcule) continue;

      candidates.push({ zoneSanitaireId, groupeMaladies, semaine, casObserves, seuilCalcule });
    }
  }

  if (candidates.length === 0) return { alertesCreees: 0, etablissementsSansZone };

  // Reclamation idempotente : la contrainte unique (zone, groupe, semaine)
  // ecarte toute alerte deja signalee, sans erreur ni doublon.
  const { count } = await prisma.healthAlertReview.createMany({ data: candidates, skipDuplicates: true });
  return { alertesCreees: count, etablissementsSansZone };
}

async function executerDetectionAvecJournal(): Promise<void> {
  try {
    await suivreExecution("detection_alertes_epidemiologiques", async () => {
      const { alertesCreees, etablissementsSansZone } = await executerDetectionAlertes();
      if (alertesCreees > 0) {
        console.log(`[pilotage] alertes epidemiologiques : ${alertesCreees} nouvelle(s) alerte(s)`);
      }
      if (etablissementsSansZone > 0) {
        console.warn(
          `[pilotage] alertes epidemiologiques : ${etablissementsSansZone} etablissement(s) ignore(s), aucune zone sanitaire resoluble`
        );
      }
      return alertesCreees;
    });
  } catch (erreur) {
    console.error("[pilotage] echec de la detection planifiee des alertes epidemiologiques", erreur);
  }
}

/** Demarre la detection planifiee (toutes les heures). Idempotent (drapeau global). */
export function demarrerDetectionAlertesEpidemiologiques(): void {
  if (globalThis.__detectionAlertesEpidemiologiquesDemarree) {
    return;
  }
  globalThis.__detectionAlertesEpidemiologiquesDemarree = true;

  setInterval(() => {
    void executerDetectionAvecJournal();
  }, INTERVALLE_VERIFICATION_MS);

  console.log("[pilotage] detection planifiee des alertes epidemiologiques demarree (toutes les heures)");
}
