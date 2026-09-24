import type { TypeEtablissement } from "@/types";
import type { BadgeTone } from "@/components/ui/Badge";

/**
 * Libelles courts des mois en francais, sans accent, alignes sur l'index
 * (0 = janvier) tire du format "AAAA-MM" renvoye par le module analytics.
 */
const MOIS_COURTS = [
  "Janv",
  "Fevr",
  "Mars",
  "Avr",
  "Mai",
  "Juin",
  "Juil",
  "Aout",
  "Sept",
  "Oct",
  "Nov",
  "Dec",
];

/**
 * Convertit "AAAA-MM" en libelle mois court seul (ex : "2026-09" -> "Sept"),
 * utilise pour l'axe du graphique en barres.
 */
export function formaterMoisCourt(moisAnnee: string): string {
  const [, mois] = moisAnnee.split("-");
  const index = Number(mois) - 1;
  return MOIS_COURTS[index] ?? moisAnnee;
}

/**
 * Convertit "AAAA-MM" en libelle mois complet avec annee (ex : "2026-09" ->
 * "Sept 2026"), utilise pour les infobulles et le tableau accessible.
 */
export function formaterMoisComplet(moisAnnee: string): string {
  const [annee, mois] = moisAnnee.split("-");
  const index = Number(mois) - 1;
  const libelleMois = MOIS_COURTS[index] ?? mois;
  return `${libelleMois} ${annee}`;
}

/** Options du selecteur de type d'etablissement (formulaire de creation). */
export const OPTIONS_TYPE_ETABLISSEMENT: { value: TypeEtablissement; label: string }[] = [
  { value: "centre_sante", label: "Centre de sante" },
  { value: "hopital", label: "Hopital" },
  { value: "laboratoire", label: "Laboratoire" },
  { value: "pharmacie", label: "Pharmacie" },
];

const LIBELLES_TYPE_ETABLISSEMENT: Record<string, string> = {
  centre_sante: "Centre de sante",
  hopital: "Hopital",
  laboratoire: "Laboratoire",
  pharmacie: "Pharmacie",
};

/**
 * Libelle lisible d'un type d'etablissement. Repli sur la valeur brute si
 * elle n'est pas reconnue : aucune donnee masquee ou inventee.
 */
export function libelleTypeEtablissement(type: string): string {
  return LIBELLES_TYPE_ETABLISSEMENT[type] ?? type;
}

const LIBELLES_STATUT_RENDEZ_VOUS: Record<string, { texte: string; tone: BadgeTone }> = {
  demande: { texte: "Demande", tone: "info" },
  confirme: { texte: "Confirme", tone: "good" },
  termine: { texte: "Termine", tone: "neutral" },
  annule: { texte: "Annule", tone: "critical" },
};

/**
 * Libelle et tonalite d'un statut de rendez-vous. Repli neutre avec la
 * valeur brute capitalisee si le statut n'est pas parmi ceux connus (voir
 * STATUTS_RENDEZ_VOUS dans src/modules/analytics/actions.ts).
 */
export function libelleStatutRendezVous(statut: string): { texte: string; tone: BadgeTone } {
  const connu = LIBELLES_STATUT_RENDEZ_VOUS[statut];
  if (connu) return connu;
  return {
    texte: statut.length > 0 ? statut.charAt(0).toUpperCase() + statut.slice(1) : statut,
    tone: "neutral",
  };
}
