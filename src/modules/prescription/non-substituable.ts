/**
 * "Non substituable" d'une ligne d'ordonnance (F-PRE-01 du pack) : le
 * medecin coche la case pour interdire a la pharmacie de delivrer un generique
 * a la place du medicament prescrit (RG-PHA-12) ; le motif est alors
 * obligatoire. Module pur, sans "use server" : partage entre le formulaire
 * (retour immediat) et le serveur (seule autorite reelle).
 */

export const MOTIF_NON_SUBSTITUABLE_MIN = 10;
export const MOTIF_NON_SUBSTITUABLE_MAX = 200;

export const MESSAGE_MOTIF_NON_SUBSTITUABLE_REQUIS = `Le motif de non substitution est obligatoire (${MOTIF_NON_SUBSTITUABLE_MIN} caracteres minimum).`;
export const MESSAGE_MOTIF_NON_SUBSTITUABLE_TROP_LONG = `Le motif de non substitution ne peut pas depasser ${MOTIF_NON_SUBSTITUABLE_MAX} caracteres.`;

export type ResultatNonSubstituable = { ok: true; motif: string | null } | { ok: false; error: string };

/**
 * Motif a enregistrer pour une ligne : null quand la case n'est pas cochee
 * (un motif saisi puis abandonne n'est jamais conserve), le motif sans
 * espaces de bord sinon, ou l'erreur a afficher.
 */
export function validerNonSubstituable(nonSubstituable: boolean, motif: string): ResultatNonSubstituable {
  if (!nonSubstituable) {
    return { ok: true, motif: null };
  }

  const motifNettoye = motif.trim().replace(/\s+/g, " ");

  if (motifNettoye.length < MOTIF_NON_SUBSTITUABLE_MIN) {
    return { ok: false, error: MESSAGE_MOTIF_NON_SUBSTITUABLE_REQUIS };
  }

  if (motifNettoye.length > MOTIF_NON_SUBSTITUABLE_MAX) {
    return { ok: false, error: MESSAGE_MOTIF_NON_SUBSTITUABLE_TROP_LONG };
  }

  return { ok: true, motif: motifNettoye };
}
