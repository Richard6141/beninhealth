/**
 * Referentiel simple du vaccin (F-CLI-11 du pack) et voies d'administration.
 * Module pur (pas de "use server", pas d'acces base), meme approche que
 * controles-doublons.ts : appelable cote serveur (seule autorite reelle,
 * voir actions.ts) et cote client (formulaire de saisie).
 */

export interface OptionReferentiel {
  value: string;
  label: string;
}

/** Vaccins courants du calendrier vaccinal, hors option "Autre" (texte libre). */
export const VACCINS_REFERENTIEL = [
  "BCG",
  "Polio",
  "Pentavalent",
  "Rougeole",
  "Fièvre jaune",
  "VAT",
  "COVID-19",
] as const;

/** Valeur speciale du selecteur de vaccin qui ouvre un champ de saisie libre. */
export const VALEUR_VACCIN_AUTRE = "Autre";

export const OPTIONS_VACCINS: OptionReferentiel[] = [
  ...VACCINS_REFERENTIEL.map((vaccin) => ({ value: vaccin, label: vaccin })),
  { value: VALEUR_VACCIN_AUTRE, label: VALEUR_VACCIN_AUTRE },
];

export const VOIES_ADMINISTRATION_VALEURS = [
  "intramusculaire",
  "sous_cutanee",
  "orale",
  "intradermique",
] as const;

export type VoieAdministration = (typeof VOIES_ADMINISTRATION_VALEURS)[number];

const LIBELLES_VOIES: Record<VoieAdministration, string> = {
  intramusculaire: "Intramusculaire",
  sous_cutanee: "Sous-cutanée",
  orale: "Orale",
  intradermique: "Intradermique",
};

export const OPTIONS_VOIES_ADMINISTRATION: OptionReferentiel[] = VOIES_ADMINISTRATION_VALEURS.map(
  (valeur) => ({ value: valeur, label: LIBELLES_VOIES[valeur] })
);

/** Libelle a afficher pour une voie stockee en base ; renvoie la valeur brute si inconnue. */
export function libelleVoie(valeur: string): string {
  return (LIBELLES_VOIES as Record<string, string>)[valeur] ?? valeur;
}

/** Longueur minimale du motif de retrait (RG-CLI-100 du pack). */
export const LONGUEUR_MIN_MOTIF_RETRAIT = 10;

/**
 * Lieu d'administration d'une vaccination (F-CLI-11 / F-COM-04 du pack) : en
 * etablissement, ou en campagne / strategie avancee (agent communautaire en
 * terrain, mais aussi un professionnel d'etablissement en sortie organisee).
 */
export const LIEUX_VACCINATION = ["etablissement", "campagne"] as const;
export type LieuVaccination = (typeof LIEUX_VACCINATION)[number];

const LIBELLES_LIEU_VACCINATION: Record<LieuVaccination, string> = {
  etablissement: "En établissement",
  campagne: "Campagne / stratégie avancée",
};

export const OPTIONS_LIEUX_VACCINATION: OptionReferentiel[] = LIEUX_VACCINATION.map((valeur) => ({
  value: valeur,
  label: LIBELLES_LIEU_VACCINATION[valeur],
}));

/** Duree exprimee en semaines ou en mois, utilisee pour un age minimum ou un intervalle minimum. */
export interface DureeCalendaire {
  valeur: number;
  unite: "semaines" | "mois";
}

/** Regles d'age minimum pour un vaccin du calendrier PEV (F-CLI-11, reste a faire #3 de docs/audit-cote-medecin.md). */
export interface ReglesAgeVaccin {
  /** Age minimum de l'enfant a la 1ere dose. */
  ageMinimumPremiereDose: DureeCalendaire;
  /** Intervalle minimum depuis la dose precedente du meme vaccin ; null si une seule dose existe habituellement. */
  intervalleMinimumEntreDoses: DureeCalendaire | null;
  /**
   * Age au-dela duquel la 1ere dose est inhabituelle et merite un
   * avertissement (pas un blocage dur, meme mecanisme que
   * ageMinimumPremiereDose ci-dessus). Absent = aucun age maximum connu.
   */
  ageMaximumRecommandePremiereDose?: DureeCalendaire;
}

/**
 * Ages/intervalles minimums standards, sourcés du tableau OMS "Table 3:
 * Recommendations for Interrupted or Delayed Routine Immunization - Summary
 * of WHO Position Papers" (who.int/docs/default-source/immunization/tables/
 * immunization-routine-table3.pdf), le referentiel PEV du Benin suivant ces
 * memes recommandations de l'OMS pour ces antigenes. Verifie contre la
 * source avant integration (pas de valeur inventee), voir aussi le
 * commentaire par vaccin ci-dessous.
 *
 * Vaccins volontairement absents de ce referentiel (aucune regle appliquee,
 * controlerAgeVaccination renvoie alors toujours conforme) : VAT (calendrier
 * fonde sur des intervalles entre contacts pour les femmes en age de
 * procreer, pas sur l'age depuis la naissance d'un enfant), COVID-19
 * (posologie specifique au produit, hors calendrier pediatrique PEV), et
 * "Autre" (texte libre, aucun referentiel possible).
 */
