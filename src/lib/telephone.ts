/**
 * Normalisation des numeros de telephone beninois vers la forme E.164
 * canonique a 10 chiffres nationaux : "+229" + "01" + 8 chiffres.
 *
 * Hypothese a confirmer aupres de l'ARCEP : depuis fin 2024 le plan de
 * numerotation beninois est passe de 8 a 10 chiffres par ajout du prefixe
 * "01". Les deux formes circulent encore dans les saisies (et dans les
 * donnees deja enregistrees), d'ou la conversion des numeros a 8 chiffres.
 * Le comparateur ne depend que de cette fonction : corriger la regle ici
 * corrige toutes les recherches par telephone.
 */

const INDICATIF_BENIN = "229";

/** Renvoie "+2290197000000" ou null si la saisie n'est pas un numero beninois reconnaissable. */
export function normaliserTelephoneBenin(saisie: string): string | null {
  let chiffres = saisie.replace(/\D/g, "");

  if (chiffres.startsWith("00")) {
    chiffres = chiffres.slice(2);
  }

  if ((chiffres.length === 11 || chiffres.length === 13) && chiffres.startsWith(INDICATIF_BENIN)) {
    chiffres = chiffres.slice(INDICATIF_BENIN.length);
  }

  if (chiffres.length === 8) {
    return `+${INDICATIF_BENIN}01${chiffres}`;
  }

  if (chiffres.length === 10 && chiffres.startsWith("01")) {
    return `+${INDICATIF_BENIN}${chiffres}`;
  }

  return null;
}

/** Vrai si les deux saisies designent le meme numero beninois. */
export function memeTelephoneBenin(a: string, b: string): boolean {
  const normaliseA = normaliserTelephoneBenin(a);
  return normaliseA !== null && normaliseA === normaliserTelephoneBenin(b);
}
