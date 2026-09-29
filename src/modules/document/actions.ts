"use server";

/**
 * Server Actions du module document : documents medicaux ajoutes au dossier
 * d'un patient (F-CLI-13 du pack : compte rendu, resultat, imagerie,
 * courrier, certificat, autre). Roles habilites (src/security/permissions.ts,
 * create:document_medical) : medecin et infirmier, comme le demande le pack
 * (DOCTOR, NURSE), tous deux soumis au meme Consentement verifie en base. Le
 * laboratoire (LAB_*, "compte rendu" dans le pack) reste exclu : il n'accede
 * jamais au dossier par Consentement mais par l'examen qui lui est adresse,
 * et le depot d'un compte rendu rattache a un examen releve du module
 * laboratoire (resultat aujourd'hui en texte libre), pas de ce formulaire.
 *
 * Meme principe applique de bout en bout que src/modules/clinical/actions.ts
 * et src/modules/laboratoire/actions.ts : Zero Trust. Le professionnel
 * courant est toujours derive de getSession(), jamais d'un id transmis par
 * le client. Un medecin ne peut ajouter un document au dossier d'un patient
 * que si ce patient lui a accorde un Consentement actif ("dossier_complet"
 * ou "documents"), verifie ici en base avant toute ecriture, jamais suppose.
 *
 * RG-CLI-110 : le type reel d'un fichier televerse est verifie par signature
 * binaire (src/modules/document/stockage-fichiers.ts), jamais par son
 * extension ni le type MIME declare par le navigateur ; 4 Mo maximum
 * applique cote serveur (sous le plafond de 10 Mo du pack, voir
 * TAILLE_MAX_DOCUMENT_OCTETS pour la raison). Les metadonnees d'une image
 * (EXIF, dont la localisation GPS, XMP, IPTC, commentaires) sont retirees
 * par le code avant tout envoi vers le stockage (purge-metadonnees.ts), en
 * plus du flag "force_strip" de Cloudinary. RG-CLI-112 : le fichier est
 * stocke hors de public/, sous un nom aleatoire, jamais le nom original
 * (garde uniquement comme metadonnee d'affichage). RG-CLI-113 : un document
 * n'est jamais supprime, seulement retire "ajoute par erreur" par son
 * auteur, motif obligatoire.
 */

import { headers } from "next/headers";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { journaliser } from "@/modules/audit/journaliser";
import { getSession } from "@/lib/session";
import { can } from "@/security/permissions";
import { supprimerFichierPriveCloudinary, televerserFichierPriveCloudinary } from "@/lib/cloudinary";
import {
  detecterTypeReelFichier,
  LIBELLE_TAILLE_MAX_DOCUMENT,
  TAILLE_MAX_DOCUMENT_OCTETS,
} from "./stockage-fichiers";
import { purgerMetadonneesImage } from "./purge-metadonnees";
import { NIVEAUX_CONFIDENTIALITE_CONNUS, TYPES_DOCUMENT_CONNUS } from "./types-documents";
import { TYPES_ACCES_DOCUMENT, consentementPermetLeDocument } from "./acces-documents";

/** Etat renvoye par chaque Server Action de ce module, consomme via useActionState. */
export interface DocumentActionState {
  error: string | null;
  success: boolean;
}

/** Document medical, pret a afficher (jamais cheminFichier, detail d'implementation serveur). */
export interface DocumentResume {
  id: string;
  type: string;
  titre: string;
  dateDocument: string; // ISO
  niveauConfidentialite: string;
  consultationId: string | null;
  nomFichierOriginal: string;
  typeMime: string;
  tailleOctets: number;
  auteurNomComplet: string;
  dateCreation: string; // ISO
  retirePourErreur: boolean;
  motifRetrait: string | null;
  /** Vrai si le professionnel connecte est l'auteur (seul habilite a retirer ce document, RG-CLI-113). */
  estAuteur: boolean;
}

/** Longueur minimale du motif de retrait (RG-CLI-113 : motif requis, pas juste coche). */
const LONGUEUR_MIN_MOTIF_RETRAIT = 10;

const schemaAjoutDocument = z.object({
  patientId: z.string().trim().min(1, "Le patient est obligatoire."),
  consultationId: z.string().trim().optional().default(""),
  type: z.enum(TYPES_DOCUMENT_CONNUS, { message: "Le type de document est invalide." }),
  titre: z
    .string()
    .trim()
    .min(1, "Le titre est obligatoire.")
    .max(200, "200 caracteres maximum."),
  dateDocument: z.string().trim().min(1, "La date du document est obligatoire."),
  niveauConfidentialite: z.enum(NIVEAUX_CONFIDENTIALITE_CONNUS, {
    message: "Le niveau de confidentialite est invalide.",
  }),
});