export const REGLES_AGE_VACCINS: Partial<Record<string, ReglesAgeVaccin>> = {
  // BCG : "As soon as possible after birth", 1 dose, pas de rappel standard.
  // Au-dela d'un an, la primo-vaccination sort de l'usage courant du
  // calendrier PEV (un test tuberculinique prealable est alors recommande
  // dans certains protocoles) : avertissement, jamais un blocage.
  BCG: {
    ageMinimumPremiereDose: { valeur: 0, unite: "semaines" },
    intervalleMinimumEntreDoses: null,
    ageMaximumRecommandePremiereDose: { valeur: 12, unite: "mois" },
  },
  // Polio (bOPV/IPV) : 1ere dose de la serie primaire a 6 semaines minimum,
  // puis 4 semaines minimum entre deux doses consecutives.
  Polio: {
    ageMinimumPremiereDose: { valeur: 6, unite: "semaines" },
    intervalleMinimumEntreDoses: { valeur: 4, unite: "semaines" },
  },
  // Pentavalent (DTC-HepB-Hib) : meme regle que Polio (co-administres en pratique).
  Pentavalent: {
    ageMinimumPremiereDose: { valeur: 6, unite: "semaines" },
    intervalleMinimumEntreDoses: { valeur: 4, unite: "semaines" },
  },
  // Rougeole : MCV1 a 9 mois (zone de transmission active, cas du Benin),
  // intervalle minimum de 4 semaines avant MCV2.
  Rougeole: {
    ageMinimumPremiereDose: { valeur: 9, unite: "mois" },
    intervalleMinimumEntreDoses: { valeur: 4, unite: "semaines" },
  },
  // Fievre jaune : dose unique a 9-12 mois, jamais de rappel standard.
  "Fièvre jaune": {
    ageMinimumPremiereDose: { valeur: 9, unite: "mois" },
    intervalleMinimumEntreDoses: null,
  },
};

/** Ajoute une duree calendaire (semaines ou mois) a une date, sans muter l'original. */
function ajouterDuree(date: Date, duree: DureeCalendaire): Date {
  const resultat = new Date(date);
  if (duree.unite === "mois") {
    resultat.setMonth(resultat.getMonth() + duree.valeur);
  } else {
    resultat.setDate(resultat.getDate() + duree.valeur * 7);
  }
  return resultat;
}

function libelleDuree(duree: DureeCalendaire): string {
  const unite = duree.valeur > 1 ? duree.unite : duree.unite.replace(/s$/, "");
  return `${duree.valeur} ${unite}`;
}

export interface ResultatControleAgeVaccination {
  conforme: boolean;
  message: string | null;
}

/**
 * Verifie l'age minimum a la vaccination et l'intervalle minimum depuis la
 * derniere dose du meme vaccin pour ce patient (F-CLI-11). Fonction pure :
 * ne consulte jamais la base elle-meme (voir enregistrerVaccinationAction
 * dans actions.ts pour la recuperation de dateDernierDoseMemeVaccin).
 * Renvoie toujours conforme pour un vaccin absent de REGLES_AGE_VACCINS
 * (VAT, COVID-19, "Autre" : voir le commentaire sur cette constante).
 */
export function controlerAgeVaccination(params: {
  vaccin: string;
  numeroDose: number;
  dateNaissance: Date;
  dateAdministration: Date;
  /** Date de la dose numeroDose - 1 du meme vaccin pour ce patient, null si absente ou non applicable. */
  dateDerniereDoseMemeVaccin: Date | null;
}): ResultatControleAgeVaccination {
  const regles = REGLES_AGE_VACCINS[params.vaccin];

  if (!regles) {
    return { conforme: true, message: null };
  }

  if (params.numeroDose === 1) {
    const ageMinimumAtteintLe = ajouterDuree(params.dateNaissance, regles.ageMinimumPremiereDose);

    if (params.dateAdministration < ageMinimumAtteintLe) {
      return {
        conforme: false,
        message: `L'âge minimum habituel pour la 1ère dose du vaccin ${params.vaccin} est de ${libelleDuree(regles.ageMinimumPremiereDose)} : l'enfant est plus jeune que cela à la date choisie.`,
      };
    }

    if (regles.ageMaximumRecommandePremiereDose) {
      const ageMaximumDepasseLe = ajouterDuree(params.dateNaissance, regles.ageMaximumRecommandePremiereDose);

      if (params.dateAdministration >= ageMaximumDepasseLe) {
        return {
          conforme: false,
          message: `La 1ère dose du vaccin ${params.vaccin} est habituellement donnée avant ${libelleDuree(regles.ageMaximumRecommandePremiereDose)} : l'enfant est plus âgé que cela à la date choisie.`,
        };
      }
    }

    return { conforme: true, message: null };
  }

  if (regles.intervalleMinimumEntreDoses && params.dateDerniereDoseMemeVaccin) {
    const intervalleAtteintLe = ajouterDuree(
      params.dateDerniereDoseMemeVaccin,
      regles.intervalleMinimumEntreDoses
    );

    if (params.dateAdministration < intervalleAtteintLe) {
      return {
        conforme: false,
        message: `L'intervalle minimum habituel entre deux doses du vaccin ${params.vaccin} est de ${libelleDuree(regles.intervalleMinimumEntreDoses)} : la dose précédente est trop récente par rapport à la date choisie.`,
      };
    }
  }

  return { conforme: true, message: null };
}
