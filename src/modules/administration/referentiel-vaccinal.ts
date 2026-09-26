"use server";

/**
 * Referentiel vaccinal administrable (F-ADM-04 du pack, "Gerer les
 * referentiels"), perimetre reduit a un seul referentiel concret parmi les
 * sept listes par le pack (CIM-10, medicaments, examens, vaccins, motifs de
 * rendez-vous, jours feries, modeles de SMS) : tenter les sept ce soir
 * aurait ete hors de portee, voir docs/audit-cote-administration.md pour le
 * detail.
 *
 * Avant ce module, src/modules/vaccination/referentiel.ts exposait
 * VACCINS_REFERENTIEL comme un tableau statique en dur. Ce module le
 * remplace par une vraie table VaccinReferentiel geree par un
 * administrateur (admin_national ici, PLATFORM_ADMIN absent de ce depot,
 * meme adaptation que src/modules/administration/parametres.ts et
 * etablissements.ts).
 *
 * RG-ADM-20 : desactivation seule, jamais de suppression d'une entree deja
 * utilisee par une vraie Vaccination (Vaccination.vaccin reste un simple
 * String, jamais une cle etrangere vers ce referentiel : une vaccination
 * dejà enregistree reste lisible meme si son vaccin est ensuite desactive
 * ou meme si "Autre" en texte libre a ete utilise, ce que ce referentiel ne
 * couvre jamais).
 *
 * RG-ADM-21 (versionnement : chaque modification cree une nouvelle version
 * numerotee, datee, avec auteur et commentaire) : hors perimetre ici, seul
 * l'etat courant est conserve. Limite assumee, documentee dans
 * docs/audit-cote-administration.md.
 *
 * Les regles d'age/intervalle minimum du calendrier PEV
 * (REGLES_AGE_VACCINS, controlerAgeVaccination dans
 * src/modules/vaccination/referentiel.ts) restent codees en dur, cle par le
 * NOM du vaccin : seule la LISTE des noms proposes au medecin devient
 * administrable ici, pas les regles elles-memes (demande explicite de la
 * session ayant assigne ce chantier). Un nom desactive ou renomme perd donc
 * silencieusement sa regle d'age (retour a "toujours conforme"), limite
 * acceptee tant qu'aucun ecran d'administration des regles elles-memes
 * n'existe.
 */

import { headers } from "next/headers";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { journaliser } from "@/modules/audit/journaliser";
import { getSession } from "@/lib/session";
import { can } from "@/security/permissions";
import { VACCINS_REFERENTIEL } from "@/modules/vaccination/referentiel";
import type { OptionReferentiel } from "@/modules/vaccination/referentiel";

/** Adresse technique d'origine de la requete courante, pour le JournalAudit. */
async function adresseTechniqueCourante(): Promise<string> {
  try {
    const listeEntetes = await headers();
    return listeEntetes.get("x-forwarded-for") ?? listeEntetes.get("x-real-ip") ?? "inconnue";
  } catch {
    return "inconnue";
  }
}

/**
 * Seme les vaccins du tableau statique historique (VACCINS_REFERENTIEL) une
 * seule fois, sans jamais ecraser une entree deja presente (meme principe
 * que provisionnerFonctionnalitesParDefaut, src/modules/administration/parametres.ts) :
 * continuite du comportement existant a l'introduction de ce module, cette
 * liste peut ensuite grandir/etre reordonnee/desactivee sans jamais
 * reinitialiser un choix deja fait par un administrateur.
 */
async function provisionnerReferentielParDefaut(): Promise<void> {
  await Promise.all(
    VACCINS_REFERENTIEL.map((nom, index) =>
      prisma.vaccinReferentiel.upsert({
        where: { nom },
        update: {},
        create: { nom, ordre: index, actif: true },
      })
    )
  );
}

export interface VaccinReferentielResume {
  id: string;
  nom: string;
  ordre: number;
  actif: boolean;
  dateModification: string; // ISO
}

/**
 * Liste complete (actifs et desactives), pour l'ecran d'administration
 * uniquement (admin_national).
 */
