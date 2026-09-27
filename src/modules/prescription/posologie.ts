/**
 * F-PRE-01/F-PRE-03 du pack (posologie structuree) : seul le FORMULAIRE de
 * creation est structure (dose/unite/voie/frequence/moments separes).
 * LignePrescription.posologie (prisma/schema.prisma) reste un simple String
 * tel quel, compose ici a partir des champs structures cote serveur (Zero
 * Trust : jamais la chaine composee cote client, seulement les champs
 * structures, valides puis composes dans creerPrescriptionAction). Un vrai
 * champ structure cote stockage viendrait avec une migration separee.
 *
 * Etendu le 2026-09-27 (F-PRE-01) aux 11 unites et 12 voies du pack, a la
 * frequence en 3 modes ("X fois par jour", "toutes les X heures", "si
 * besoin" avec un maximum par 24 h) et aux "moments" (matin/midi/soir/
 * coucher). Quantite totale desormais CALCULEE (dose x prises par jour x
 * jours, arrondie a l'unite superieure) plutot que saisie a l'aveugle,
 * mais toujours modifiable (texte du pack) : voir quantiteSuggeree.
 *
 * Perimetre reduit assume, non repris dans cette iteration (decision
 * d'architecture plutot qu'une correction simple, voir
 * docs/coordination-agents.md) :
 * - Etat DRAFT/ACTIVE/ABANDONED (creation puis signature separees) :
 *   changerait le cycle de vie de toute prescription, avec des
 *   repercussions sur la pharmacie (F-PHA) et RG-PRE-00 (immutabilite).
 *   Ce depot cree toujours directement une prescription "validee" (voir
 *   l'en-tete de prescription/actions.ts).
 * - "Traitement de fond" (duree indefinie) : LignePrescription.dureeTraitementJours
 *   est un entier obligatoire non nullable ; le representer honnetement
 *   demanderait un champ nullable ou un sentinel, une migration a discuter.
 * - Instructions par ligne avec raccourcis ("avant/pendant/apres le repas",
 *   "a jeun") : le champ existant est au niveau de l'ordonnance entiere
 *   (pas de colonne dediee sur LignePrescription) ; les raccourcis
 *   inserent dans ce champ existant plutot que d'ajouter un vrai champ par
 *   ligne.
 */

export const UNITES_POSOLOGIE = [
  "comprime",
  "gelule",
  "sachet",
  "cuillere_mesure",
  "ml",
  "goutte",
  "suppositoire",
  "application",
  "bouffee",
  "injection",
  "ovule",
] as const;
export type UnitePosologie = (typeof UNITES_POSOLOGIE)[number];

export const VOIES_POSOLOGIE = [
  "orale",
  "sublinguale",
  "intramusculaire",
  "intraveineuse",
  "sous_cutanee",
  "cutanee",
  "rectale",
  "vaginale",
  "oculaire",
  "auriculaire",
  "nasale",
  "inhalee",
] as const;
export type VoiePosologie = (typeof VOIES_POSOLOGIE)[number];

export const MODES_FREQUENCE = ["fois_par_jour", "toutes_les_x_heures", "si_besoin"] as const;
export type ModeFrequence = (typeof MODES_FREQUENCE)[number];

export const MOMENTS_POSOLOGIE = ["matin", "midi", "soir", "coucher"] as const;
export type MomentPosologie = (typeof MOMENTS_POSOLOGIE)[number];

export const FOIS_PAR_JOUR_MIN = 1;
export const FOIS_PAR_JOUR_MAX = 6;

export const RACCOURCIS_INSTRUCTIONS = [
  "avant le repas",
  "pendant le repas",
  "après le repas",
  "à jeun",
] as const;

export const LIBELLES_UNITE_POSOLOGIE: Record<UnitePosologie, (dose: number) => string> = {
  comprime: (dose) => (dose === 1 ? "comprimé" : "comprimés"),
  gelule: (dose) => (dose === 1 ? "gélule" : "gélules"),
  sachet: (dose) => (dose === 1 ? "sachet" : "sachets"),
  cuillere_mesure: (dose) => (dose === 1 ? "cuillère-mesure" : "cuillères-mesure"),
  ml: () => "ml",
  goutte: (dose) => (dose === 1 ? "goutte" : "gouttes"),
  suppositoire: (dose) => (dose === 1 ? "suppositoire" : "suppositoires"),
  application: (dose) => (dose === 1 ? "application" : "applications"),
  bouffee: (dose) => (dose === 1 ? "bouffée" : "bouffées"),
  injection: (dose) => (dose === 1 ? "injection" : "injections"),
  ovule: (dose) => (dose === 1 ? "ovule" : "ovules"),
};

export const LIBELLES_VOIE_POSOLOGIE: Record<VoiePosologie, string> = {
  orale: "orale",
  sublinguale: "sublinguale",
  intramusculaire: "intramusculaire",
  intraveineuse: "intraveineuse",
  sous_cutanee: "sous-cutanée",
  cutanee: "cutanée",
  rectale: "rectale",
  vaginale: "vaginale",
  oculaire: "oculaire",
  auriculaire: "auriculaire",
  nasale: "nasale",
  inhalee: "inhalée",
};

