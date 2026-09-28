"use server";

/**
 * Import CSV du referentiel des etablissements (F-ADM-02 du pack, P1
 * explicite, seul manque reel sur une fiche par ailleurs FAIT). Reserve a
 * admin_national, meme role direct que la creation unitaire d'un
 * etablissement (identity/gestion-comptes.ts) : aucune permission
 * "create:referentiel_etablissement" n'existe dans la matrice RBAC
 * aujourd'hui (seuls read/update y figurent), et l'ajouter pour ce seul
 * besoin toucherait security/permissions.ts, fichier deja partage ce soir
 * pour d'autres chantiers - le meme motif deja documente ailleurs pour
 * eviter de toucher un fichier tres partage pour un gain marginal.
 *
 * Flux en deux etapes, jamais un import direct sur upload (F-ADM-02 exige un
 * rapport d'erreurs par ligne AVANT tout import definitif) :
 * 1. previsualiserImportEtablissementsAction : lit le fichier, valide chaque
 *    ligne (import-etablissements-regles.ts), n'ecrit rien. Renvoie le
 *    contenu du fichier tel quel (pour le formulaire de confirmation) et le
 *    rapport (lignes valides en apercu, lignes invalides avec leur erreur).
 * 2. confirmerImportEtablissementsAction : revalide INTEGRALEMENT le meme
 *    contenu cote serveur (Zero Trust, jamais confiance dans un drapeau
 *    "ces lignes sont valides" transmis par le client) puis ecrit les lignes
 *    valides dans une seule transaction atomique.
 *
 * Decision de transaction (documentee dans docs/coordination-agents.md avant
 * de coder, laissee au choix de cet agent par le pack) : import PARTIEL avec
 * rapport clair, pas tout-ou-rien sur le fichier entier. Les lignes
 * invalides sont exclues et toujours listees, jamais silencieusement
 * ignorees ; seules les lignes valides sont ecrites, dans UNE transaction
 * (tout-ou-rien pour ce seul sous-ensemble : si l'ecriture echoue en base
 * pour une raison imprevue, aucune ligne valide n'est partiellement creee).
 *
 * Les etablissements importes sont crees au statut "brouillon", jamais
 * "actif" d'emblee : contrairement a la creation unitaire, l'import ne
 * provisionne aucun compte administrateur (voir la docstring du module pur).
 */

import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { journaliser } from "@/modules/audit/journaliser";
import { getSession } from "@/lib/session";
import { CODE_IDENTIFIANT_ETABLISSEMENT, prefixeIdentifiant, prochainIdentifiant } from "@/modules/identity/identifiants";
import { GEOMETRIES_DEPARTEMENTS } from "@/modules/pilotage/geometrie-departements";
import {
  analyserFichierCsv,
  validerLignesImport,
  type CommuneReferentiel,
  type LigneImportInvalide,
} from "./import-etablissements-regles";

const TAILLE_MAX_FICHIER_OCTETS = 2 * 1024 * 1024; // 2 Mo, tres largement suffisant pour ce referentiel.

async function estAdminNationalConnecte(): Promise<string | null> {
  const session = await getSession();
  if (!session || !session.roles.includes("admin_national")) {
    return null;
  }
  return session.userId;
}

async function adresseTechniqueCourante(): Promise<string> {
  try {
    const listeEntetes = await headers();
    return listeEntetes.get("x-forwarded-for") ?? listeEntetes.get("x-real-ip") ?? "inconnue";
  } catch {
    return "inconnue";
  }
}

async function communesDuReferentiel(): Promise<CommuneReferentiel[]> {
  const communes = await prisma.commune.findMany({ include: { departement: true } });
  return communes.map((commune) => ({ id: commune.id, nom: commune.nom, departementNom: commune.departement.nom }));
}

/** Ligne valide, projetee pour l'affichage seul (jamais les identifiants internes comme communeId). */
export interface LigneApercuImport {
  numeroLigne: number;
  nom: string;
  type: string;
  capacite: number;
  communeNom: string;
  departementNom: string;
}

export interface RapportImportEtablissements {
  error: string | null;
  /** Contenu du fichier, echo tel quel pour le formulaire de confirmation (jamais republie ailleurs). */
  contenuCsv: string | null;
  valides: LigneApercuImport[];
  invalides: LigneImportInvalide[];
}

const ETAT_INITIAL_VIDE: RapportImportEtablissements = { error: null, contenuCsv: null, valides: [], invalides: [] };

async function lireEtValiderFichier(
  formData: FormData
): Promise<{ error: string } | { contenuCsv: string; communes: CommuneReferentiel[]; rapport: ReturnType<typeof validerLignesImport> }> {
  const fichier = formData.get("fichier");

  if (!(fichier instanceof File) || fichier.size === 0) {
    return { error: "Veuillez selectionner un fichier CSV." };
  }

  if (fichier.size > TAILLE_MAX_FICHIER_OCTETS) {
    return { error: "Le fichier depasse la taille maximale de 2 Mo." };
  }

  const contenuCsv = await fichier.text();
  const { lignes, erreurEntete } = analyserFichierCsv(contenuCsv);

  if (erreurEntete) {
    return { error: erreurEntete };
  }

  if (lignes.length === 0) {
    return { error: "Le fichier ne contient aucune ligne de donnees." };
  }

  const communes = await communesDuReferentiel();
  const rapport = validerLignesImport(lignes, communes, GEOMETRIES_DEPARTEMENTS);

  return { contenuCsv, communes, rapport };
}

