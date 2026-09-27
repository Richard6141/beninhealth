-- F-CIT-04 : historique versionne des informations declarees par le patient
-- (allergies, antecedents, maladies chroniques, contacts d'urgence).

-- CreateTable
CREATE TABLE "InformationDeclaree" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "categorie" TEXT NOT NULL,
    "valeur" TEXT NOT NULL,
    "statut" TEXT NOT NULL DEFAULT 'declare',
    "confirmeParId" TEXT,
    "dateConfirmation" TIMESTAMP(3),
    "dateRetrait" TIMESTAMP(3),
    "motifRetrait" TEXT,
    "dateCreation" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InformationDeclaree_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InformationDeclaree_patientId_categorie_idx" ON "InformationDeclaree"("patientId", "categorie");

-- AddForeignKey
ALTER TABLE "InformationDeclaree" ADD CONSTRAINT "InformationDeclaree_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;
