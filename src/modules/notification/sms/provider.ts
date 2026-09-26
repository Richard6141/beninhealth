/**
 * Adaptateur d'envoi de SMS (F-NOT-02 du pack). Interface unique
 * `SmsProvider.send`, deux implementations prevues par le pack :
 * `OutboxSmsProvider` (ecrit dans une boite d'envoi simulee, seule
 * implementee ici) et `HttpSmsProvider` (fournisseur reel, P2 dans le pack
 * lui-meme, jamais construit dans ce depot).
 *
 * Module pur (pas de "use server") : appele uniquement depuis
 * envoyer.ts (meme module), jamais directement depuis un composant client.
 */

import { prisma } from "@/lib/prisma";
import type { CategorieNotification, CategorieVerrouillee } from "../categories";

export interface ParametresEnvoiSms {
  to: string;
  text: string;
  category: CategorieNotification | CategorieVerrouillee;
  /** Nom du modele de texte utilise (pour la trace), facultatif. */
  modele?: string;
}

export interface SmsProvider {
  send(parametres: ParametresEnvoiSms): Promise<void>;
}

/**
 * Implementation simulee (statut "simule") : ecrit reellement une ligne en
 * base, mais n'atteint aucun telephone. Seule implementation de ce depot,
 * conforme au perimetre P0 du pack pour F-NOT-02 (HttpSmsProvider est P2).
 */
export const OutboxSmsProvider: SmsProvider = {
  async send({ to, text, category, modele }) {
    await prisma.envoiSms.create({
      data: {
        destinataire: to,
        texte: text,
        categorie: category,
        statut: "simule",
        modele: modele ?? null,
      },
    });
  },
};
