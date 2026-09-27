"use server";

/**
 * Versionnement des informations declarees par le patient (F-CIT-04 du
 * pack) : allergies, antecedents, maladies chroniques, contacts d'urgence.
 * Chaque element est une ligne InformationDeclaree (prisma/schema.prisma),
 * jamais ecrasee : ajouter cree une nouvelle ligne "declare", retirer pose
 * une date et un motif sans jamais supprimer la ligne (RG-CIT-31).
 *
 * RG-CIT-30 : une information confirmee par un professionnel ne peut pas
 * etre retiree par le patient (seul "Signaler une erreur", deja construit
 * dans src/modules/patient/droits-donnees.ts, demanderRectificationAction,
 * reste disponible). Limite assumee : aucun ecran professionnel de ce depot
 * n'ecrit encore le statut "confirme" (verifie : seul ce module ecrit dans
 * InformationDeclaree, clinical/actions.ts ne fait que lire les champs plats
 * de Patient pour l'affichage cote consultation). La regle est neanmoins
 * deja appliquee et testee ici, prete pour le jour ou un tel ecran existera.
 *
 * Les champs plats de Patient (allergies, antecedents, maladiesChroniques,
 * contactsUrgence) restent synchronises a chaque ecriture : ce sont eux que
 * lisent tous les autres modules (consultation, controle de securite
 * allergie de la prescription, src/modules/prescription/referentiel-allergies.ts),
 * jamais modifies ici pour eviter tout changement de contrat avec ces
 * lecteurs. Une information saisie avant ce module (deja dans le champ plat,
 * aucune ligne InformationDeclaree correspondante) est retrouvee au premier
 * appel par un semis paresseux (meme principe que
 * src/modules/administration/referentiels-simples.ts) : jamais reecrasee,
 * seulement copiee en "declare".
 */

import { headers } from "next/headers";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { journaliser } from "@/modules/audit/journaliser";
import { getSession } from "@/lib/session";
import type { CategorieInformationDeclaree } from "./informations-declarees-catalogue";

export interface ContactUrgenceValeur {
  nom: string;
  telephone: string;
  lienParente: string;
}

export interface InformationDeclareeResume {
  id: string;
  categorie: CategorieInformationDeclaree;
  /** Texte pret a afficher (deja compose "Nom (lien) : telephone" pour contact_urgence). */
  libelle: string;
  /** Present uniquement pour contact_urgence, pour un formulaire d'edition eventuel. */
  contact: ContactUrgenceValeur | null;
  statut: "declare" | "confirme" | "retire";
  confirmeParId: string | null;
  dateConfirmation: string | null;
  dateRetrait: string | null;
  motifRetrait: string | null;
  dateCreation: string;
}

export interface InformationDeclareeActionState {
  error: string | null;
  success: boolean;
}

