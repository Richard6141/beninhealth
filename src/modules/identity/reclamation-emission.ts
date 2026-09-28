/**
 * Generation d'un code de reclamation de dossier (F-AUTH-03 du pack),
 * partagee entre reclamation.ts (generation manuelle depuis un ecran
 * professionnel, genererCodeReclamationAction) et actions.ts
 * (creerPatientParProfessionnelAction : envoi automatique du SMS N-CLAIM-CODE
 * a la creation du dossier "sans compte", F-CLI-03 du pack, section 07
 * "Comptes et acces", etape 4 : "envoie au patient un SMS avec le code de
 * reclamation... s'il a un telephone"). Module pur (pas de "use server") :
 * les DEUX appelants sont deja des Server Actions qui ont verifie la
 * session avant d'appeler cette fonction (Zero Trust deja assure en amont).
 *
 * Le hachage du code est toujours fait DANS la transaction de l'appelant
 * (atomicite avec le reste de son ecriture) ; l'envoi du SMS lui-meme reste
 * TOUJOURS hors de toute transaction (meme convention deja etablie par
 * envoyerSms, qui ecrit via le client Prisma module-level, jamais un tx
 * fourni) : l'appelant recupere le code en clair et appelle envoyerSms
 * lui-meme, une fois sa propre transaction validee.
 */

import { randomInt } from "node:crypto";
import bcrypt from "bcryptjs";
import type { Prisma } from "@prisma/client";

const ROUNDS_BCRYPT = 12;
const JOURS_VALIDITE_CODE = 30;
const ALPHABET_CODE = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
const LONGUEUR_CODE = 8;

function genererCode(): string {
  let code = "";
  for (let i = 0; i < LONGUEUR_CODE; i++) {
    code += ALPHABET_CODE[randomInt(0, ALPHABET_CODE.length)];
  }
  return code;
}

/**
 * Genere un nouveau code de reclamation pour patientId, dans la transaction
 * fournie : invalide d'abord tout code encore valide pour ce meme dossier
 * (RG-AUTH-20, un seul code utilisable a la fois), puis cree le nouveau
 * (hache, jamais stocke en clair). Retourne le code EN CLAIR, uniquement
 * pour permettre a l'appelant d'envoyer le SMS juste apres (jamais
 * persiste ailleurs que dans le texte du SMS lui-meme, meme limite deja
 * assumee par les autres codes envoyes par SMS de ce depot, voir
 * src/modules/transfert/envoi-code.ts).
 */
export async function creerCodeReclamation(tx: Prisma.TransactionClient, patientId: string): Promise<string> {
  await tx.codeReclamationDossier.updateMany({
    where: { patientId, consommeLe: null, expireLe: { gt: new Date() } },
    data: { expireLe: new Date() },
  });

  const code = genererCode();
  const codeHash = await bcrypt.hash(code, ROUNDS_BCRYPT);
  const expireLe = new Date();
  expireLe.setDate(expireLe.getDate() + JOURS_VALIDITE_CODE);

  await tx.codeReclamationDossier.create({ data: { patientId, codeHash, expireLe } });

  return code;
}

/** Texte du SMS N-CLAIM-CODE (catalogue F-NOT-04 du pack), partage par les deux emetteurs. */
export function texteSmsCodeReclamation(code: string): string {
  return `Votre code pour activer votre compte BHIP : ${code}. Valable 30 jours.`;
}