export async function getReferentielVaccinsComplet(): Promise<VaccinReferentielResume[]> {
  const session = await getSession();

  if (!session || !session.roles.some((role) => can(role, "read", "referentiel_vaccinal"))) {
    return [];
  }

  await provisionnerReferentielParDefaut();

  const referentiel = await prisma.vaccinReferentiel.findMany({
    orderBy: [{ ordre: "asc" }, { nom: "asc" }],
  });

  return referentiel.map((entree) => ({
    id: entree.id,
    nom: entree.nom,
    ordre: entree.ordre,
    actif: entree.actif,
    dateModification: entree.dateModification.toISOString(),
  }));
}

/**
 * Liste des vaccins actifs uniquement, prete a peupler le selecteur du
 * formulaire d'enregistrement d'une vaccination (F-CLI-11,
 * src/app/app/medecin/vaccinations/nouvelle). Gardee derriere
 * create:vaccination (deja accorde a medecin/infirmier) plutot qu'une
 * permission dediee : cette liste n'est qu'un support d'un formulaire deja
 * autorise, pas une ressource sensible en soi.
 */
export async function getReferentielVaccinsActifs(): Promise<OptionReferentiel[]> {
  const session = await getSession();

  if (!session || !session.roles.some((role) => can(role, "create", "vaccination"))) {
    return [];
  }

  await provisionnerReferentielParDefaut();

  const referentiel = await prisma.vaccinReferentiel.findMany({
    where: { actif: true },
    orderBy: [{ ordre: "asc" }, { nom: "asc" }],
  });

  return referentiel.map((entree) => ({ value: entree.nom, label: entree.nom }));
}

/** Etat renvoye par chaque Server Action de ce module, consomme via useActionState. */
export interface ReferentielVaccinalActionState {
  error: string | null;
  success: boolean;
}

const schemaCreation = z.object({
  nom: z.string().trim().min(1, "Le nom est obligatoire.").max(100, "100 caracteres maximum."),
});

/** Ajoute une entree au referentiel vaccinal (toujours active a la creation). */
export async function creerVaccinReferentielAction(
  prevState: ReferentielVaccinalActionState,
  formData: FormData
): Promise<ReferentielVaccinalActionState> {
  const session = await getSession();

  if (!session || !session.roles.some((role) => can(role, "create", "referentiel_vaccinal"))) {
    return { error: "Action reservee a l'administration nationale.", success: false };
  }

  const validation = schemaCreation.safeParse({ nom: formData.get("nom") });

  if (!validation.success) {
    return {
      error: validation.error.issues[0]?.message ?? "Nom de vaccin invalide.",
      success: false,
    };
  }

  const { nom } = validation.data;

  try {
    const existant = await prisma.vaccinReferentiel.findUnique({ where: { nom } });

    if (existant) {
      return { error: "Ce vaccin existe deja dans le referentiel.", success: false };
    }

    const dernier = await prisma.vaccinReferentiel.aggregate({ _max: { ordre: true } });
    const adresseTechnique = await adresseTechniqueCourante();

    await prisma.$transaction(async (tx) => {
      await tx.vaccinReferentiel.create({
        data: { nom, ordre: (dernier._max.ordre ?? -1) + 1, actif: true },
      });

      await journaliser(
        {
          utilisateurId: session.userId,
          action: "creation_referentiel_vaccinal",
          donneeConcernee: `referentiel_vaccinal:${nom}`,
          adresseTechnique,
          justification: `Vaccin "${nom}" ajoute au referentiel vaccinal.`,
        },
        tx
      );
    });

    return { error: null, success: true };
  } catch (erreur) {
    console.error("Erreur lors de la creation du referentiel vaccinal :", erreur);
    return { error: "Une erreur est survenue. Veuillez reessayer.", success: false };
  }
}

const schemaBasculement = z.object({
  id: z.string().trim().min(1, "Le vaccin est obligatoire."),
});

/**
 * Active ou desactive une entree (RG-ADM-20 : jamais de suppression). Une
 * entree desactivee disparait du selecteur du formulaire de vaccination
 * (getReferentielVaccinsActifs) mais reste lisible pour toute Vaccination
 * deja enregistree sous ce nom (Vaccination.vaccin est un String libre,
 * jamais une cle etrangere vers ce referentiel).
 */