/**
 * Etape 1 : lit et valide le fichier CSV soumis, sans rien ecrire. Le
 * contenu est renvoye tel quel pour etre resoumis par le formulaire de
 * confirmation (evite de redemander le fichier a l'utilisateur), jamais
 * stocke ni journalise a ce stade (aucune ecriture n'a encore eu lieu).
 */
export async function previsualiserImportEtablissementsAction(
  prevState: RapportImportEtablissements,
  formData: FormData
): Promise<RapportImportEtablissements> {
  if (!(await estAdminNationalConnecte())) {
    return { ...ETAT_INITIAL_VIDE, error: "Action reservee au ministere." };
  }

  const resultat = await lireEtValiderFichier(formData);

  if ("error" in resultat) {
    return { ...ETAT_INITIAL_VIDE, error: resultat.error };
  }

  const { contenuCsv, rapport } = resultat;

  return {
    error: null,
    contenuCsv,
    valides: rapport.valides.map((ligne) => {
      const commune = resultat.communes.find((candidate) => candidate.id === ligne.communeId);
      return {
        numeroLigne: ligne.numeroLigne,
        nom: ligne.nom,
        type: ligne.type,
        capacite: ligne.capacite,
        communeNom: commune?.nom ?? "",
        departementNom: commune?.departementNom ?? "",
      };
    }),
    invalides: rapport.invalides,
  };
}

export interface ConfirmationImportEtablissements {
  error: string | null;
  success: boolean;
  nombreImporte: number;
  invalides: LigneImportInvalide[];
}

/**
 * Etape 2 : revalide integralement le contenu CSV transmis (jamais confiance
 * dans le rapport de previsualisation, qui n'a pu etre falsifie ou perime
 * entre-temps que si cette revalidation n'existait pas) puis cree les
 * lignes valides en une seule transaction (voir docstring de module pour la
 * decision "import partiel avec rapport clair").
 */
export async function confirmerImportEtablissementsAction(
  prevState: ConfirmationImportEtablissements,
  formData: FormData
): Promise<ConfirmationImportEtablissements> {
  const userId = await estAdminNationalConnecte();

  if (!userId) {
    return { error: "Action reservee au ministere.", success: false, nombreImporte: 0, invalides: [] };
  }

  const contenuCsv = formData.get("contenuCsv");

  if (typeof contenuCsv !== "string" || contenuCsv.length === 0) {
    return { error: "Aucun fichier a importer. Recommencez depuis l'apercu.", success: false, nombreImporte: 0, invalides: [] };
  }

  const { lignes, erreurEntete } = analyserFichierCsv(contenuCsv);

  if (erreurEntete) {
    return { error: erreurEntete, success: false, nombreImporte: 0, invalides: [] };
  }

  try {
    const communes = await communesDuReferentiel();
    const rapport = validerLignesImport(lignes, communes, GEOMETRIES_DEPARTEMENTS);

    if (rapport.valides.length === 0) {
      return {
        error: "Aucune ligne valide a importer.",
        success: false,
        nombreImporte: 0,
        invalides: rapport.invalides,
      };
    }

    const adresseTechnique = await adresseTechniqueCourante();

    await prisma.$transaction(async (tx) => {
      let nombreEtablissements = await tx.etablissementSanitaire.count({
        where: { identifiant: { startsWith: prefixeIdentifiant(CODE_IDENTIFIANT_ETABLISSEMENT) } },
      });

      for (const ligne of rapport.valides) {
        const identifiant = prochainIdentifiant(CODE_IDENTIFIANT_ETABLISSEMENT, nombreEtablissements);
        nombreEtablissements += 1;

        const etablissement = await tx.etablissementSanitaire.create({
          data: {
            identifiant,
            nom: ligne.nom,
            type: ligne.type,
            localisation: ligne.localisation,
            latitude: ligne.latitude,
            longitude: ligne.longitude,
            capacite: ligne.capacite,
            servicesDisponibles: JSON.stringify(ligne.services),
            communeId: ligne.communeId,
            sigle: ligne.sigle,
            niveauPyramide: ligne.niveauPyramide,
            secteur: ligne.secteur,
            arrondissement: ligne.arrondissement,
            quartierVillage: ligne.quartierVillage,
            adresse: ligne.adresse,
            telephoneEtablissement: ligne.telephoneEtablissement,
            emailEtablissement: ligne.emailEtablissement,
            identifiantExterneDhis2: ligne.identifiantExterneDhis2,
            // Statut "brouillon" : voir docstring de module, aucun admin
            // n'est provisionne par l'import, contrairement a la creation
            // unitaire qui active l'etablissement dans la meme transaction.
            statut: "brouillon",
          },
        });

        await journaliser(
          {
            utilisateurId: userId,
            action: "import_csv_etablissement",
            donneeConcernee: `etablissement:${etablissement.id}`,
            adresseTechnique,
            justification: `Etablissement "${ligne.nom}" cree par import CSV (ligne ${ligne.numeroLigne} du fichier).`,
          },
          tx
        );
      }

      await journaliser(
        {
          utilisateurId: userId,
          action: "import_csv_etablissements_resume",
          donneeConcernee: "referentiel_etablissement:import",
          adresseTechnique,
          justification: `Import CSV : ${rapport.valides.length} etablissement(s) cree(s), ${rapport.invalides.length} ligne(s) refusee(s).`,
        },
        tx
      );
    });

    return {
      error: null,
      success: true,
      nombreImporte: rapport.valides.length,
      invalides: rapport.invalides,
    };
  } catch (erreur) {
    console.error("Erreur lors de l'import CSV des etablissements :", erreur);
    return {
      error: "Une erreur est survenue pendant l'import. Aucun etablissement n'a ete cree.",
      success: false,
      nombreImporte: 0,
      invalides: [],
    };
  }
}
