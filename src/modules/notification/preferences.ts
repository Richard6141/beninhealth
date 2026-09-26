"use server";

/**
 * Server Actions du module notification : preferences par categorie
 * (F-NOT-03 du pack). Nouveau fichier, aucune modification de
 * src/modules/notification/actions.ts : creerNotification n'a pas besoin
 * de lire ces preferences puisque, dans ce depot, seul le canal interne est
 * reellement actif (voir src/modules/notification/categories.ts pour le
 * detail de cette limite assumee).
 */

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { CATEGORIES_MODIFIABLES, type CategorieNotification } from "./categories";

const CODES_CATEGORIES_MODIFIABLES = CATEGORIES_MODIFIABLES.map((c) => c.code);

export interface PreferenceCategorieResume {
  categorie: CategorieNotification;
  sms: boolean;
  email: boolean;
}

export interface PreferenceNotificationActionState {
  error: string | null;
  success: boolean;
}

/**
 * Preferences de notification de l'utilisateur connecte, une entree par
 * categorie modifiable (RG-NOT-10 : "securite" et "codes" sont exclues,
 * elles n'ont pas de preference, voir categories.ts). Une categorie sans
 * ligne en base est renvoyee avec sms/email a false (valeur par defaut).
 */
export async function getMesPreferencesNotification(): Promise<PreferenceCategorieResume[] | null> {
  const session = await getSession();

  if (!session) {
    return null;
  }

  const preferencesExistantes = await prisma.preferenceNotification.findMany({
    where: { utilisateurId: session.userId },
  });

  const parCategorie = new Map(preferencesExistantes.map((p) => [p.categorie, p]));

  return CATEGORIES_MODIFIABLES.map((definition) => {
    const existante = parCategorie.get(definition.code);
    return {
      categorie: definition.code,
      sms: existante?.sms ?? false,
      email: existante?.email ?? false,
    };
  });
}

const schemaPreference = z.object({
  categorie: z.enum(CODES_CATEGORIES_MODIFIABLES as [CategorieNotification, ...CategorieNotification[]], {
    message: "Categorie invalide.",
  }),
  sms: z.string().trim().optional().default(""),
  email: z.string().trim().optional().default(""),
});

/**
 * Met a jour les canaux SMS/email d'une categorie de notification pour
 * l'utilisateur connecte. RG-NOT-10 : la validation zod ci-dessus refuse
 * deja toute categorie hors de CATEGORIES_MODIFIABLES (securite/codes n'en
 * font pas partie), donc aucune tentative de desactivation de ces deux
 * categories ne peut jamais atteindre l'ecriture en base, meme si le
 * formulaire etait manipule cote client.
 */
export async function mettreAJourPreferenceAction(
  prevState: PreferenceNotificationActionState,
  formData: FormData
): Promise<PreferenceNotificationActionState> {
  const session = await getSession();

  if (!session) {
    return { error: "Session expiree. Veuillez vous reconnecter.", success: false };
  }

  const validation = schemaPreference.safeParse({
    categorie: formData.get("categorie"),
    sms: formData.get("sms"),
    email: formData.get("email"),
  });

  if (!validation.success) {
    return { error: validation.error.issues[0]?.message ?? "Donnees invalides.", success: false };
  }

  const { categorie, sms, email } = validation.data;

  try {
    await prisma.preferenceNotification.upsert({
      where: { utilisateurId_categorie: { utilisateurId: session.userId, categorie } },
      create: { utilisateurId: session.userId, categorie, sms: sms.length > 0, email: email.length > 0 },
      update: { sms: sms.length > 0, email: email.length > 0 },
    });

    return { error: null, success: true };
  } catch (erreur) {
    console.error("Erreur lors de la mise a jour des preferences de notification :", erreur);
    return {
      error: "Une erreur est survenue lors de l'enregistrement. Veuillez reessayer.",
      success: false,
    };
  }
}
