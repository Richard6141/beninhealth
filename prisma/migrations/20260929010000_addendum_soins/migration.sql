-- F-CLI-12 du pack : addendum a une prise en charge infirmiere (note de
-- soins), meme patron que AddendumConsultation (F-CLI-08). Migration
-- purement additive : nouvelle table, aucune colonne existante touchee.

-- CreateTable
CREATE TABLE "AddendumSoins" (
    "id" TEXT NOT NULL,
    "priseEnChargeInfirmiereId" TEXT NOT NULL,
    "auteurId" TEXT NOT NULL,
    "motif" TEXT NOT NULL,
    "contenu" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AddendumSoins_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "AddendumSoins" ADD CONSTRAINT "AddendumSoins_priseEnChargeInfirmiereId_fkey" FOREIGN KEY ("priseEnChargeInfirmiereId") REFERENCES "PriseEnChargeInfirmiere"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AddendumSoins" ADD CONSTRAINT "AddendumSoins_auteurId_fkey" FOREIGN KEY ("auteurId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
