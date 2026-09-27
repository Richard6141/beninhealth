import { choisirFournisseur, type FournisseurIa } from "./provider";

/**
 * Fournisseur d'IA effectivement utilise, choisi par la variable IA_FOURNISSEUR
 * (chapitre 16.2). Sans valeur, le fournisseur par regles locales est utilise :
 * il calcule tout sur le serveur, n'appelle aucun service externe et n'envoie
 * aucune donnee de sante hors du poste. L'usage lui-meme reste gouverne par la
 * fonctionnalite activable ai.summary (desactivee par defaut, RG-IA-02).
 * Toute valeur inconnue, ou "desactive", coupe l'IA (echec ferme).
 *
 * Aucun fournisseur externe n'existe dans ce depot (RG-IA-03) : en ajouter un
 * exige l'autorisation de l'APDP, un contrat de sous-traitance et le rejeu du
 * jeu d'evaluation (RG-IA-20).
 */
export function nomFournisseurConfigure(): string {
  return process.env.IA_FOURNISSEUR?.trim() || "regles_locales";
}

export function fournisseurConfigure(): FournisseurIa {
  return choisirFournisseur(nomFournisseurConfigure());
}
