"use server";

/**
 * Boite d'envoi SMS consultable (F-NOT-02 du pack : "/dev/sms, disponible
 * en developpement et en staging"). Adapte a la convention de routes de ce
 * depot : /app/ministere/sms, reserve a admin_national plutot qu'un role
 * "developpeur" qui n'existe pas ici (meme principe d'adaptation que les
 * autres ecrans PLATFORM_ADMIN de ce soir).
 */

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { can } from "@/security/permissions";
import { envoyerSms } from "./envoyer";
import { CATEGORIES_MODIFIABLES, CATEGORIES_VERROUILLEES, type CategorieNotification, type CategorieVerrouillee } from "../categories";

const TOUS_LES_CODES_CATEGORIE = [
  ...CATEGORIES_MODIFIABLES.map((c) => c.code),
  ...CATEGORIES_VERROUILLEES.map((c) => c.code),
] as [CategorieNotification | CategorieVerrouillee, ...(CategorieNotification | CategorieVerrouillee)[]];

/** Masque un numero de telephone, ne garde que les 4 derniers chiffres (F-NOT-02 : "destinataire masque sauf 4 derniers chiffres"). */
function masquerNumero(numero: string): string {
  if (numero.length <= 4) return numero;
  return `${"•".repeat(numero.length - 4)}${numero.slice(-4)}`;
}

export interface EnvoiSmsResume {
  id: string;
  destinataireMasque: string;
  texte: string;
  categorie: string;
  statut: string;
  dateProgrammee: string | null;
  modele: string | null;
  dateEnvoi: string;
}

/** Les 100 derniers envois (simules et differes), les plus recents en premier. Reserve a admin_national. */
export async function getEnvoisSms(): Promise<EnvoiSmsResume[] | null> {
  const session = await getSession();

  if (!session || !session.roles.some((role) => can(role, "read", "envoi_sms"))) {
    return null;
  }

  const envois = await prisma.envoiSms.findMany({
    orderBy: { dateEnvoi: "desc" },
    take: 100,
  });

  return envois.map((envoi) => ({
    id: envoi.id,
    destinataireMasque: masquerNumero(envoi.destinataire),
    texte: envoi.texte,
    categorie: envoi.categorie,
    statut: envoi.statut,
    dateProgrammee: envoi.dateProgrammee?.toISOString() ?? null,
    modele: envoi.modele,
    dateEnvoi: envoi.dateEnvoi.toISOString(),
  }));
}

export interface EnvoyerSmsTestActionState {
  error: string | null;
  success: boolean;
}

const schemaSmsTest = z.object({
  destinataire: z.string().trim().min(6, "Le numero de telephone est obligatoire."),
  texte: z.string().trim().min(1, "Le texte est obligatoire."),
  categorie: z.enum(TOUS_LES_CODES_CATEGORIE, { message: "Categorie invalide." }),
});

/** Envoie un SMS de test (F-NOT-02), pour verifier la chaine complete (formatage RG-NOT-02, differe RG-NOT-04, ecriture en base). Reserve a admin_national. */
export async function envoyerSmsTestAction(
  prevState: EnvoyerSmsTestActionState,
  formData: FormData
): Promise<EnvoyerSmsTestActionState> {
  const session = await getSession();

  if (!session || !session.roles.some((role) => can(role, "create", "envoi_sms"))) {
    return { error: "Action reservee aux administrateurs.", success: false };
  }

  const validation = schemaSmsTest.safeParse({
    destinataire: formData.get("destinataire"),
    texte: formData.get("texte"),
    categorie: formData.get("categorie"),
  });

  if (!validation.success) {
    return { error: validation.error.issues[0]?.message ?? "Donnees invalides.", success: false };
  }

  try {
    await envoyerSms({
      destinataire: validation.data.destinataire,
      texte: validation.data.texte,
      categorie: validation.data.categorie,
      modele: "test_manuel",
    });

    return { error: null, success: true };
  } catch (erreur) {
    console.error("Erreur lors de l'envoi du SMS de test :", erreur);
    return { error: "Une erreur est survenue lors de l'envoi. Veuillez reessayer.", success: false };
  }
}
