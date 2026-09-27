/**
 * Adaptateur d'envoi de SMS (F-NOT-02 du pack). Interface unique
 * `SmsProvider.send`, deux implementations prevues par le pack :
 * `OutboxSmsProvider` (boite d'envoi simulee, seule implementee ici) et
 * `HttpSmsProvider` (fournisseur reel, P2 dans le pack lui-meme, jamais
 * construit dans ce depot : il enverrait des numeros de telephone hors du
 * poste, ce que la regle du projet interdit sans accord).
 *
 * Un fournisseur ne touche JAMAIS la base : il tente la livraison et renvoie
 * son resultat, ou LEVE UNE ERREUR en cas d'echec. La ligne EnvoiSms, son
 * statut, le nombre de tentatives et les reprises (RG-NOT-03) sont geres par
 * livraison.ts, pour qu'un fournisseur reel se branche sans rien reecrire.
 *
 * Module pur (pas de "use server") : appele uniquement depuis le module sms.
 */

import type { CategorieNotification, CategorieVerrouillee } from "../categories";

export interface ParametresEnvoiSms {
  to: string;
  text: string;
  category: CategorieNotification | CategorieVerrouillee;
  /** Nom du modele de texte utilise (pour la trace), facultatif. */
  modele?: string;
}

export interface ResultatEnvoiSms {
  /** simule : boite d'envoi, aucun telephone atteint ; envoye : remis a l'operateur. */
  statut: "simule" | "envoye";
  /** Cout de l'envoi si le fournisseur le donne. */
  cout?: number;
}

export interface SmsProvider {
  /** Leve une erreur si la livraison echoue : la ligne est alors reessayee (RG-NOT-03). */
  send(parametres: ParametresEnvoiSms): Promise<ResultatEnvoiSms>;
}

/**
 * Implementation simulee : aucun SMS ne part, la ligne EnvoiSms creee par
 * livraison.ts (statut "simule") EST la boite d'envoi consultable
 * (/app/ministere/sms, F-NOT-02 : "disponible en developpement et en staging").
 */
export const OutboxSmsProvider: SmsProvider = {
  async send() {
    return { statut: "simule" };
  },
};

/** Fournisseur utilise par l'application. Aucun fournisseur reel n'existe dans ce depot : la boite d'envoi simulee. */
export function fournisseurSms(): SmsProvider {
  return OutboxSmsProvider;
}
