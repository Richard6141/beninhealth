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

/**
 * F-AUTH-02 (corrige le 2026-09-29, tableau du pack 07-fiches-comptes.md) :
 * "10 echecs en 24h -> verrouillage 24h ; notification a l'administrateur si
 * le compte est professionnel." Notifie tous les admin_national actifs (role
 * unique d'autorite de ce depot, pas de notion d'administrateur scope a un
 * seul etablissement pour cette alerte). Un echec d'envoi individuel
 * n'interrompt jamais les autres (meme principe que alerterSecurite).
 */
export async function notifierAdministrateursVerrouillage24h(compteVerrouille: {
  email: string;
}): Promise<void> {
  try {
    const administrateurs = await prisma.user.findMany({
      where: { statut: "actif", roles: { some: { nom: "admin_national" } } },
      select: { id: true },
    });

    for (const administrateur of administrateurs) {
      try {
        await creerNotification(
          administrateur.id,
          "compte_verrouille_24h",
          `Le compte professionnel ${compteVerrouille.email} a ete verrouille pour 24 heures apres 10 echecs de connexion.`,
          "/app/ministere/comptes"
        );
      } catch (erreur) {
        console.error("Notification administrateur de verrouillage 24h impossible :", erreur);
      }
    }
  } catch (erreur) {
    console.error("Recherche des administrateurs a notifier impossible :", erreur);
  }
}