export const LIBELLES_MOMENT_POSOLOGIE: Record<MomentPosologie, string> = {
  matin: "le matin",
  midi: "à midi",
  soir: "le soir",
  coucher: "au coucher",
};

export interface ChampsFrequence {
  frequenceMode: ModeFrequence;
  /** Obligatoire si frequenceMode === "fois_par_jour" (1 a 6, RG-PRE-01 du pack). */
  frequenceFoisParJour: number | null;
  /** Obligatoire si frequenceMode === "toutes_les_x_heures". */
  frequenceHeures: number | null;
  /** Obligatoire si frequenceMode === "si_besoin" : maximum de prises par 24 h. */
  frequenceMaxParJour: number | null;
}

export interface ChampsPosologie extends ChampsFrequence {
  dose: number;
  unite: UnitePosologie;
  voie: VoiePosologie;
  moments: MomentPosologie[];
  /** null = "traitement de fond" au sens du pack (non calculable, non stocke comme tel, voir l'en-tete). */
  dureeTraitementJours: number;
}

/**
 * Vrai si les champs propres au mode de frequence choisi ne sont pas tous
 * renseignes (verifie cote formulaire ET cote serveur, Zero Trust).
 */
export function frequenceIncomplete(champs: ChampsFrequence): boolean {
  if (champs.frequenceMode === "fois_par_jour") {
    return (
      champs.frequenceFoisParJour === null ||
      champs.frequenceFoisParJour < FOIS_PAR_JOUR_MIN ||
      champs.frequenceFoisParJour > FOIS_PAR_JOUR_MAX
    );
  }
  if (champs.frequenceMode === "toutes_les_x_heures") {
    return champs.frequenceHeures === null || champs.frequenceHeures <= 0;
  }
  return champs.frequenceMaxParJour === null || champs.frequenceMaxParJour <= 0;
}

/**
 * Nombre de prises par jour pour ce mode de frequence, pour le calcul de la
 * quantite suggeree. "toutes les X heures" arrondit au nombre entier de
 * prises qui tient dans 24 h (ex. toutes les 8 h = 3 prises, jamais 3,5).
 * null pour "si besoin" : aucune frequence fixe, donc aucune quantite
 * calculable (l'utilisateur saisit lui-meme, cote pack : "si besoin" n'a
 * justement pas de rythme regulier).
 */
export function prisesParJour(champs: ChampsFrequence): number | null {
  if (champs.frequenceMode === "fois_par_jour") {
    return champs.frequenceFoisParJour;
  }
  if (champs.frequenceMode === "toutes_les_x_heures" && champs.frequenceHeures) {
    return Math.max(1, Math.floor(24 / champs.frequenceHeures));
  }
  return null;
}

/**
 * Quantite totale suggeree (RG du pack : "Calculee = dose x prises par
 * jour x jours, modifiable, arrondie a l'unite superieure"). null quand la
 * frequence est "si besoin" (pas de rythme fixe, voir prisesParJour) : le
 * champ reste alors une saisie manuelle, jamais une valeur forcee.
 */
export function quantiteSuggeree(champs: ChampsPosologie): number | null {
  const prises = prisesParJour(champs);
  if (prises === null) return null;
  return Math.ceil(champs.dose * prises * champs.dureeTraitementJours);
}

function libelleFrequence(champs: ChampsFrequence): string {
  if (champs.frequenceMode === "fois_par_jour" && champs.frequenceFoisParJour !== null) {
    const n = champs.frequenceFoisParJour;
    return n === 1 ? "1 fois par jour" : `${n} fois par jour`;
  }
  if (champs.frequenceMode === "toutes_les_x_heures" && champs.frequenceHeures !== null) {
    return `toutes les ${champs.frequenceHeures} heures`;
  }
  if (champs.frequenceMode === "si_besoin" && champs.frequenceMaxParJour !== null) {
    return `si besoin (maximum ${champs.frequenceMaxParJour} par 24 h)`;
  }
  return "";
}

function libelleMoments(moments: MomentPosologie[]): string {
  if (moments.length === 0) return "";
  const libelles = MOMENTS_POSOLOGIE.filter((m) => moments.includes(m)).map((m) => LIBELLES_MOMENT_POSOLOGIE[m]);
  return `, ${libelles.join(", ")}`;
}

/**
 * Compose la chaine de posologie stockee (ex. "1 comprimé 3 fois par jour
 * pendant 7 jours, par voie orale, le matin et le soir") a partir des
 * champs structures. Suppose frequenceIncomplete deja verifie false par
 * l'appelant.
 */
export function composerPosologie(champs: ChampsPosologie): string {
  const doseEtUnite = `${champs.dose} ${LIBELLES_UNITE_POSOLOGIE[champs.unite](champs.dose)}`;
  const libelleVoie = LIBELLES_VOIE_POSOLOGIE[champs.voie];

  return (
    `${doseEtUnite} ${libelleFrequence(champs)} pendant ${champs.dureeTraitementJours} ` +
    `${champs.dureeTraitementJours > 1 ? "jours" : "jour"}, par voie ${libelleVoie}` +
    libelleMoments(champs.moments)
  );
}
