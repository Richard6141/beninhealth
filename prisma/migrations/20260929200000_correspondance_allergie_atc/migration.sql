-- F-PRE-02 / RG-PRE-10 (section 18.4 du pack) : table de correspondance
-- allergie -> classe/prefixes ATC. Migration strictement additive : nouvelle
-- table seulement, aucune colonne modifiee ni supprimee sur une table
-- existante, aucune ligne existante touchee.

-- CreateTable
CREATE TABLE "CorrespondanceAllergieAtc" (
    "id" TEXT NOT NULL,
    "allergie" TEXT NOT NULL,
    "libelleClasse" TEXT NOT NULL,
    "prefixesAtc" TEXT NOT NULL,
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "dateCreation" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dateModification" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CorrespondanceAllergieAtc_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CorrespondanceAllergieAtc_allergie_key" ON "CorrespondanceAllergieAtc"("allergie");
