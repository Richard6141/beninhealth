/**
 * Regle d'acces a un document medical selon son niveau de confidentialite
 * (F-CLI-13 du pack). Module SANS "use server" : partage entre la liste des
 * documents (actions.ts) et la route de telechargement (api/documents/[id]).
 *
 * - Document "normal" : l'auteur, le patient proprietaire, ou un professionnel
 *   titulaire d'un consentement actif "dossier_complet" ou "documents".
 * - Document "sensible" : l'auteur, le patient proprietaire, ou un
 *   professionnel titulaire d'un consentement actif "dossier_complet" ET du
 *   niveau d'acces "FULL_SENSITIVE" (F-CIT-10, RG-ACC-11/13). Un consentement
 *   limite aux documents, ou un "dossier_complet" de niveau SUMMARY/FULL,
 *   ouvre les documents ordinaires, jamais ceux que l'auteur a marques
 *   sensibles.
 *
 * L'auteur et le patient proprietaire n'ont pas besoin de consentement et ne
 * passent donc pas par cette fonction.
 */

export const TYPES_ACCES_DOCUMENT = ["dossier_complet", "documents"] as const;

export interface ConsentementDocument {
  statut: string;
  typeAcces: string;
  // Absent sur d'anciens appels de test non mis a jour : traite comme
  // "FULL_SENSITIVE" par defaut, comportement d'origine de ce module avant
  // l'ajout des niveaux (voir migration 20260928030000_niveau_acces_consentement,
  // qui reclasse deja toutes les lignes "dossier_complet" existantes ainsi).
  niveauAcces?: string | null;
  dateFin: Date | null;
}

export function consentementPermetLeDocument(
  consentement: ConsentementDocument | null,
  niveauConfidentialite: string,
  maintenant: Date = new Date()
): boolean {
  if (consentement === null || consentement.statut !== "actif") {
    return false;
  }

  if (consentement.dateFin !== null && consentement.dateFin <= maintenant) {
    return false;
  }

  if (niveauConfidentialite === "sensible") {
    const niveauAcces = consentement.niveauAcces ?? "FULL_SENSITIVE";
    return consentement.typeAcces === "dossier_complet" && niveauAcces === "FULL_SENSITIVE";
  }

  return (TYPES_ACCES_DOCUMENT as readonly string[]).includes(consentement.typeAcces);
}
