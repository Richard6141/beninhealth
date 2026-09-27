-- F-COM-04 : vaccination administree en campagne / strategie avancee par un agent
-- communautaire, sur une fiche PersonneCommunautaire (jamais un dossier Patient,
-- agent_communautaire n'a aucune permission read:patient). "lieu" et "nomCampagne"
-- s'appliquent aussi aux vaccinations en etablissement (F-CLI-11).

-- AlterTable
ALTER TABLE "Vaccination" ALTER COLUMN "patientId" DROP NOT NULL;
ALTER TABLE "Vaccination" ADD COLUMN     "personneCommunautaireId" TEXT,
ADD COLUMN     "lieu" TEXT NOT NULL DEFAULT 'etablissement',
ADD COLUMN     "nomCampagne" TEXT;

-- CreateIndex
CREATE INDEX "Vaccination_personneCommunautaireId_idx" ON "Vaccination"("personneCommunautaireId");

-- AddForeignKey
ALTER TABLE "Vaccination" ADD CONSTRAINT "Vaccination_personneCommunautaireId_fkey" FOREIGN KEY ("personneCommunautaireId") REFERENCES "PersonneCommunautaire"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Integrite : exactement une des deux cibles (patient ou personne communautaire),
-- jamais les deux, jamais aucune.
ALTER TABLE "Vaccination" ADD CONSTRAINT "Vaccination_patient_ou_personne_check"
  CHECK ((("patientId" IS NOT NULL)::int + ("personneCommunautaireId" IS NOT NULL)::int) = 1);
