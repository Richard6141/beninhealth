import { prisma } from "@/lib/prisma";
import { CATALOGUE_NOTIFICATIONS_DEFAUT } from "./catalogue-defaut";

/**
 * Le catalogue des notifications (F-NOT-04, table ModeleNotification,
 * administrable sur /app/ministere/referentiels/notifications) devient la
 * source des textes SMS des notifications emises avec un code N-*. Module
 * pur (pas de "use server").
 *
 * Regle : une notification emise avec un code n'ouvre le canal SMS que si
 * l'entree du catalogue existe, est active et porte un texte non vide (un
 * texte vide signifie "interne seulement", comme N-LAB-RESULT-PRO). Sans
 * code, l'ancien comportement (texte du message interne) est inchange.
 *
 * RG-ADM-50 / meme principe que estFonctionnaliteActive (parametres.ts) :
 * la table n'est semee qu'a la premiere ouverture de l'ecran d'administration
 * (referentiel-notifications.ts) ; avant cela, ou pour un code que
 * l'administrateur n'a jamais modifie, on retombe sur le texte compile de
 * CATALOGUE_NOTIFICATIONS_DEFAUT plutot que de supprimer silencieusement le
 * SMS. Une ligne DEJA presente en base (une fois l'ecran ouvert une fois)
 * garde toujours la priorite : un administrateur peut desactiver ou modifier
 * un texte sans qu'un redemarrage ne revienne en arriere.
 */
const DEFAUTS_PAR_CODE = new Map(CATALOGUE_NOTIFICATIONS_DEFAUT.map((entree) => [entree.code, entree]));

const PLACEHOLDER = /\{([a-zA-Z_]+)\}/g;

export interface ModeleRendu {
  texte: string;
  /** Variables du modele sans valeur fournie : le texte n'est alors pas utilisable tel quel. */
  manquantes: string[];
}

/** Remplace {variable} par sa valeur ; signale les variables sans valeur. */
export function rendreModele(modele: string, variables: Record<string, string> = {}): ModeleRendu {
  const manquantes: string[] = [];
  const texte = modele.replace(PLACEHOLDER, (_, nom: string) => {
    const valeur = variables[nom];
    if (valeur === undefined) {
      if (!manquantes.includes(nom)) manquantes.push(nom);
      return `{${nom}}`;
    }
    return valeur;
  });
  return { texte, manquantes };
}

/**
 * Texte SMS d'un code du catalogue, rendu avec les variables fournies, ou
 * null si aucun SMS ne doit partir (entree absente, inactive, texte vide, ou
 * variable manquante : jamais un SMS avec un {champ} non resolu).
 */
export async function getTexteSmsDuCatalogue(code: string, variables: Record<string, string> = {}): Promise<string | null> {
  const ligne = await prisma.modeleNotification.findUnique({
    where: { code },
    select: { texteModele: true, actif: true },
  });
  // Table pas encore semee pour ce code (personne n'a encore ouvert l'ecran d'administration) :
  // le texte compile fait foi, jamais un SMS supprime en silence pour cette seule raison.
  const entree = ligne ?? (DEFAUTS_PAR_CODE.has(code) ? { texteModele: DEFAUTS_PAR_CODE.get(code)!.texteModele, actif: true } : null);
  if (!entree || !entree.actif || entree.texteModele.trim() === "") return null;

  const rendu = rendreModele(entree.texteModele, variables);
  return rendu.manquantes.length > 0 ? null : rendu.texte;
}
