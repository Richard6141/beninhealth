/**
 * Controle "numero d'Ordre verifie" des actes sensibles (F-ADM-03, RG-ROL-05).
 * Module SANS "use server" : dans validation-professionnels.ts, cette fonction
 * serait un point d'entree atteignable par POST avec un userId arbitraire
 * (n'importe qui pourrait sonder l'etat de verification d'un professionnel).
 *
 * L'interrupteur "professionnels.exige_validation_ordre" (catalogue F-ADM-07,
 * desactive par defaut) decide si le controle s'applique. Desactive : tout
 * professionnel actif accomplit ces actes, comme avant (la demonstration et
 * l'integration des etablissements ne dependent pas du validateur). Active :
 * seuls les professionnels dont le numero a ete approuve par le ministere il y
 * a moins d'un an les accomplissent.
 *
 * Actes concernes : demande et confirmation d'un acces par code ou NPI
 * (transfert/actions.ts), signature d'une prescription
 * (prescription/actions.ts), validation d'une consultation (clinical/actions.ts).
 */

import { prisma } from "@/lib/prisma";
import { estFonctionnaliteActive } from "./parametres";
import { etatVerification } from "./validation-professionnels-regles";

export const MESSAGE_ORDRE_NON_VERIFIE = "Votre numéro d'Ordre n'est pas encore vérifié par le ministère.";

/**
 * Vrai si le professionnel peut accomplir un acte sensible : toujours vrai
 * quand l'interrupteur est desactive ; sinon il faut un profil valide, non
 * refuse, sans demande de complement en cours, avec une verification de moins
 * d'un an. Un compte sans profil professionnel n'est jamais valide.
 */
export async function professionnelValide(userId: string): Promise<boolean> {
  if (!(await estFonctionnaliteActive("professionnels.exige_validation_ordre"))) {
    return true;
  }

  const professionnel = await prisma.professionnelSante.findUnique({
    where: { userId },
    select: { statutValidation: true, validationDecision: true, ordreVerifieLe: true },
  });

  if (!professionnel) {
    return false;
  }

  return professionnel.statutValidation === "valide" && etatVerification(professionnel, new Date()) === "verifie";
}
