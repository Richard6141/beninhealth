/**
 * F-PRE-03 du pack (posologie structuree), version reduite et volontaire :
 * seul le FORMULAIRE de creation devient structure (dose/unite/voie/frequence
 * separes). LignePrescription.posologie (prisma/schema.prisma) reste un
 * simple String tel quel, compose ici a partir des champs structures cote
 * serveur (Zero Trust : jamais la chaine composee cote client, seulement les
 * champs structures, valides puis composes dans creerPrescriptionAction). Un
 * vrai champ structure cote stockage viendra avec une migration separee plus
 * tard ; le schema est en pleine activite concurrente ce soir (migration
 * analytics F-PIL-07), pas touche ici.
 */

export const UNITES_POSOLOGIE = ["mg", "comprime", "ml", "UI"] as const;
export type UnitePosologie = (typeof UNITES_POSOLOGIE)[number];

export const VOIES_POSOLOGIE = ["orale", "IM", "IV", "topique", "autre"] as const;
export type VoiePosologie = (typeof VOIES_POSOLOGIE)[number];

export const FREQUENCES_POSOLOGIE = ["1x/j", "2x/j", "3x/j", "autre"] as const;
export type FrequencePosologie = (typeof FREQUENCES_POSOLOGIE)[number];

export const LIBELLES_UNITE_POSOLOGIE: Record<UnitePosologie, (dose: number) => string> = {
  mg: () => "mg",
  comprime: (dose) => (dose === 1 ? "comprimé" : "comprimés"),
  ml: () => "ml",
  UI: () => "UI",
};

export const LIBELLES_VOIE_POSOLOGIE: Record<Exclude<VoiePosologie, "autre">, string> = {
  orale: "orale",
  IM: "intramusculaire (IM)",
  IV: "intraveineuse (IV)",
  topique: "topique",
};

export const LIBELLES_FREQUENCE_POSOLOGIE: Record<Exclude<FrequencePosologie, "autre">, string> = {
  "1x/j": "1 fois par jour",
  "2x/j": "2 fois par jour",
  "3x/j": "3 fois par jour",
};

export interface ChampsPosologie {
  dose: number;
  unite: UnitePosologie;
  voie: VoiePosologie;
  voieAutre: string;
  frequence: FrequencePosologie;
  frequenceAutre: string;
}

/**
 * Un champ "autre" (voie ou frequence) doit etre renseigne des que l'option
 * correspondante vaut "autre". Verifie cote formulaire (desactive le bouton
 * d'enregistrement) ET cote serveur (creerPrescriptionAction, Zero Trust).
 */
export function precisionAutreManquante(champs: ChampsPosologie): boolean {
  return (
    (champs.voie === "autre" && champs.voieAutre.trim().length === 0) ||
    (champs.frequence === "autre" && champs.frequenceAutre.trim().length === 0)
  );
}

/**
 * Compose la chaine de posologie stockee (ex. "500 mg, voie orale, 2 fois
 * par jour") a partir des champs structures. Suppose precisionAutreManquante
 * deja verifie false par l'appelant.
 */
export function composerPosologie(champs: ChampsPosologie): string {
  const doseEtUnite = `${champs.dose} ${LIBELLES_UNITE_POSOLOGIE[champs.unite](champs.dose)}`;
  const libelleVoie =
    champs.voie === "autre" ? champs.voieAutre.trim() : LIBELLES_VOIE_POSOLOGIE[champs.voie];
  const libelleFrequence =
    champs.frequence === "autre"
      ? champs.frequenceAutre.trim()
      : LIBELLES_FREQUENCE_POSOLOGIE[champs.frequence];

  return `${doseEtUnite}, voie ${libelleVoie}, ${libelleFrequence}`;
}
