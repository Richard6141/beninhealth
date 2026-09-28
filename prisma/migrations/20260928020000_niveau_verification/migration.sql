-- F-AUTH-03 : niveau de verification d'identite (chapitre 5.6 du pack),
-- N0 par defaut, passe a N1 lors d'une reclamation de dossier reussie.

-- AlterTable
ALTER TABLE "User" ADD COLUMN "niveauVerification" TEXT NOT NULL DEFAULT 'N0';
