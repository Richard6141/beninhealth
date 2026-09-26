"use server";

/**
 * F-CIT-09 du pack ("Fin de tutelle a la majorite"). Le pack lui-meme
 * reduit ce chantier pour un MVP : pas de tache planifiee automatique a 18
 * ans, pas de code de reclamation envoye par SMS (F-AUTH-03, absent de ce
 * depot faute d'authentification telephone+OTP) - seulement "l'administrateur
 * termine la tutelle manuellement".
 *
 * Reutilise le meme mecanisme que retirerProcheAction
 * (src/modules/proches/actions.ts, cote citoyen) : une tutelle est un
 * Consentement (typeAcces "dossier_complet", statut "actif") reliant un
 * tuteur (acteurAutoriseId) a un Patient "sans compte", meme heuristique de
 * detection faute d'un marqueur dedie. Cote citoyen, le tuteur peut deja
 * mettre fin lui-meme a cette gestion ; ce module ajoute la meme capacite
 * cote administration nationale (ex. a la demande du tuteur ou constat d'un
 * proche devenu majeur), sans dupliquer la logique de creation.
 */

import { headers } from "next/headers";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { journaliser } from "@/modules/audit/journaliser";
import { getSession } from "@/lib/session";
import { can } from "@/security/permissions";

const AGE_MAJORITE_ANNEES = 18;

/** Adresse technique d'origine de la requete courante, pour le JournalAudit. */
async function adresseTechniqueCourante(): Promise<string> {
  try {
    const listeEntetes = await headers();
    return listeEntetes.get("x-forwarded-for") ?? listeEntetes.get("x-real-ip") ?? "inconnue";
  } catch {
    return "inconnue";
  }
}

function estMajeur(dateNaissance: Date): boolean {
  const limite = new Date();
  limite.setFullYear(limite.getFullYear() - AGE_MAJORITE_ANNEES);
  return dateNaissance <= limite;
}

export interface TutelleResume {
  consentementId: string;
  tuteurNomComplet: string;
  tuteurEmail: string;
  procheNomComplet: string;
  procheDateNaissance: string; // ISO
  procheEstMajeur: boolean;
  dateDebut: string; // ISO
}

/**
 * Liste toutes les tutelles actives de la plateforme (admin_national
 * uniquement, portee nationale par nature de ce role dans ce depot). Trie
 * les personnes deja majeures en premier (cas les plus probables a traiter).
 */
export async function getTutellesActives(): Promise<TutelleResume[]> {
  const session = await getSession();

  if (!session || !session.roles.some((role) => can(role, "read", "tutelle"))) {
    return [];
  }

  const consentements = await prisma.consentement.findMany({
    where: {
      typeAcces: "dossier_complet",
      statut: "actif",
      patient: { user: { statut: "sans_compte" } },
    },
    include: {
      patient: { include: { user: true } },
      acteurAutorise: true,
    },
    orderBy: { dateDebut: "asc" },
  });

  const resumes = consentements.map((consentement) => ({
    consentementId: consentement.id,
    tuteurNomComplet: `${consentement.acteurAutorise.prenom} ${consentement.acteurAutorise.nom}`,
    tuteurEmail: consentement.acteurAutorise.email,
    procheNomComplet: `${consentement.patient.user.prenom} ${consentement.patient.user.nom}`,
    procheDateNaissance: consentement.patient.dateNaissance.toISOString(),
    procheEstMajeur: estMajeur(consentement.patient.dateNaissance),
    dateDebut: consentement.dateDebut.toISOString(),
  }));

  return resumes.sort((a, b) => Number(b.procheEstMajeur) - Number(a.procheEstMajeur));
}

export interface TutelleActionState {
  error: string | null;
  success: boolean;
}

const schemaFinTutelle = z.object({
  consentementId: z.string().trim().min(1, "La tutelle est obligatoire."),
  justification: z.string().trim().min(10, "Justification obligatoire (au moins 10 caracteres)."),
});

/**
 * Met fin a une tutelle (Consentement -> "retire"), reserve a
 * admin_national. Meme transition d'etat que retirerProcheAction : jamais
 * de suppression, le dossier de la personne concernee reste intact et
 * consultable via tout autre acces autorise separement. Justification
 * obligatoire, journalisee en clair (action distincte de
 * retrait_personne_a_charge pour distinguer un retrait par le tuteur
 * lui-meme d'une fin decidee par l'administration).
 */
export async function terminerTutelleAction(
  prevState: TutelleActionState,
  formData: FormData
): Promise<TutelleActionState> {
  const session = await getSession();

  if (!session || !session.roles.some((role) => can(role, "update", "tutelle"))) {
    return { error: "Action reservee a l'administration nationale.", success: false };
  }

  const validation = schemaFinTutelle.safeParse({
    consentementId: formData.get("consentementId"),
    justification: formData.get("justification"),
  });

  if (!validation.success) {
    return {
      error: validation.error.issues[0]?.message ?? "Donnees invalides.",
      success: false,
    };
  }

  const { consentementId, justification } = validation.data;

  try {
    const consentement = await prisma.consentement.findUnique({
      where: { id: consentementId },
    });

    if (!consentement || consentement.statut !== "actif" || consentement.typeAcces !== "dossier_complet") {
      return { error: "Cette tutelle est introuvable.", success: false };
    }

    const adresseTechnique = await adresseTechniqueCourante();

    await prisma.$transaction([
      prisma.consentement.update({
        where: { id: consentement.id },
        data: { statut: "retire" },
      }),
      journaliser({
        utilisateurId: session.userId,
        action: "fin_tutelle_admin",
        donneeConcernee: `patient:${consentement.patientId}`,
        adresseTechnique,
        justification,
      }),
    ]);

    return { error: null, success: true };
  } catch (erreur) {
    console.error("Erreur lors de la fin de tutelle :", erreur);
    return { error: "Une erreur est survenue. Veuillez reessayer.", success: false };
  }
}
