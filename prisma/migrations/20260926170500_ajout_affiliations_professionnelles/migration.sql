-- AlterTable
ALTER TABLE "ProfessionnelSante" ADD COLUMN     "numeroOrdre" TEXT,
ADD COLUMN     "profession" TEXT;

-- CreateTable
CREATE TABLE "AffiliationProfessionnelle" (
    "id" TEXT NOT NULL,
    "professionnelId" TEXT NOT NULL,
    "etablissementId" TEXT NOT NULL,
    "roleNom" TEXT NOT NULL,
    "service" TEXT,
    "statut" TEXT NOT NULL DEFAULT 'active',
    "dateDebut" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dateFin" TIMESTAMP(3),
    "inviteParUserId" TEXT,

    CONSTRAINT "AffiliationProfessionnelle_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AffiliationProfessionnelle_professionnelId_statut_idx" ON "AffiliationProfessionnelle"("professionnelId", "statut");

-- CreateIndex
CREATE INDEX "AffiliationProfessionnelle_etablissementId_statut_idx" ON "AffiliationProfessionnelle"("etablissementId", "statut");

-- CreateIndex
CREATE UNIQUE INDEX "ProfessionnelSante_profession_numeroOrdre_key" ON "ProfessionnelSante"("profession", "numeroOrdre");

-- AddForeignKey
ALTER TABLE "AffiliationProfessionnelle" ADD CONSTRAINT "AffiliationProfessionnelle_professionnelId_fkey" FOREIGN KEY ("professionnelId") REFERENCES "ProfessionnelSante"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AffiliationProfessionnelle" ADD CONSTRAINT "AffiliationProfessionnelle_etablissementId_fkey" FOREIGN KEY ("etablissementId") REFERENCES "EtablissementSanitaire"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Profession : pour les profils existants, la profession clinique est le role.
UPDATE "ProfessionnelSante" p
SET "profession" = r."nom"
FROM "UserRole" r
WHERE r."userId" = p."userId"
  AND r."nom" IN ('medecin', 'infirmier', 'pharmacien', 'laboratoire', 'agent_communautaire');

-- Une affiliation active par profil existant et par role non patient, depuis
-- l'etablissement actuel du profil. Identifiant deterministe : rejouable sans doublon.
INSERT INTO "AffiliationProfessionnelle" ("id", "professionnelId", "etablissementId", "roleNom", "statut", "dateDebut")
SELECT 'aff_' || md5(p."id" || ':' || r."nom"), p."id", p."etablissementId", r."nom", 'active', CURRENT_TIMESTAMP
FROM "ProfessionnelSante" p
JOIN "UserRole" r ON r."userId" = p."userId"
WHERE r."nom" <> 'patient'
ON CONFLICT ("id") DO NOTHING;