export async function basculerActifVaccinReferentielAction(
  prevState: ReferentielVaccinalActionState,
  formData: FormData
): Promise<ReferentielVaccinalActionState> {
  const session = await getSession();

  if (!session || !session.roles.some((role) => can(role, "update", "referentiel_vaccinal"))) {
    return { error: "Action reservee a l'administration nationale.", success: false };
  }

  const validation = schemaBasculement.safeParse({ id: formData.get("id") });

  if (!validation.success) {
    return { error: "Vaccin invalide.", success: false };
  }

  const { id } = validation.data;

  try {
    const entree = await prisma.vaccinReferentiel.findUnique({ where: { id } });

    if (!entree) {
      return { error: "Ce vaccin est introuvable.", success: false };
    }

    const adresseTechnique = await adresseTechniqueCourante();

    await prisma.$transaction(async (tx) => {
      await tx.vaccinReferentiel.update({
        where: { id },
        data: { actif: !entree.actif, dateModification: new Date() },
      });

      await journaliser(
        {
          utilisateurId: session.userId,
          action: "basculement_referentiel_vaccinal",
          donneeConcernee: `referentiel_vaccinal:${entree.nom}`,
          adresseTechnique,
          justification: `Vaccin "${entree.nom}" ${!entree.actif ? "active" : "desactive"} (etait ${entree.actif ? "actif" : "desactive"}).`,
        },
        tx
      );
    });

    return { error: null, success: true };
  } catch (erreur) {
    console.error("Erreur lors du basculement du referentiel vaccinal :", erreur);
    return { error: "Une erreur est survenue. Veuillez reessayer.", success: false };
  }
}

const schemaReordonnancement = z.object({
  id: z.string().trim().min(1, "Le vaccin est obligatoire."),
  direction: z.enum(["haut", "bas"], { message: "Direction invalide." }),
});

/**
 * Deplace une entree d'un cran (echange son "ordre" avec son voisin
 * immediat dans la liste triee) : suffisant pour reordonner une liste
 * courte comme celle-ci, pas de glisser-deposer.
 */
export async function reordonnerVaccinReferentielAction(
  prevState: ReferentielVaccinalActionState,
  formData: FormData
): Promise<ReferentielVaccinalActionState> {
  const session = await getSession();

  if (!session || !session.roles.some((role) => can(role, "update", "referentiel_vaccinal"))) {
    return { error: "Action reservee a l'administration nationale.", success: false };
  }

  const validation = schemaReordonnancement.safeParse({
    id: formData.get("id"),
    direction: formData.get("direction"),
  });

  if (!validation.success) {
    return {
      error: validation.error.issues[0]?.message ?? "Donnees invalides.",
      success: false,
    };
  }

  const { id, direction } = validation.data;

  try {
    const entree = await prisma.vaccinReferentiel.findUnique({ where: { id } });

    if (!entree) {
      return { error: "Ce vaccin est introuvable.", success: false };
    }

    const tousTries = await prisma.vaccinReferentiel.findMany({
      orderBy: [{ ordre: "asc" }, { nom: "asc" }],
    });
    const index = tousTries.findIndex((candidat) => candidat.id === id);
    const indexVoisin = direction === "haut" ? index - 1 : index + 1;

    if (index === -1 || indexVoisin < 0 || indexVoisin >= tousTries.length) {
      return { error: "Ce vaccin est deja a cette extremite de la liste.", success: false };
    }

    const voisin = tousTries[indexVoisin];
    const adresseTechnique = await adresseTechniqueCourante();

    await prisma.$transaction(async (tx) => {
      await tx.vaccinReferentiel.update({ where: { id: entree.id }, data: { ordre: voisin.ordre } });
      await tx.vaccinReferentiel.update({ where: { id: voisin.id }, data: { ordre: entree.ordre } });

      await journaliser(
        {
          utilisateurId: session.userId,
          action: "reordonnancement_referentiel_vaccinal",
          donneeConcernee: `referentiel_vaccinal:${entree.nom}`,
          adresseTechnique,
          justification: `Vaccin "${entree.nom}" deplace vers le ${direction} (echange avec "${voisin.nom}").`,
        },
        tx
      );
    });

    return { error: null, success: true };
  } catch (erreur) {
    console.error("Erreur lors du reordonnancement du referentiel vaccinal :", erreur);
    return { error: "Une erreur est survenue. Veuillez reessayer.", success: false };
  }
}
