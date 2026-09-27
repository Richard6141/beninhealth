/**
 * Alertes de securite envoyees au titulaire d'un compte (nouvelle connexion,
 * verrouillage apres des echecs) : notification interne ET SMS. La categorie
 * "securite" est verrouillee (RG-NOT-10) : aucun choix de l'utilisateur ne la
 * desactive et le SMS n'est jamais differe (RG-NOT-04). Le texte n'a jamais de
 * lien cliquable. Un echec d'envoi ne fait jamais echouer l'action qui declenche
 * l'alerte. Module serveur SANS "use server".
 */

import { prisma } from "@/lib/prisma";
import { creerNotification } from "@/modules/notification/creer";
import { envoyerSms } from "@/modules/notification/sms/envoyer";

export async function alerterSecurite(
  userId: string,
  alerte: { type: string; message: string; messageSms: string }
): Promise<void> {
  try {
    await creerNotification(userId, alerte.type, alerte.message, "/app/securite");
  } catch (erreur) {
    console.error("Notification de securite impossible :", erreur);
  }

  try {
    const utilisateur = await prisma.user.findUnique({ where: { id: userId }, select: { telephone: true } });

    if (utilisateur?.telephone) {
      await envoyerSms({ destinataire: utilisateur.telephone, texte: alerte.messageSms, categorie: "securite" });
    }
  } catch (erreur) {
    console.error("SMS de securite impossible :", erreur);
  }
}
