-- CreateTable
CREATE TABLE "TraitementDemandePersonne" (
    "id" TEXT NOT NULL,
    "journalAuditId" TEXT NOT NULL,
    "traiteParId" TEXT NOT NULL,
    "reponse" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TraitementDemandePersonne_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TraitementDemandePersonne_journalAuditId_key" ON "TraitementDemandePersonne"("journalAuditId");

-- AddForeignKey
ALTER TABLE "TraitementDemandePersonne" ADD CONSTRAINT "TraitementDemandePersonne_journalAuditId_fkey" FOREIGN KEY ("journalAuditId") REFERENCES "JournalAudit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TraitementDemandePersonne" ADD CONSTRAINT "TraitementDemandePersonne_traiteParId_fkey" FOREIGN KEY ("traiteParId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
