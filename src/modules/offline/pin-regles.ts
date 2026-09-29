/**
 * Regles de validation du code PIN a 6 chiffres (F-COM-01, etape 3 du pack) :
 * module pur, sans effet de bord, importable aussi bien cote client (ecran
 * /terrain/preparation) que dans les tests. Aucune dependance a Web Crypto ni
 * a Next.js ici : uniquement de la validation de chaine de caracteres.
 */

const PIN_INTERDITS_EXPLICITES = new Set(["000000", "123456"]);

/** Suites triviales (croissantes, decroissantes, ou un seul chiffre repete) refusees en plus des deux valeurs citees par le pack. */
function estSuiteTriviale(pin: string): boolean {
  if (new Set(pin.split("")).size === 1) return true;

  const chiffres = pin.split("").map(Number);
  const croissant = chiffres.every((c, i) => i === 0 || c === chiffres[i - 1] + 1);
  const decroissant = chiffres.every((c, i) => i === 0 || c === chiffres[i - 1] - 1);
  return croissant || decroissant;
}

/**
 * Une "date evidente" au sens du pack : le PIN lu comme JJMMAA ou AAMMJJ
 * correspond a une date calendaire valide. Detection volontairement simple
 * (pas de tentative de deviner le format exact voulu par l'utilisateur) :
 * DDMMYY, MMDDYY et YYMMDD sont tous les trois verifies, n'importe lequel
 * suffit a refuser le PIN.
 */
function estDateEvidente(pin: string): boolean {
  const jj = Number(pin.slice(0, 2));
  const mm = Number(pin.slice(2, 4));
  const mmAlt = Number(pin.slice(0, 2));
  const jjAlt = Number(pin.slice(2, 4));

  const estJourMoisValide = (jour: number, mois: number) =>
    mois >= 1 && mois <= 12 && jour >= 1 && jour <= 31;

  return estJourMoisValide(jj, mm) || estJourMoisValide(jjAlt, mmAlt);
}

export interface ResultatValidationPin {
  valide: boolean;
  erreur: string | null;
}

/**
 * Valide un PIN candidat (F-COM-01) : exactement 6 chiffres, ni 000000, ni
 * 123456, ni une autre suite triviale, ni une date evidente au format
 * JJMMAA/MMJJAA.
 */
export function validerPin(pin: string): ResultatValidationPin {
  if (!/^\d{6}$/.test(pin)) {
    return { valide: false, erreur: "Le code PIN doit comporter exactement 6 chiffres." };
  }

  if (PIN_INTERDITS_EXPLICITES.has(pin)) {
    return { valide: false, erreur: "Ce code PIN est trop simple. Choisissez une combinaison moins previsible." };
  }

  if (estSuiteTriviale(pin)) {
    return { valide: false, erreur: "Ce code PIN forme une suite trop previsible. Choisissez une combinaison moins previsible." };
  }

  if (estDateEvidente(pin)) {
    return { valide: false, erreur: "Ce code PIN ressemble a une date de naissance. Choisissez une combinaison moins previsible." };
  }

  return { valide: true, erreur: null };
}

/** Verifie que les deux saisies du PIN (definition, confirmation) correspondent et sont valides. */
export function validerConfirmationPin(pin: string, confirmation: string): ResultatValidationPin {
  const resultat = validerPin(pin);
  if (!resultat.valide) return resultat;

  if (pin !== confirmation) {
    return { valide: false, erreur: "Les deux codes PIN saisis ne correspondent pas." };
  }

  return { valide: true, erreur: null };
}
