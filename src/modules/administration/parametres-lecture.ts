import { prisma } from "@/lib/prisma";
import { definitionParametre, type CleParametre } from "./parametres-catalogue";

/**
 * Lecture d'un parametre numerique administrable (F-ADM-07). Volontairement
 * HORS d'un fichier "use server" : ce n'est pas un point d'entree, seuls les
 * modules serveur l'appellent (un seul chiffre, aucune donnee personnelle).
 *
 * RG-ADM-50 : la valeur est relue en base a CHAQUE appel, jamais mise en cache,
 * donc une modification prend effet sans redemarrage. Fail-safe : si la ligne
 * est absente (avant le premier passage sur l'ecran des parametres, qui les
 * seme), hors des bornes du catalogue (donnee alteree) ou si la base echoue,
 * on retombe sur la valeur par defaut du catalogue, jamais sur une valeur non
 * bornee ni sur une exception qui bloquerait la connexion ou un acces d'urgence.
 */
export async function lireParametre(cle: CleParametre): Promise<number> {
  const definition = definitionParametre(cle);

  try {
    const ligne = await prisma.parametre.findUnique({ where: { cle }, select: { valeur: true } });
    if (ligne === null) return definition.valeurDefaut;

    const valeur = ligne.valeur;
    const valide =
      Number.isFinite(valeur) && Number.isInteger(valeur) && valeur >= definition.borneMin && valeur <= definition.borneMax;
    return valide ? valeur : definition.valeurDefaut;
  } catch (erreur) {
    console.error("[administration] lecture du parametre impossible, valeur par defaut utilisee :", cle, erreur);
    return definition.valeurDefaut;
  }
}