const schemaRetraitDocument = z.object({
  documentId: z.string().trim().min(1, "Le document est obligatoire."),
  motif: z
    .string()
    .trim()
    .min(LONGUEUR_MIN_MOTIF_RETRAIT, `Le motif doit contenir au moins ${LONGUEUR_MIN_MOTIF_RETRAIT} caracteres.`),
});

/** Adresse technique d'origine de la requete courante, pour le JournalAudit. */
async function adresseTechniqueCourante(): Promise<string> {
  try {
    const listeEntetes = await headers();
    const adresse =
      listeEntetes.get("x-forwarded-for") ?? listeEntetes.get("x-real-ip") ?? null;
    return adresse ?? "inconnue";
  } catch {
    return "inconnue";
  }
}

/** Lit un champ texte d'un FormData, jamais null (chaine vide si absent). */
function texte(formData: FormData, cle: string): string {
  const valeur = formData.get(cle);
  return typeof valeur === "string" ? valeur : "";
}

/** Message renvoye a un role qui ne peut ni ajouter ni retirer de document. */
const MESSAGE_ROLE_NON_HABILITE = "Action reservee aux medecins, aux infirmiers et au laboratoire.";

/**
 * Nom complet de l'auteur d'un document, prefixe de "Dr." seulement s'il est
 * medecin (meme convention que les autres modules) : un document depose par
 * un infirmier ne doit jamais etre attribue a un "Dr." dans le dossier.
 */
function nomCompletProfessionnel(utilisateur: {
  nom: string;
  prenom: string;
  roles?: { nom: string }[];
}): string {
  const estMedecin = utilisateur.roles?.some((role) => role.nom === "medecin") ?? false;
  return estMedecin
    ? `Dr. ${utilisateur.prenom} ${utilisateur.nom}`
    : `${utilisateur.prenom} ${utilisateur.nom}`;
}

function premierMessageErreur(erreur: z.ZodError, messageParDefaut: string): string {
  return erreur.issues[0]?.message ?? messageParDefaut;
}

/** Recupere le profil ProfessionnelSante du titulaire de la session courante, ou null si absent. */
async function professionnelDeLaSessionCourante() {
  const session = await getSession();

  if (!session) {
    return null;
  }

  return prisma.professionnelSante.findUnique({ where: { userId: session.userId } });
}

/**
 * Ajoute un document au dossier d'un patient (F-CLI-13 du pack), a
 * l'initiative du medecin, de l'infirmier ou du laboratoire connecte (derive
 * de getSession(), jamais d'un id transmis par le client). Verification
 * obligatoire avant
 * toute ecriture : un Consentement actif (dossier_complet ou documents) doit
 * exister pour (patientId, acteurAutoriseId = professionnel connecte). Si un
 * consultationId est fourni, verifie qu'il appartient bien a ce patient et a
 * ce professionnel.
 *
 * RG-CLI-110 : le fichier transmis est d'abord verifie par signature binaire
 * (PDF/JPEG/PNG uniquement) et par sa taille reelle (4 Mo maximum), jamais
 * par son extension ni le type MIME declare par le navigateur, puis une image
 * est purgee de ses metadonnees (purge-metadonnees.ts). Le fichier est
 * televerse vers Cloudinary en prive (type "authenticated", RG-CLI-112 :
 * jamais accessible par une URL publique statique, voir src/lib/cloudinary.ts)
 * sous un identifiant aleatoire avant toute ecriture en base : si la creation
 * en base echoue ensuite, le fichier deja televerse est supprime cote
 * Cloudinary pour ne jamais laisser de fichier orphelin. `cheminFichier`
 * stocke desormais l'identifiant public Cloudinary, pas un chemin local.
 */
