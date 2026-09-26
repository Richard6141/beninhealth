/**
 * Regles pures de l'acces au dossier par NPI ou telephone avec code de
 * confirmation (voir docs/conception-transfert-dossier.md). Aucun acces base
 * de donnees ni reseau ici : tout est testable sans mock.
 */

import { createHmac, randomInt } from "node:crypto";

export const LONGUEUR_CODE = 6;
export const DUREE_VALIDITE_CODE_MINUTES = 10;
export const TENTATIVES_MAX_PAR_CODE = 3;
export const RENVOIS_MAX_PAR_DEMANDE = 2;

// Anti-balayage : un professionnel ne peut pas deviner des NPI a la chaine.
export const DEMANDES_MAX_PAR_PROFESSIONNEL_PAR_HEURE = 20;
export const SANS_CORRESPONDANCE_MAX_PAR_PROFESSIONNEL_PAR_HEURE = 10;
export const ECHECS_MAX_PAR_PROFESSIONNEL_PAR_HEURE = 10;
// Anti-harcelement : un patient ne recoit pas plus de N codes par jour, quel que
// soit le demandeur, et un meme demandeur ne peut pas en consommer plus que
// DEMANDES_MAX_PAR_COUPLE (sinon lui seul epuiserait la limite du patient).
export const CODES_MAX_PAR_PATIENT_PAR_24H = 5;
export const DEMANDES_MAX_PAR_COUPLE_PAR_24H = 3;

export const DUREES_ACCES_HEURES = [24, 72, 168] as const;
export type DureeAccesHeures = (typeof DUREES_ACCES_HEURES)[number];
export const DUREE_ACCES_PAR_DEFAUT_HEURES: DureeAccesHeures = 24;

export const MOTIFS_ACCES = {
  consultation: "une consultation",
  avis_specialise: "un avis spécialisé",
  suite_de_soins: "une suite de soins",
  hospitalisation: "une hospitalisation",
} as const;
export type MotifAcces = keyof typeof MOTIFS_ACCES;

export const MODES_RECHERCHE = ["npi", "telephone"] as const;
export type ModeRecherche = (typeof MODES_RECHERCHE)[number];

export function estMotifAcces(valeur: string): valeur is MotifAcces {
  return Object.hasOwn(MOTIFS_ACCES, valeur);
}

export function estDureeAcces(valeur: number): valeur is DureeAccesHeures {
  return (DUREES_ACCES_HEURES as readonly number[]).includes(valeur);
}

/** Code numerique a 6 chiffres : se dicte facilement, quel que soit le niveau de lecture. */
export function genererCodeNumerique(): string {
  return randomInt(0, 10 ** LONGUEUR_CODE)
    .toString()
    .padStart(LONGUEUR_CODE, "0");
}

/** Ne garde que les chiffres : le patient peut dicter "482 913" ou "482-913". */
export function normaliserCodeSaisi(saisie: string): string {
  return saisie.replace(/\D/g, "");
}

export function codeSaisiAuBonFormat(code: string): boolean {
  return new RegExp(`^\\d{${LONGUEUR_CODE}}$`).test(code);
}

export const LONGUEUR_NPI = 13;

/**
 * Le NPI compte 13 chiffres (source tierce, non confirmee par l'ANIP, voir
 * docs/recherche-transfert/realite-benin.md) : seule la longueur est controlee,
 * aucune cle de controle n'est supposee. La recherche reste une egalite exacte.
 */
export function normaliserNpi(saisie: string): string | null {
  const nettoye = saisie.replace(/[\s.-]/g, "");
  return new RegExp(`^\\d{${LONGUEUR_NPI}}$`).test(nettoye) ? nettoye : null;
}

/**
 * Empreinte non reversible du critere saisi (RG-CLI-11 : jamais le telephone
 * ni le NPI en clair dans les traces). Cle de calcul propre au serveur : sans
 * elle, l'espace des numeros de telephone est trop petit pour resister a une
 * simple table de correspondance.
 */
export function empreinteCritere(mode: ModeRecherche, valeurNormalisee: string, secret: string): string {
  return createHmac("sha256", secret).update(`${mode}:${valeurNormalisee}`).digest("hex");
}

export function libelleDuree(heures: number): string {
  if (heures % 24 === 0) {
    const jours = heures / 24;
    return jours === 1 ? "24 heures" : `${jours} jours`;
  }
  return `${heures} heures`;
}

export interface ParametresMessageCode {
  code: string;
  titreProfessionnel: string;
  nomProfessionnel: string;
  etablissementNom: string;
  motif: MotifAcces;
  dureeAccesHeures: number;
  /** Vrai si le destinataire a un espace patient : il peut alors repondre sans donner le code. */
  confirmationEnLigne?: boolean;
}

/**
 * Texte envoye au patient. Il dit qui demande, pour quoi et combien de temps :
 * le patient consent en connaissance de cause, et un code recu pour une
 * demande qu'il ne reconnait pas est immediatement identifiable comme tel.
 * Aucune donnee de sante dans le message.
 */
export function composerMessageCode(p: ParametresMessageCode): string {
  const demandeur = `${p.titreProfessionnel} ${p.nomProfessionnel}`.trim();

  return [
    `BHIP Santé : ${demandeur} (${p.etablissementNom}) demande l'accès à votre dossier médical pour ${libelleDuree(p.dureeAccesHeures)}, pour ${MOTIFS_ACCES[p.motif]}.`,
    "",
    `Si vous êtes bien en consultation avec cette personne, donnez-lui ce code : ${p.code}`,
    ...(p.confirmationEnLigne
      ? ["", "Vous pouvez aussi répondre à cette demande dans votre espace patient BHIP (Notifications), sans donner le code."]
      : []),
    "",
    `Ce code expire dans ${DUREE_VALIDITE_CODE_MINUTES} minutes. Si vous ne reconnaissez pas cette demande, ne donnez ce code à personne et ignorez ce message. Vous pouvez retirer cet accès à tout moment depuis votre espace patient.`,
  ].join("\n");
}
