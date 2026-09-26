/**
 * Point d'entree pour envoyer un SMS (F-NOT-02 du pack), applique les
 * regles strictes du pack avant de deleguer au provider :
 *
 * - RG-NOT-02 : le texte final commence par "BHIP : ", fait au maximum 160
 *   caracteres, et est translittere (accents retires) - une regle du pack
 *   pense pour un fournisseur SMS reel qui pourrait ne pas gerer l'UTF-8,
 *   appliquee ici meme si OutboxSmsProvider (seule implementation) n'en a
 *   pas besoin techniquement : le texte enregistre doit deja etre celui
 *   qu'un vrai fournisseur recevrait un jour.
 * - RG-NOT-04 : un SMS non urgent (categorie hors "securite"/"codes")
 *   envoye entre 21h00 et 7h00 (heure du Benin, Africa/Porto-Novo) est
 *   differe a 7h00 plutot qu'envoye immediatement.
 *
 * Limite assumee et documentee : la remise effective d'un SMS differe
 * (statut "differe") a 7h00 n'est pas automatisee - ce depot n'a pas de
 * tache planifiee fiable a laquelle se raccrocher ce soir (meme limite que
 * partout ailleurs cette nuit). La ligne EnvoiSms reste visible avec son
 * statut et sa date programmee sur /app/ministere/sms, mais rien ne la
 * fait passer a "simule" automatiquement a l'heure dite.
 *
 * Module pur (pas de "use server") : appele depuis d'autres modules
 * server-side (Server Actions, routes), jamais directement depuis un
 * composant client.
 */

import { prisma } from "@/lib/prisma";
import { OutboxSmsProvider } from "./provider";
import type { CategorieNotification, CategorieVerrouillee } from "../categories";

const LONGUEUR_MAX_SMS = 160;
const PREFIXE_SMS = "BHIP : ";
const CATEGORIES_NON_DIFFEREES: (CategorieNotification | CategorieVerrouillee)[] = ["securite", "codes"];
const HEURE_DEBUT_SILENCE = 21;
const HEURE_FIN_SILENCE = 7;

/** Retire les diacritiques (accents) d'un texte, meme technique que normaliserPourComparaison ailleurs dans ce depot. */
function translitterer(texte: string): string {
  return texte.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/** RG-NOT-02 : prefixe "BHIP : " (si absent), translitteration, troncature a 160 caracteres. */
export function formaterTexteSms(texte: string): string {
  const brut = texte.startsWith(PREFIXE_SMS) ? texte : `${PREFIXE_SMS}${texte}`;
  return translitterer(brut).slice(0, LONGUEUR_MAX_SMS);
}

/** Heure courante au Benin (Africa/Porto-Novo, UTC+1 sans heure d'ete), independante du fuseau du serveur. */
function heureCouranteBenin(): number {
  const heure = new Intl.DateTimeFormat("en-US", {
    timeZone: "Africa/Porto-Novo",
    hour: "2-digit",
    hour12: false,
  }).format(new Date());
  return Number.parseInt(heure, 10) % 24;
}

/** RG-NOT-04 : vrai si l'heure courante au Benin tombe dans la plage de silence (21h-7h). */
function dansLaPlageDeSilence(heure: number): boolean {
  return heure >= HEURE_DEBUT_SILENCE || heure < HEURE_FIN_SILENCE;
}

/** Prochaine occurrence de 7h00 (heure du Benin), pour la date programmee d'un SMS differe. */
function prochaineSeptHeures(): Date {
  const maintenant = new Date();
  const cible = new Date(maintenant);
  cible.setUTCHours(6, 0, 0, 0); // 7h locale Benin (UTC+1, sans heure d'ete) = 6h UTC
  if (cible.getTime() <= maintenant.getTime()) {
    cible.setUTCDate(cible.getUTCDate() + 1);
  }
  return cible;
}

export interface EnvoyerSmsParametres {
  destinataire: string;
  texte: string;
  categorie: CategorieNotification | CategorieVerrouillee;
  modele?: string;
}

/**
 * Envoie (ou differe selon RG-NOT-04) un SMS. Le texte est toujours reforme
 * selon RG-NOT-02 avant ecriture, quel que soit le statut final.
 */
export async function envoyerSms({ destinataire, texte, categorie, modele }: EnvoyerSmsParametres): Promise<void> {
  const texteFinal = formaterTexteSms(texte);
  const urgent = CATEGORIES_NON_DIFFEREES.includes(categorie);

  if (!urgent && dansLaPlageDeSilence(heureCouranteBenin())) {
    await prisma.envoiSms.create({
      data: {
        destinataire,
        texte: texteFinal,
        categorie,
        statut: "differe",
        dateProgrammee: prochaineSeptHeures(),
        modele: modele ?? null,
      },
    });
    return;
  }

  await OutboxSmsProvider.send({ to: destinataire, text: texteFinal, category: categorie, modele });
}
