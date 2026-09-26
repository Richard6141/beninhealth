-- CreateTable
CREATE TABLE "Parametre" (
    "id" TEXT NOT NULL,
    "cle" TEXT NOT NULL,
    "valeur" DOUBLE PRECISION NOT NULL,
    "valeurDefaut" DOUBLE PRECISION NOT NULL,
    "borneMin" DOUBLE PRECISION NOT NULL,
    "borneMax" DOUBLE PRECISION NOT NULL,
    "description" TEXT NOT NULL,
    "dateModification" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Parametre_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FonctionnaliteActivable" (
    "id" TEXT NOT NULL,
    "cle" TEXT NOT NULL,
    "actif" BOOLEAN NOT NULL DEFAULT false,
    "description" TEXT NOT NULL,
    "dateModification" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FonctionnaliteActivable_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Parametre_cle_key" ON "Parametre"("cle");

-- CreateIndex
CREATE UNIQUE INDEX "FonctionnaliteActivable_cle_key" ON "FonctionnaliteActivable"("cle");