export async function ajouterDocumentAction(
  prevState: DocumentActionState,
  formData: FormData
): Promise<DocumentActionState> {
  const session = await getSession();

  if (!session) {
    return { error: "Session expiree. Veuillez vous reconnecter.", success: false };
  }

  // RBAC (voir src/security/permissions.ts) : ajouter un document medical est
  // reserve aux roles medecin, infirmier et laboratoire (F-CLI-13 : DOCTOR,
  // NURSE, LAB_* "compte rendu", corrige le 2026-09-29 : le laboratoire etait
  // exclu jusqu'ici alors que le pack le liste explicitement).
  if (!session.roles.some((role) => can(role, "create", "document_medical"))) {
    return { error: MESSAGE_ROLE_NON_HABILITE, success: false };
  }

  const validation = schemaAjoutDocument.safeParse({
    patientId: texte(formData, "patientId"),
    consultationId: texte(formData, "consultationId"),
    type: texte(formData, "type"),
    titre: texte(formData, "titre"),
    dateDocument: texte(formData, "dateDocument"),
    niveauConfidentialite: texte(formData, "niveauConfidentialite"),
  });

  if (!validation.success) {
    return {
      error: premierMessageErreur(validation.error, "Donnees de document invalides."),
      success: false,
    };
  }

  const { patientId, consultationId, type, titre, dateDocument, niveauConfidentialite } = validation.data;

  const dateDocumentValide = new Date(dateDocument);
  if (Number.isNaN(dateDocumentValide.getTime())) {
    return { error: "La date du document est invalide.", success: false };
  }

  const fichier = formData.get("fichier");

  if (!(fichier instanceof File) || fichier.size === 0) {
    return { error: "Veuillez selectionner un fichier.", success: false };
  }

  if (fichier.size > TAILLE_MAX_DOCUMENT_OCTETS) {
    return {
      error: `Le fichier depasse la taille maximale de ${LIBELLE_TAILLE_MAX_DOCUMENT}.`,
      success: false,
    };
  }

  // RG-CLI-110 : verification par contenu reel du fichier, jamais par
  // l'extension du nom ni le type MIME declare par le navigateur.
  const signature = await detecterTypeReelFichier(fichier);

  if (!signature) {
    return {
      error:
        "Format de fichier non pris en charge. Seuls les fichiers PDF, JPEG ou PNG sont acceptes (verifie par le contenu reel du fichier, pas son extension).",
      success: false,
    };
  }

  // RG-CLI-110 : metadonnees d'image (EXIF dont GPS, XMP, IPTC, commentaires)
  // retirees ici, avant toute requete en base et avant tout envoi vers le
  // stockage. Une image a la structure incoherente est refusee plutot que
  // stockee avec ses metadonnees. Un PDF est renvoye inchange.
  const octetsPurges = purgerMetadonneesImage(new Uint8Array(await fichier.arrayBuffer()), signature.typeMime);

  if (!octetsPurges) {
    return {
      error: "Cette image est illisible ou endommagee. Enregistrez-la de nouveau (JPEG ou PNG) puis reessayez.",
      success: false,
    };
  }

  try {
    const professionnel = await prisma.professionnelSante.findUnique({
      where: { userId: session.userId },
    });

    if (!professionnel) {
      return { error: "Aucun profil professionnel associe a ce compte.", success: false };
    }

    const patient = await prisma.patient.findUnique({ where: { id: patientId } });

    if (!patient) {
      return { error: "Ce patient est introuvable.", success: false };
    }

    const consentement = await prisma.consentement.findUnique({
      where: {
        patientId_acteurAutoriseId: {
          patientId,
          acteurAutoriseId: session.userId,
        },
      },
    });

    const consentementValide =
      consentement !== null &&
      consentement.statut === "actif" &&
      (consentement.dateFin === null || consentement.dateFin > new Date()) &&
      (TYPES_ACCES_DOCUMENT as readonly string[]).includes(consentement.typeAcces);

    if (!consentementValide) {
      return {
        error:
          "Aucun consentement actif pour ce patient. Le patient doit d'abord vous autoriser depuis son espace.",
        success: false,
      };
    }

    const consultationIdNettoye = consultationId.trim();
    let consultationIdValide: string | null = null;

    if (consultationIdNettoye.length > 0) {
      const consultation = await prisma.consultation.findUnique({
        where: { id: consultationIdNettoye },
      });

      if (
        !consultation ||
        consultation.patientId !== patientId ||
        consultation.professionnelId !== professionnel.id
      ) {
        return { error: "Cette consultation est introuvable.", success: false };
      }

      consultationIdValide = consultation.id;
    }

    const octets = Buffer.from(octetsPurges);
    const { publicId: identifiantCloudinary } = await televerserFichierPriveCloudinary(octets, {
      dossierComplement: "documents",
      identifiantPublic: randomUUID(),
    });

    const adresseTechnique = await adresseTechniqueCourante();

    try {
      const documentCree = await prisma.$transaction(async (tx) => {
        const document = await tx.documentMedical.create({
          data: {
            patientId,
            auteurId: session.userId,
            consultationId: consultationIdValide,
            type,
            titre,
            dateDocument: dateDocumentValide,
            niveauConfidentialite,
            cheminFichier: identifiantCloudinary,
            nomFichierOriginal: fichier.name || "document",
            typeMime: signature.typeMime,
            // Taille reellement stockee (apres purge des metadonnees), pas
            // celle du fichier recu.
            tailleOctets: octets.length,
          },
        });

        await journaliser(
          {
            utilisateurId: session.userId,
            action: "ajout_document_medical",
            donneeConcernee: `document_medical:${document.id}`,
            adresseTechnique,
            justification: `Document "${titre}" ajoute au dossier du patient ${patientId}`,
          },
          tx
        );

        return document;
      });

      void documentCree;
      return { error: null, success: true };
    } catch (erreurEcritureBase) {
      // Le fichier est deja televerse sur Cloudinary a ce stade : evite de
      // l'orphaniner si l'ecriture en base echoue.
      await supprimerFichierPriveCloudinary(identifiantCloudinary).catch(() => {});
      throw erreurEcritureBase;
    }
  } catch (erreur) {
    console.error("Erreur lors de l'ajout du document medical :", erreur);
    return {
      error: "Une erreur est survenue lors de l'ajout du document. Veuillez reessayer.",
      success: false,
    };
  }
}