/** Convertit une chaine JSON de tableau (telle que stockee dans les champs plats de Patient) en tableau de chaines. */
function parseListeJSON(valeur: string): string[] {
  try {
    const donnees: unknown = JSON.parse(valeur);
    return Array.isArray(donnees) ? donnees.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function parseContactValeur(valeur: string): ContactUrgenceValeur | null {
  try {
    const donnees: unknown = JSON.parse(valeur);
    if (typeof donnees !== "object" || donnees === null) return null;
    const objet = donnees as Record<string, unknown>;
    if (typeof objet.nom !== "string" || typeof objet.telephone !== "string") return null;
    return {
      nom: objet.nom,
      telephone: objet.telephone,
      lienParente: typeof objet.lienParente === "string" ? objet.lienParente : "",
    };
  } catch {
    return null;
  }
}

function libelleDeLaValeur(categorie: CategorieInformationDeclaree, valeur: string): string {
  if (categorie !== "contact_urgence") return valeur;
  const contact = parseContactValeur(valeur);
  if (!contact) return valeur;
  return `${contact.nom}${contact.lienParente ? ` (${contact.lienParente})` : ""} : ${contact.telephone}`;
}

/** Lit un champ texte d'un FormData, jamais null (chaine vide si absent). */
function texte(formData: FormData, cle: string): string {
  const valeur = formData.get(cle);
  return typeof valeur === "string" ? valeur : "";
}

async function adresseTechniqueCourante(): Promise<string> {
  try {
    const listeEntetes = await headers();
    return listeEntetes.get("x-forwarded-for") ?? listeEntetes.get("x-real-ip") ?? "inconnue";
  } catch {
    return "inconnue";
  }
}

async function patientDeLaSessionCourante() {
  const session = await getSession();
  if (!session) return null;
  return prisma.patient.findUnique({ where: { userId: session.userId } });
}

function premierMessageErreur(erreur: z.ZodError, messageParDefaut: string): string {
  return erreur.issues[0]?.message ?? messageParDefaut;
}

/** Colonne plate de Patient correspondant a chaque categorie (jamais contact_urgence, structure differente). */
const CHAMP_PLAT_PAR_CATEGORIE: Record<Exclude<CategorieInformationDeclaree, "contact_urgence">, "allergies" | "antecedents" | "maladiesChroniques"> = {
  allergie: "allergies",
  antecedent: "antecedents",
  maladie_chronique: "maladiesChroniques",
};

/**
 * Semis paresseux : une information deja presente dans le champ plat de
 * Patient mais sans aucune ligne InformationDeclaree correspondante (saisie
 * avant ce module) est copiee une fois en "declare", jamais reecrasee.
 * Transaction : deux appels concurrents ne dupliquent jamais les lignes
 * (compte puis creation groupee, meme motif que referentiels-simples.ts).
 */
async function semerSiNecessaire(patient: {
  id: string;
  allergies: string;
  antecedents: string;
  maladiesChroniques: string;
  contactsUrgence: string;
}): Promise<void> {
  const valeursParCategorie: { categorie: CategorieInformationDeclaree; valeurs: string[] }[] = [
    { categorie: "allergie", valeurs: parseListeJSON(patient.allergies) },
    { categorie: "antecedent", valeurs: parseListeJSON(patient.antecedents) },
    { categorie: "maladie_chronique", valeurs: parseListeJSON(patient.maladiesChroniques) },
    {
      categorie: "contact_urgence",
      valeurs: parseListeJSON(patient.contactsUrgence).length > 0
        ? (() => {
            try {
              const bruts: unknown = JSON.parse(patient.contactsUrgence);
              return Array.isArray(bruts) ? bruts.map((item) => JSON.stringify(item)) : [];
            } catch {
              return [];
            }
          })()
        : [],
    },
  ];

  for (const { categorie, valeurs } of valeursParCategorie) {
    if (valeurs.length === 0) continue;

    const compte = await prisma.informationDeclaree.count({ where: { patientId: patient.id, categorie } });
    if (compte > 0) continue;

    await prisma.informationDeclaree.createMany({
      data: valeurs.map((valeur) => ({ patientId: patient.id, categorie, valeur, statut: "declare" as const })),
    });
  }
}

function versResume(ligne: {
  id: string;
  categorie: string;
  valeur: string;
  statut: string;
  confirmeParId: string | null;
  dateConfirmation: Date | null;
  dateRetrait: Date | null;
  motifRetrait: string | null;
  dateCreation: Date;
}): InformationDeclareeResume {
  const categorie = ligne.categorie as CategorieInformationDeclaree;
  return {
    id: ligne.id,
    categorie,
    libelle: libelleDeLaValeur(categorie, ligne.valeur),
    contact: categorie === "contact_urgence" ? parseContactValeur(ligne.valeur) : null,
    statut: ligne.statut as "declare" | "confirme" | "retire",
    confirmeParId: ligne.confirmeParId,
    dateConfirmation: ligne.dateConfirmation ? ligne.dateConfirmation.toISOString() : null,
    dateRetrait: ligne.dateRetrait ? ligne.dateRetrait.toISOString() : null,
    motifRetrait: ligne.motifRetrait,
    dateCreation: ligne.dateCreation.toISOString(),
  };
}

/**
 * Historique complet des informations declarees du patient connecte,
 * regroupe par categorie, les plus recentes d'abord (actives et retirees :
 * RG-CIT-31 impose qu'un element retire reste visible, jamais efface).
 */
export async function getMesInformationsDeclarees(): Promise<Record<CategorieInformationDeclaree, InformationDeclareeResume[]>> {
  const vide: Record<CategorieInformationDeclaree, InformationDeclareeResume[]> = {
    allergie: [],
    antecedent: [],
    maladie_chronique: [],
    contact_urgence: [],
  };

  const patient = await patientDeLaSessionCourante();
  if (!patient) return vide;

  await semerSiNecessaire(patient);

  const lignes = await prisma.informationDeclaree.findMany({
    where: { patientId: patient.id },
    orderBy: { dateCreation: "desc" },
  });

  const resultat = { ...vide };
  for (const ligne of lignes) {
    const resume = versResume(ligne);
    resultat[resume.categorie] = [...resultat[resume.categorie], resume];
  }
  return resultat;
}

/** Recalcule le champ plat de Patient pour une categorie a partir des lignes actives (declare ou confirme), jamais retirees. */
async function synchroniserChampPlat(
  tx: Prisma.TransactionClient,
  patientId: string,
  categorie: CategorieInformationDeclaree
): Promise<void> {
  const actives = await tx.informationDeclaree.findMany({
    where: { patientId, categorie, statut: { in: ["declare", "confirme"] } },
    orderBy: { dateCreation: "asc" },
  });
  const valeurs = actives.map((ligne) => ligne.valeur);

  if (categorie === "contact_urgence") {
    const contacts = valeurs.map(parseContactValeur).filter((contact): contact is ContactUrgenceValeur => contact !== null);
    await tx.patient.update({ where: { id: patientId }, data: { contactsUrgence: JSON.stringify(contacts) } });
    return;
  }

  await tx.patient.update({
    where: { id: patientId },
    data: { [CHAMP_PLAT_PAR_CATEGORIE[categorie]]: JSON.stringify(valeurs) },
  });
}

const LONGUEUR_MAX_VALEUR = 200;

const schemaAjoutSimple = z.object({
  categorie: z.enum(["allergie", "antecedent", "maladie_chronique"], { message: "Categorie invalide." }),
  valeur: z.string().trim().min(1, "Merci de renseigner une valeur.").max(LONGUEUR_MAX_VALEUR, `${LONGUEUR_MAX_VALEUR} caracteres maximum.`),
});

/** Ajoute une allergie, un antecedent ou une maladie chronique declaree (jamais un contact d'urgence, voir ajouterContactUrgenceAction). */
export async function ajouterInformationDeclareeAction(
  prevState: InformationDeclareeActionState,
  formData: FormData
): Promise<InformationDeclareeActionState> {
  const session = await getSession();
  if (!session) {
    return { error: "Session expiree. Veuillez vous reconnecter.", success: false };
  }

  const validation = schemaAjoutSimple.safeParse({
    categorie: texte(formData, "categorie"),
    valeur: texte(formData, "valeur"),
  });

  if (!validation.success) {
    return { error: premierMessageErreur(validation.error, "Donnees invalides."), success: false };
  }

  const { categorie, valeur } = validation.data;

  try {
    const patient = await prisma.patient.findUnique({ where: { userId: session.userId } });
    if (!patient) {
      return { error: "Aucun dossier patient associe a ce compte.", success: false };
    }

    const adresseTechnique = await adresseTechniqueCourante();

    await prisma.$transaction(async (tx) => {
      await tx.informationDeclaree.create({ data: { patientId: patient.id, categorie, valeur, statut: "declare" } });
      await synchroniserChampPlat(tx, patient.id, categorie);
      await journaliser(
        {
          utilisateurId: session.userId,
          action: "ajout_information_declaree",
          donneeConcernee: `patient:${patient.id}`,
          adresseTechnique,
          justification: `Information declaree ajoutee (${categorie}) : ${valeur}`,
        },
        tx
      );
    });

    return { error: null, success: true };
  } catch (erreur) {
    console.error("Erreur lors de l'ajout d'une information declaree :", erreur);
    return { error: "Une erreur est survenue. Veuillez reessayer.", success: false };
  }
}

const schemaAjoutContact = z
  .object({
    nom: z.string().trim().min(1, "Le nom est obligatoire.").max(100, "100 caracteres maximum."),
    telephone: z.string().trim().min(1, "Le telephone est obligatoire.").max(30, "30 caracteres maximum."),
    lienParente: z.string().trim().max(60, "60 caracteres maximum.").optional().default(""),
  });

/** Ajoute un contact d'urgence declare (plusieurs contacts possibles, contrairement a l'ancien champ unique). */
export async function ajouterContactUrgenceAction(
  prevState: InformationDeclareeActionState,
  formData: FormData
): Promise<InformationDeclareeActionState> {
  const session = await getSession();
  if (!session) {
    return { error: "Session expiree. Veuillez vous reconnecter.", success: false };
  }

  const validation = schemaAjoutContact.safeParse({
    nom: texte(formData, "nom"),
    telephone: texte(formData, "telephone"),
    lienParente: texte(formData, "lienParente"),
  });

  if (!validation.success) {
    return { error: premierMessageErreur(validation.error, "Donnees de contact invalides."), success: false };
  }

  try {
    const patient = await prisma.patient.findUnique({ where: { userId: session.userId } });
    if (!patient) {
      return { error: "Aucun dossier patient associe a ce compte.", success: false };
    }

    const valeur = JSON.stringify(validation.data);
    const adresseTechnique = await adresseTechniqueCourante();

    await prisma.$transaction(async (tx) => {
      await tx.informationDeclaree.create({
        data: { patientId: patient.id, categorie: "contact_urgence", valeur, statut: "declare" },
      });
      await synchroniserChampPlat(tx, patient.id, "contact_urgence");
      await journaliser(
        {
          utilisateurId: session.userId,
          action: "ajout_information_declaree",
          donneeConcernee: `patient:${patient.id}`,
          adresseTechnique,
          justification: `Contact d'urgence ajoute : ${validation.data.nom}`,
        },
        tx
      );
    });

    return { error: null, success: true };
  } catch (erreur) {
    console.error("Erreur lors de l'ajout d'un contact d'urgence :", erreur);
    return { error: "Une erreur est survenue. Veuillez reessayer.", success: false };
  }
}

const schemaRetrait = z.object({
  id: z.string().trim().min(1, "L'element est obligatoire."),
  motif: z.string().trim().max(200, "200 caracteres maximum.").optional().default(""),
});

/**
 * Retire une information declaree (RG-CIT-31 : jamais une suppression, un
 * marquage retire + date, toujours visible ensuite dans l'historique).
 * RG-CIT-30 / CA-1 : refuse si l'information est confirmee par un
 * professionnel, seule "Signaler une erreur" reste possible dans ce cas
 * (demanderRectificationAction, src/modules/patient/droits-donnees.ts).
 */
export async function retirerInformationDeclareeAction(
  prevState: InformationDeclareeActionState,
  formData: FormData
): Promise<InformationDeclareeActionState> {
  const session = await getSession();
  if (!session) {
    return { error: "Session expiree. Veuillez vous reconnecter.", success: false };
  }

  const validation = schemaRetrait.safeParse({
    id: texte(formData, "id"),
    motif: texte(formData, "motif"),
  });

  if (!validation.success) {
    return { error: premierMessageErreur(validation.error, "Donnees invalides."), success: false };
  }

  const { id, motif } = validation.data;

  try {
    const patient = await prisma.patient.findUnique({ where: { userId: session.userId } });
    if (!patient) {
      return { error: "Aucun dossier patient associe a ce compte.", success: false };
    }

    const ligne = await prisma.informationDeclaree.findUnique({ where: { id } });

    if (!ligne || ligne.patientId !== patient.id) {
      return { error: "Cette information est introuvable.", success: false };
    }

    if (ligne.statut === "retire") {
      return { error: "Cette information a deja ete retiree.", success: false };
    }

    if (ligne.statut === "confirme") {
      return {
        error:
          "Cette information a ete confirmee par un professionnel de sante : vous ne pouvez pas la retirer vous-meme. Utilisez \"Signaler une erreur\" pour demander une correction.",
        success: false,
      };
    }

    const adresseTechnique = await adresseTechniqueCourante();

    await prisma.$transaction(async (tx) => {
      await tx.informationDeclaree.update({
        where: { id },
        data: { statut: "retire", dateRetrait: new Date(), motifRetrait: motif.length > 0 ? motif : null },
      });
      await synchroniserChampPlat(tx, patient.id, ligne.categorie as CategorieInformationDeclaree);
      await journaliser(
        {
          utilisateurId: session.userId,
          action: "retrait_information_declaree",
          donneeConcernee: `patient:${patient.id}`,
          adresseTechnique,
          justification: `Information retiree (${ligne.categorie}) : ${ligne.valeur}${motif ? ` (motif : ${motif})` : ""}`,
        },
        tx
      );
    });

    return { error: null, success: true };
  } catch (erreur) {
    console.error("Erreur lors du retrait d'une information declaree :", erreur);
    return { error: "Une erreur est survenue. Veuillez reessayer.", success: false };
  }
}

const GROUPES_SANGUINS_CONNUS = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-", "inconnu"] as const;

const schemaPremiereUtilisation = z
  .object({
    groupeSanguin: z.enum(GROUPES_SANGUINS_CONNUS, { message: "Groupe sanguin invalide." }),
    grossesseEnCours: z.coerce.boolean().optional().default(false),
    allergies: z.string().optional().default(""),
    maladiesChroniques: z.string().optional().default(""),
    contactUrgenceNom: z.string().optional().default(""),
    contactUrgenceTelephone: z.string().optional().default(""),
    contactUrgenceLien: z.string().optional().default(""),
  })
  .refine(
    (donnees) => {
      const nomRempli = donnees.contactUrgenceNom.trim().length > 0;
      const telephoneRempli = donnees.contactUrgenceTelephone.trim().length > 0;
      return nomRempli === telephoneRempli;
    },
    {
      message:
        "Le nom et le telephone du contact d'urgence sont obligatoires ensemble (renseignez les deux, ou aucun des deux).",
      path: ["contactUrgenceNom"],
    }
  );

/** Decoupe un champ "une entree par ligne" en tableau de chaines non vides, nettoyees, sans doublon. */
function parseListeLignes(valeur: string): string[] {
  const vues = new Set<string>();
  const lignes: string[] = [];
  for (const ligneBrute of valeur.split("\n")) {
    const ligneNettoyee = ligneBrute.trim();
    if (ligneNettoyee.length === 0 || vues.has(ligneNettoyee.toLowerCase())) continue;
    vues.add(ligneNettoyee.toLowerCase());
    lignes.push(ligneNettoyee);
  }
  return lignes;
}

/**
 * Action dediee a l'assistant de premiere utilisation (F-CIT-01 du pack,
 * src/app/app/patient/bienvenue/AssistantPremiereUtilisation.tsx) : un seul
 * enregistrement final pour groupe sanguin, grossesse, allergies, maladies
 * chroniques et un contact d'urgence, chacune de ces deux dernieres cree une
 * ligne InformationDeclaree "declare" par ligne saisie (jamais un contact
 * unique fige comme avant ce module). Distincte de
 * updatePatientProfileAction (src/modules/patient/actions.ts, qui ne garde
 * desormais que le groupe sanguin et la grossesse pour l'ecran /app/patient/dossier,
 * ou chaque information est ajoutee/retiree individuellement) : l'assistant
 * a besoin d'un seul appel pour ses 4 etapes, jamais un aller-retour par
 * champ pendant l'inscription.
 */
export async function enregistrerPremiereUtilisationAction(
  prevState: InformationDeclareeActionState,
  formData: FormData
): Promise<InformationDeclareeActionState> {
  const session = await getSession();
  if (!session) {
    return { error: "Session expiree. Veuillez vous reconnecter.", success: false };
  }

  const validation = schemaPremiereUtilisation.safeParse({
    groupeSanguin: texte(formData, "groupeSanguin"),
    grossesseEnCours: formData.get("grossesseEnCours"),
    allergies: texte(formData, "allergies"),
    maladiesChroniques: texte(formData, "maladiesChroniques"),
    contactUrgenceNom: texte(formData, "contactUrgenceNom"),
    contactUrgenceTelephone: texte(formData, "contactUrgenceTelephone"),
    contactUrgenceLien: texte(formData, "contactUrgenceLien"),
  });

  if (!validation.success) {
    return { error: premierMessageErreur(validation.error, "Donnees invalides."), success: false };
  }

  const donnees = validation.data;
  const allergies = parseListeLignes(donnees.allergies);
  const maladiesChroniques = parseListeLignes(donnees.maladiesChroniques);
  const nomContact = donnees.contactUrgenceNom.trim();
  const telephoneContact = donnees.contactUrgenceTelephone.trim();

  try {
    const patient = await prisma.patient.findUnique({ where: { userId: session.userId } });
    if (!patient) {
      return { error: "Aucun dossier patient associe a ce compte.", success: false };
    }

    const adresseTechnique = await adresseTechniqueCourante();

    await prisma.$transaction(async (tx) => {
      await tx.patient.update({
        where: { id: patient.id },
        data: {
          groupeSanguin: donnees.groupeSanguin,
          // Zero Trust : la valeur soumise n'est retenue que pour sexe "F", jamais en confiance du client seul.
          grossesseEnCours: patient.sexe === "F" ? donnees.grossesseEnCours : false,
        },
      });

      if (allergies.length > 0) {
        await tx.informationDeclaree.createMany({
          data: allergies.map((valeur) => ({ patientId: patient.id, categorie: "allergie" as const, valeur, statut: "declare" as const })),
        });
        await synchroniserChampPlat(tx, patient.id, "allergie");
      }

      if (maladiesChroniques.length > 0) {
        await tx.informationDeclaree.createMany({
          data: maladiesChroniques.map((valeur) => ({
            patientId: patient.id,
            categorie: "maladie_chronique" as const,
            valeur,
            statut: "declare" as const,
          })),
        });
        await synchroniserChampPlat(tx, patient.id, "maladie_chronique");
      }

      if (nomContact.length > 0 && telephoneContact.length > 0) {
        const valeurContact = JSON.stringify({
          nom: nomContact,
          telephone: telephoneContact,
          lienParente: donnees.contactUrgenceLien.trim(),
        });
        await tx.informationDeclaree.create({
          data: { patientId: patient.id, categorie: "contact_urgence", valeur: valeurContact, statut: "declare" },
        });
        await synchroniserChampPlat(tx, patient.id, "contact_urgence");
      }

      await journaliser(
        {
          utilisateurId: session.userId,
          action: "modification",
          donneeConcernee: `patient:${patient.id}`,
          adresseTechnique,
          justification: "Assistant de premiere utilisation : dossier complete par le patient",
        },
        tx
      );
    });

    return { error: null, success: true };
  } catch (erreur) {
    console.error("Erreur lors de l'enregistrement de l'assistant de premiere utilisation :", erreur);
    return { error: "Une erreur est survenue lors de la mise a jour du dossier. Veuillez reessayer.", success: false };
  }
}
