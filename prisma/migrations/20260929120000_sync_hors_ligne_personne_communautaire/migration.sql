-- F-COM-08 (RG-OFF-02) : champs de synchronisation hors ligne sur
-- PersonneCommunautaire. Migration strictement additive : toutes les
-- colonnes sont nullables, aucune ligne existante n'est modifiee ni
-- supprimee, aucune contrainte NOT NULL ajoutee.

-- AlterTable
ALTER TABLE "PersonneCommunautaire" ADD COLUMN "uuidAppareil" TEXT;
ALTER TABLE "PersonneCommunautaire" ADD COLUMN "statutRevue" TEXT;
ALTER TABLE "PersonneCommunautaire" ADD COLUMN "horodatageLocalSync" TIMESTAMP(3);
ALTER TABLE "PersonneCommunautaire" ADD COLUMN "dateReceptionSync" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "PersonneCommunautaire_uuidAppareil_key" ON "PersonneCommunautaire"("uuidAppareil");