/**
 * Retire un document "ajoute par erreur" (RG-CLI-113 du pack) : jamais une
 * suppression, le document reste visible et telechargeable, seulement
 * marque comme retire avec un motif obligatoire. Reserve a l'auteur du
 * document (Zero Trust : verifie en base, jamais suppose depuis le role
 * seul). La permission update:document_medical n'existe pas dans la matrice
 * RBAC actuelle (src/security/permissions.ts) : ce retrait est donc pour le
 * moment strictement reserve a l'auteur, sans alternative par permission.
 */
export async function retirerDocumentAction(
  prevState: DocumentActionState,
  formData: FormData
): Promise<DocumentActionState> {
  const session = await getSession();

  if (!session) {
    return { error: "Session expiree. Veuillez vous reconnecter.", success: false };
  }

  if (!session.roles.some((role) => can(role, "create", "document_medical"))) {
    return { error: MESSAGE_ROLE_NON_HABILITE, success: false };
  }

  const validation = schemaRetraitDocument.safeParse({
    documentId: texte(formData, "documentId"),
    motif: texte(formData, "motif"),
  });

  if (!validation.success) {
    return {
      error: premierMessageErreur(validation.error, "Donnees de retrait invalides."),
      success: false,
    };
  }

  const { documentId, motif } = validation.data;

  try {
    const document = await prisma.documentMedical.findUnique({ where: { id: documentId } });

    if (!document || document.auteurId !== session.userId) {
      return { error: "Ce document est introuvable.", success: false };
    }

    if (document.retirePourErreur) {
      return { error: "Ce document a deja ete retire.", success: false };
    }

    const adresseTechnique = await adresseTechniqueCourante();

    await prisma.$transaction(async (tx) => {
      await tx.documentMedical.update({
        where: { id: document.id },
        data: { retirePourErreur: true, motifRetrait: motif },
      });

      await journaliser(
        {
          utilisateurId: session.userId,
          action: "retrait_document_medical",
          donneeConcernee: `document_medical:${document.id}`,
          adresseTechnique,
          justification: `Document medical retire (ajoute par erreur), motif : ${motif}`,
        },
        tx
      );
    });

    return { error: null, success: true };
  } catch (erreur) {
    console.error("Erreur lors du retrait du document medical :", erreur);
    return {
      error: "Une erreur est survenue lors du retrait du document. Veuillez reessayer.",
      success: false,
    };
  }
}

/**
 * Recupere les documents medicaux d'un patient (F-CLI-13 du pack), du plus
 * recent au plus ancien, reserve au medecin connecte s'il detient un
 * Consentement actif (dossier_complet ou documents) pour ce patient (Zero
 * Trust, meme principe que getResumePatient/getHistoriquePatient dans
 * src/modules/clinical/actions.ts) : retourne null plutot que de filtrer
 * partiellement. Journalise la consultation de la liste (traçabilite, voir
 * src/security/permissions.ts). Ne renvoie jamais cheminFichier (detail
 * d'implementation serveur) : le telechargement passe exclusivement par
 * /api/documents/[id], qui reapplique sa propre verification Zero Trust.
 */
