import type { BadgeTone } from "@/components/ui/Badge";
import type { PrescriptionResume } from "@/modules/prescription/actions";

/**
 * Duree de traitement d'une prescription : le maximum des durees de chacune
 * de ses lignes, en jours (0 si la prescription n'a aucune ligne).
 */
export function calculerDureeMaxJours(
  prescription: Pick<PrescriptionResume, "lignes">
): number {
  return prescription.lignes.reduce(
    (max, ligne) => Math.max(max, ligne.dureeTraitementJours),
    0
  );
}

/**
 * Une prescription est "en cours" si son statut est "validee" et si sa
 * fenetre de traitement (date de la prescription + duree maximale de ses
 * lignes, en jours) n'est pas encore depassee. Regle unique, partagee entre
 * le tableau de bord et l'historique complet, pour rester cohérente partout.
 */
export function estPrescriptionEnCours(prescription: PrescriptionResume): boolean {
  if (prescription.statut !== "validee") return false;
  const dureeMaxJours = calculerDureeMaxJours(prescription);
  const dateFin = new Date(prescription.date);
  dateFin.setDate(dateFin.getDate() + dureeMaxJours);
  return dateFin.getTime() >= Date.now();
}

/**
 * Libelle et ton de badge pour le statut affiche d'une prescription :
 * "En cours" (bon) si validee et dans sa fenetre de traitement, "Terminee"
 * (neutre) si validee mais hors fenetre, "Délivrée en partie"/"Délivrée"
 * pour le cycle de vie de la delivrance en pharmacie (F-PHA-03 / CA-2),
 * sinon le statut brut (par exemple une prescription annulee).
 */
export function statutPrescriptionAffichage(
  prescription: PrescriptionResume
): { texte: string; tone: BadgeTone } {
  if (prescription.statut === "validee") {
    return estPrescriptionEnCours(prescription)
      ? { texte: "En cours", tone: "good" }
      : { texte: "Terminée", tone: "neutral" };
  }
  if (prescription.statut === "delivree_partiellement") {
    return { texte: "Délivrée en partie", tone: "warning" };
  }
  if (prescription.statut === "delivree") {
    return { texte: "Délivrée", tone: "good" };
  }
  if (prescription.statut === "annulee") {
    return { texte: "Annulée", tone: "critical" };
  }
  return { texte: prescription.statut, tone: "neutral" };
}
