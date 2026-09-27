-- F-COM-03 du pack : signes de danger structures (RG-COM-10, donnee de
-- referentiel versionnee) et reference communautaire creee automatiquement
-- quand un signe de danger est coche pendant une visite.

-- AlterTable
ALTER TABLE "SuiviCommunautaire" ADD COLUMN "signesDangerCoches" TEXT NOT NULL DEFAULT '[]';

-- CreateTable
CREATE TABLE "SigneDangerCommunautaire" (
    "id" TEXT NOT NULL,
    "typeVisite" TEXT NOT NULL,
    "libelle" TEXT NOT NULL,
    "ordre" INTEGER NOT NULL DEFAULT 0,
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "dateCreation" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SigneDangerCommunautaire_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SigneDangerCommunautaire_typeVisite_idx" ON "SigneDangerCommunautaire"("typeVisite");

-- CreateTable
CREATE TABLE "ReferenceCommunautaire" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "etablissementId" TEXT NOT NULL,
    "personneId" TEXT,
    "beneficiaireNom" TEXT NOT NULL,
    "suiviId" TEXT NOT NULL,
    "motif" TEXT NOT NULL,
    "urgence" BOOLEAN NOT NULL DEFAULT true,
    "statut" TEXT NOT NULL DEFAULT 'en_attente',
    "dateVue" TIMESTAMP(3),
    "vueParId" TEXT,
    "dateCreation" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReferenceCommunautaire_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ReferenceCommunautaire_suiviId_key" ON "ReferenceCommunautaire"("suiviId");

-- CreateIndex
CREATE INDEX "ReferenceCommunautaire_etablissementId_statut_idx" ON "ReferenceCommunautaire"("etablissementId", "statut");

-- AddForeignKey
ALTER TABLE "ReferenceCommunautaire" ADD CONSTRAINT "ReferenceCommunautaire_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "ProfessionnelSante"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReferenceCommunautaire" ADD CONSTRAINT "ReferenceCommunautaire_etablissementId_fkey" FOREIGN KEY ("etablissementId") REFERENCES "EtablissementSanitaire"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReferenceCommunautaire" ADD CONSTRAINT "ReferenceCommunautaire_personneId_fkey" FOREIGN KEY ("personneId") REFERENCES "PersonneCommunautaire"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReferenceCommunautaire" ADD CONSTRAINT "ReferenceCommunautaire_suiviId_fkey" FOREIGN KEY ("suiviId") REFERENCES "SuiviCommunautaire"("id") ON DELETE CASCADE ON UPDATE CASCADE;