export async function getDocumentsDuPatient(patientId: string): Promise<DocumentResume[] | null> {
  const session = await getSession();

  if (!session) {
    return null;
  }

  const professionnel = await professionnelDeLaSessionCourante();

  if (!professionnel) {
    return null;
  }

  const consentement = await prisma.consentement.findUnique({
    where: {
      patientId_acteurAutoriseId: {
        patientId,
        acteurAutoriseId: session.userId,
      },
    },
  });

  const consentementValide =
    consentement !== null &&
    consentement.statut === "actif" &&
    (consentement.dateFin === null || consentement.dateFin > new Date()) &&
    (TYPES_ACCES_DOCUMENT as readonly string[]).includes(consentement.typeAcces);

  if (!consentementValide) {
    return null;
  }

  const tousLesDocuments = await prisma.documentMedical.findMany({
    where: { patientId },
    include: { auteur: { include: { roles: true } } },
    orderBy: { dateCreation: "desc" },
  });

  // Un document "sensible" n'est liste que pour son auteur ou un consentement
  // dossier_complet (acces-documents.ts), jamais pour un consentement limite aux documents.
  const documents = tousLesDocuments.filter(
    (document) =>
      document.auteurId === session.userId ||
      consentementPermetLeDocument(consentement, document.niveauConfidentialite)
  );

  const adresseTechnique = await adresseTechniqueCourante();

  await journaliser({
    utilisateurId: session.userId,
    action: "consultation_liste_documents_medicaux",
    donneeConcernee: `patient:${patientId}`,
    adresseTechnique,
    justification: `Liste des documents medicaux consultee (consentement ${consentement.typeAcces})`,
  });

  return documents.map((document) => ({
    id: document.id,
    type: document.type,
    titre: document.titre,
    dateDocument: document.dateDocument.toISOString(),
    niveauConfidentialite: document.niveauConfidentialite,
    consultationId: document.consultationId,
    nomFichierOriginal: document.nomFichierOriginal,
    typeMime: document.typeMime,
    tailleOctets: document.tailleOctets,
    auteurNomComplet: nomCompletProfessionnel(document.auteur),
    dateCreation: document.dateCreation.toISOString(),
    retirePourErreur: document.retirePourErreur,
    motifRetrait: document.motifRetrait,
    estAuteur: document.auteurId === session.userId,
  }));
}

/**
 * Documents medicaux du patient connecte lui-meme (F-CLI-13 du pack, volet
 * "telechargement direct par le patient de ses propres documents", signale
 * comme un trou dans docs/audit-cote-medecin.md). Contrairement a
 * getDocumentsDuPatient (consultation par un professionnel tiers, qui exige
 * un Consentement actif et journalise l'acces), un patient consultant SES
 * PROPRES documents n'a besoin d'aucune verification de consentement : c'est
 * son propre dossier (meme principe que getMesExamens/getMesVaccinations/
 * getMesPrescriptions dans les autres modules, aucune entree JournalAudit
 * pour la simple liste ; seul le telechargement effectif d'un fichier reste
 * journalise, par /api/documents/[id]).
 */
export async function getMesDocuments(): Promise<DocumentResume[]> {
  const session = await getSession();

  if (!session) {
    return [];
  }

  const patient = await prisma.patient.findUnique({ where: { userId: session.userId } });

  if (!patient) {
    return [];
  }

  const documents = await prisma.documentMedical.findMany({
    where: { patientId: patient.id },
    include: { auteur: { include: { roles: true } } },
    orderBy: { dateCreation: "desc" },
  });

  return documents.map((document) => ({
    id: document.id,
    type: document.type,
    titre: document.titre,
    dateDocument: document.dateDocument.toISOString(),
    niveauConfidentialite: document.niveauConfidentialite,
    consultationId: document.consultationId,
    nomFichierOriginal: document.nomFichierOriginal,
    typeMime: document.typeMime,
    tailleOctets: document.tailleOctets,
    auteurNomComplet: nomCompletProfessionnel(document.auteur),
    dateCreation: document.dateCreation.toISOString(),
    retirePourErreur: document.retirePourErreur,
    motifRetrait: document.motifRetrait,
    // Un patient n'est jamais l'auteur d'un DocumentMedical (cree exclusivement
    // par un medecin ou un infirmier, voir ajouterDocumentAction) : jamais
    // habilite au retrait.
    estAuteur: false,
  }));
}
