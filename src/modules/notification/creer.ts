/**
 * Ecriture d'une notification interne. Volontairement HORS d'un fichier
 * "use server" : chaque fonction exportee d'un fichier "use server" est un
 * point d'entree atteignable par POST, or celle-ci n'a aucun controle de
 * session (c'est a l'appelant, deja dans un contexte Zero Trust verifie, de
 * fournir le bon destinataire). Ne jamais la deplacer dans actions.ts.
 */

import { prisma } from "@/lib/prisma";
import { getTexteSmsDuCatalogue } from "./catalogue";
import { envoyerSms } from "./sms/envoyer";
import { categorieDuType } from "./types-notification";

export interface OptionsNotification {
  /** Code N-* du catalogue (F-NOT-04) : le SMS prend alors son texte dans ModeleNotification. */
  codeCatalogue?: string;
  /** Valeurs des {variables} du modele de texte. */
  variables?: Record<string, string>;
}

/**
 * Cree une notification interne pour un utilisateur. A appeler depuis un
 * autre module juste apres un evenement pertinent (le destinataire doit
 * avoir ete determine par l'appelant a partir de donnees deja verifiees,
 * ex : le patient d'un rendez-vous que l'on vient de confirmer).
 *
 * F-NOT-03 : si l'utilisateur a active le SMS pour la categorie de ce type
 * (PreferenceNotification), un SMS est aussi depose dans la boite d'envoi
 * (fournisseur simule, F-NOT-02 : rien ne part reellement). Le canal email
 * n'existe pas pour les notifications, sa preference reste sans effet.
 *
 * F-NOT-04 : avec un codeCatalogue, le texte du SMS vient du catalogue (et
 * pas de "message") ; une entree inactive, sans texte ou a variable non
 * resolue n'envoie aucun SMS. La notification interne est ecrite dans tous les cas.
 */
export async function creerNotification(
  utilisateurId: string,
  type: string,
  message: string,
  lien?: string,
  options?: OptionsNotification
): Promise<void> {
  await prisma.notification.create({
    data: { utilisateurId, type, message, lien: lien ?? null },
  });

  try {
    await envoyerParCanalSms(utilisateurId, type, message, options);
  } catch (erreur) {
    // La notification interne est deja ecrite : un canal externe en echec ne
    // doit jamais faire echouer l'evenement metier qui l'a declenchee.
    console.error("Erreur lors de l'envoi SMS d'une notification :", erreur);
  }
}

async function envoyerParCanalSms(
  utilisateurId: string,
  type: string,
  message: string,
  options?: OptionsNotification
): Promise<void> {
  const categorie = categorieDuType(type);
  if (!categorie) return;

  const preference = await prisma.preferenceNotification.findUnique({
    where: { utilisateurId_categorie: { utilisateurId, categorie } },
  });
  if (!preference?.sms) return;

  let texteSms = message;
  if (options?.codeCatalogue) {
    const texteCatalogue = await getTexteSmsDuCatalogue(options.codeCatalogue, options.variables);
    if (texteCatalogue === null) return;
    texteSms = texteCatalogue;
  }

  const utilisateur = await prisma.user.findUnique({ where: { id: utilisateurId }, select: { telephone: true } });
  if (!utilisateur?.telephone) return;

  await envoyerSms({
    destinataire: utilisateur.telephone,
    texte: texteSms,
    categorie,
    modele: options?.codeCatalogue,
  });
}
