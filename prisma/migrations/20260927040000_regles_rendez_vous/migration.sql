-- AlterTable
ALTER TABLE "RendezVous" ADD COLUMN     "motifRefus" TEXT,
ADD COLUMN     "nombreDeplacements" INTEGER NOT NULL DEFAULT 0;

-- RG-RDV-03 : un rendez-vous annule, refuse ou expire libere le creneau (avant :
-- seul "annule"). Index unique partiel, non exprimable dans schema.prisma.
DROP INDEX "RendezVous_professionnelId_date_actif_key";
CREATE UNIQUE INDEX "RendezVous_professionnelId_date_actif_key"
  ON "RendezVous" ("professionnelId", "date")
  WHERE "professionnelId" IS NOT NULL AND "statut" NOT IN ('annule', 'refuse', 'expire');
