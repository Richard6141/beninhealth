-- F-CIT-10 (RG-ACC-11, RG-ACC-13, CA-2) : niveaux d'acces SUMMARY/FULL/FULL_SENSITIVE
-- sur Consentement, independants du typeAcces existant (portee par module).
-- Migration strictement additive : nouvelle colonne avec valeur par defaut,
-- aucune colonne supprimee ni type change.

ALTER TABLE "public"."Consentement"
  ADD COLUMN "niveauAcces" TEXT NOT NULL DEFAULT 'FULL';

-- Reclassement des lignes existantes : avant ce correctif, un consentement
-- "dossier_complet" ouvrait deja les elements sensibles partout ou ce depot
-- verifie ce champ (voir src/modules/document/acces-documents.ts et
-- src/modules/clinical/actions.ts) : c'etait de fait l'equivalent du niveau
-- FULL_SENSITIVE du pack. On le rend explicite plutot que de changer
-- silencieusement le comportement des consentements deja accordes.
UPDATE "public"."Consentement"
  SET "niveauAcces" = 'FULL_SENSITIVE'
  WHERE "typeAcces" = 'dossier_complet';
