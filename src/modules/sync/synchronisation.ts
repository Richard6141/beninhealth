/**
 * Service de synchronisation des saisies communautaires hors ligne
 * (F-COM-08). Ce module n'est PAS un fichier "use server" (ce n'est pas une
 * Server Action, mais un service appele par les routes API
 * src/app/api/v1/sync/*) : il porte la logique metier, les routes restent
 * minces (meme separation service/route que le reste du depot).
 *
 * Perimetre assume ce soir (voir docs/reste-a-faire.md, F-COM-08) : seule la
 * creation hors ligne d'une PersonneCommunautaire (F-COM-02) est prise en
 * charge par ce pipeline de bout en bout. Les visites et vaccinations
 * (F-COM-03/04) restent hors ligne UNIQUEMENT via le flux deja existant en
 * ligne (communautaire/actions.ts, vaccination/actions.ts), non modifie ici.
 */

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { journaliser } from "@/modules/audit/journaliser";
import { estUuidV7Valide } from "@/modules/offline/uuid-v7";
import { calculerScoreDoublon, SEUIL_REVUE } from "./doublon-score";

/** RG-OFF-02/F-COM-08 : lots de 50 saisies maximum. */
export const TAILLE_MAX_LOT = 50;

/** RG-COM-21 : ecart maximal tolere entre l'horodatage local et l'horloge serveur, avant refus (horloge d'appareil dereglee). */
const ECART_FUTUR_MAX_MS = 72 * 60 * 60 * 1000;

/** RG-COM-01 : une aire ne depasse jamais 5000 personnes (instantane, mais aussi limite de comparaison pour le controle de doublon). */
export const LIMITE_PERSONNES_AIRE = 5000;

/**
 * Types de saisie hors ligne synchronisables. Un seul type est traite ce
 * soir (voir le commentaire d'en-tete) ; les autres valeurs existent pour
 * documenter l'extension prevue, mais font echouer la saisie avec REJECTED
 * si elles sont recues (aucune branche de traitement pour elles).
 */
export type TypeSaisieHorsLigne = "personne_communautaire";

export interface SaisieHorsLigne {
  /** Identifiant genere sur l'appareil (UUID v7, RG-OFF-02), cle d'idempotence. */
  uuidAppareil: string;
  type: TypeSaisieHorsLigne;
  /** Horodatage local de la creation de la saisie (ISO 8601), RG-COM-21. */
  horodatageLocal: string;
  payload: Record<string, unknown>;
}

export type StatutSynchronisation = "ACCEPTED" | "DUPLICATE" | "REVIEW" | "REJECTED";

export interface ResultatSaisie {
  uuidAppareil: string;
  statut: StatutSynchronisation;
  message: string;
  personneId?: string;
}

export interface ContexteAgentSynchronisation {
  utilisateurId: string;
  agentId: string;
  etablissementId: string;
}

const schemaPayloadPersonne = z.object({
  nom: z.string().trim().min(1),
  prenom: z.string().trim().min(1),
  sexe: z.enum(["M", "F"]),
  dateNaissance: z.string().trim().min(1),
  dateNaissanceApproximative: z.boolean().optional().default(false),
  villageQuartier: z.string().trim().min(1),
  chefMenage: z.string().trim().optional().nullable(),
});

/** Erreur levee quand le lot recu depasse la taille maximale autorisee (RG-OFF-02) : le lot entier est refuse, rien n'est traite. */
export class LotTropVolumineuxError extends Error {
  constructor() {
    super(`Un lot de synchronisation ne peut pas depasser ${TAILLE_MAX_LOT} saisies.`);
    this.name = "LotTropVolumineuxError";
  }
}

