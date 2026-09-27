/**
 * Regle d'acces a un document medical selon son niveau de confidentialite
 * (F-CLI-13 du pack). Module SANS "use server" : partage entre la liste des
 * documents (actions.ts) et la route de telechargement (api/documents/[id]).
 *
 * - Document "normal" : l'auteur, le patient proprietaire, ou un professionnel
 *   titulaire d'un consentement actif "dossier_complet" ou "documents".
 * - Document "sensible" : l'auteur, le patient proprietaire, ou un
 *   professionnel titulaire d'un consentement actif "dossier_complet" SEUL.
 *   Un consentement limite aux documents ouvre les documents ordinaires,
 *   jamais ceux que l'auteur a marques sensibles (equivalent du niveau
 *   FULL_SENSITIVE du pack).
 *
 * L'auteur et le patient proprietaire n'ont pas besoin de consentement et ne
 * passent donc pas par cette fonction.
 */

export const TYPES_ACCES_DOCUMENT = ["dossier_complet", "documents"] as const;

export interface ConsentementDocument {
  statut: string;
  typeAcces: string;
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
    return consentement.typeAcces === "dossier_complet";
  }

  return (TYPES_ACCES_DOCUMENT as readonly string[]).includes(consentement.typeAcces);
}
