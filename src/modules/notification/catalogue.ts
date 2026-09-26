import { prisma } from "@/lib/prisma";

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
 */

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
  const entree = await prisma.modeleNotification.findUnique({
    where: { code },
    select: { texteModele: true, actif: true },
  });
  if (!entree || !entree.actif || entree.texteModele.trim() === "") return null;

  const rendu = rendreModele(entree.texteModele, variables);
  return rendu.manquantes.length > 0 ? null : rendu.texte;
}