async function traiterSaisiePersonneCommunautaire(
  contexte: ContexteAgentSynchronisation,
  saisie: SaisieHorsLigne
): Promise<ResultatSaisie> {
  const validation = schemaPayloadPersonne.safeParse(saisie.payload);
  if (!validation.success) {
    return {
      uuidAppareil: saisie.uuidAppareil,
      statut: "REJECTED",
      message: "Donnees de personne invalides : " + (validation.error.issues[0]?.message ?? "champ manquant."),
    };
  }

  const donnees = validation.data;
  const dateNaissance = new Date(donnees.dateNaissance);
  if (Number.isNaN(dateNaissance.getTime()) || dateNaissance > new Date()) {
    return { uuidAppareil: saisie.uuidAppareil, statut: "REJECTED", message: "Date de naissance invalide." };
  }

  // Controle de doublon rejoue sur toute la base (F-COM-02) : contrairement a
  // la recherche hors ligne (limitee a l'instantane local), on compare ici a
  // toutes les personnes de l'etablissement, jusqu'a la limite de l'aire
  // (RG-COM-01) pour rester borne.
  const personnesExistantes = await prisma.personneCommunautaire.findMany({
    where: { etablissementId: contexte.etablissementId },
    select: { nom: true, prenom: true, dateNaissance: true, sexe: true },
    take: LIMITE_PERSONNES_AIRE,
  });

  const candidat = { nom: donnees.nom, prenom: donnees.prenom, sexe: donnees.sexe, dateNaissance };

  let meilleurScore = 0;
  for (const existante of personnesExistantes) {
    const score = calculerScoreDoublon(candidat, existante);
    if (score > meilleurScore) meilleurScore = score;
  }
  const probableDoublon = meilleurScore >= SEUIL_REVUE;

  try {
    const cree = await prisma.personneCommunautaire.create({
      data: {
        etablissementId: contexte.etablissementId,
        agentId: contexte.agentId,
        nom: donnees.nom,
        prenom: donnees.prenom,
        sexe: donnees.sexe,
        dateNaissance,
        dateNaissanceApproximative: donnees.dateNaissanceApproximative,
        villageQuartier: donnees.villageQuartier,
        chefMenage: donnees.chefMenage && donnees.chefMenage.length > 0 ? donnees.chefMenage : null,
        uuidAppareil: saisie.uuidAppareil,
        statutRevue: probableDoublon ? "REVIEW" : null,
        horodatageLocalSync: new Date(saisie.horodatageLocal),
        dateReceptionSync: new Date(),
      },
    });

    return probableDoublon
      ? {
          uuidAppareil: saisie.uuidAppareil,
          statut: "REVIEW",
          message: "A verifier : cette personne existe peut-etre deja.",
          personneId: cree.id,
        }
      : {
          uuidAppareil: saisie.uuidAppareil,
          statut: "ACCEPTED",
          message: "Personne enregistree.",
          personneId: cree.id,
        };
  } catch (erreur) {
    // Contrainte unique sur uuidAppareil (course entre deux envois du meme
    // lot, RG-OFF-02) : traiter comme une saisie deja recue plutot que comme
    // une erreur technique.
    const estViolationUnicite =
      typeof erreur === "object" && erreur !== null && "code" in erreur && (erreur as { code?: string }).code === "P2002";
    if (estViolationUnicite) {
      return { uuidAppareil: saisie.uuidAppareil, statut: "DUPLICATE", message: "Deja recue, aucune action necessaire." };
    }
    throw erreur;
  }
}

/**
 * Traite un lot de saisies hors ligne (F-COM-08). Chaque saisie est traitee
 * indépendamment (une saisie invalide n'empeche pas les autres d'etre
 * acceptees) ; le resultat de chacune est renvoye dans l'ordre de reception.
 */
export async function traiterLotSynchronisation(
  contexte: ContexteAgentSynchronisation,
  saisies: SaisieHorsLigne[],
  adresseTechnique: string
): Promise<ResultatSaisie[]> {
  if (saisies.length > TAILLE_MAX_LOT) {
    throw new LotTropVolumineuxError();
  }

  const maintenant = Date.now();
  const resultats: ResultatSaisie[] = [];

  for (const saisie of saisies) {
    if (!estUuidV7Valide(saisie.uuidAppareil)) {
      resultats.push({
        uuidAppareil: saisie.uuidAppareil,
        statut: "REJECTED",
        message: "Identifiant d'appareil invalide (UUID v7 attendu).",
      });
      continue;
    }

    const horodatageLocal = new Date(saisie.horodatageLocal);
    if (Number.isNaN(horodatageLocal.getTime())) {
      resultats.push({ uuidAppareil: saisie.uuidAppareil, statut: "REJECTED", message: "Horodatage local invalide." });
      continue;
    }

    // RG-COM-21 : ecart de plus de 72h dans le futur par rapport au serveur => horloge d'appareil dereglee, refus.
    if (horodatageLocal.getTime() - maintenant > ECART_FUTUR_MAX_MS) {
      resultats.push({
        uuidAppareil: saisie.uuidAppareil,
        statut: "REJECTED",
        message: "Horloge de l'appareil visiblement dereglee (horodatage trop avance). Corrigez la date de l'appareil puis reessayez.",
      });
      continue;
    }

    // RG-OFF-02 : idempotence, une saisie deja recue (meme UUID d'appareil) n'est jamais recreee.
    const dejaRecue = await prisma.personneCommunautaire.findUnique({
      where: { uuidAppareil: saisie.uuidAppareil },
      select: { id: true },
    });
    if (dejaRecue) {
      resultats.push({
        uuidAppareil: saisie.uuidAppareil,
        statut: "DUPLICATE",
        message: "Deja recue, aucune action necessaire.",
        personneId: dejaRecue.id,
      });
      continue;
    }

    if (saisie.type !== "personne_communautaire") {
      resultats.push({
        uuidAppareil: saisie.uuidAppareil,
        statut: "REJECTED",
        message: "Type de saisie non pris en charge par la synchronisation hors ligne.",
      });
      continue;
    }

    resultats.push(await traiterSaisiePersonneCommunautaire(contexte, saisie));
  }

  // RG-COM-22 : chaque lot journalise dans l'audit avec le nombre de saisies par statut.
  const compteParStatut = resultats.reduce<Record<string, number>>((compte, resultat) => {
    compte[resultat.statut] = (compte[resultat.statut] ?? 0) + 1;
    return compte;
  }, {});

  await journaliser({
    utilisateurId: contexte.utilisateurId,
    action: "synchronisation_lot",
    donneeConcernee: `lot_synchronisation:${saisies.length}_saisies`,
    adresseTechnique,
    justification: `SYNC_BATCH : ${JSON.stringify(compteParStatut)}`,
  });

  return resultats;
}
