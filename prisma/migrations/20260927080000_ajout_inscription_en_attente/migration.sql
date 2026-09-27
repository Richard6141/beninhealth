-- F-AUTH-01 (RG-AUTH-03, RG-AUTH-04, RG-AUTH-07) : inscription en attente de verification, et preuve
-- d'acceptation des conditions d'utilisation (version et date).
-- AlterTable
ALTER TABLE "User" ADD COLUMN     "conditionsAccepteesLe" TIMESTAMP(3),
ADD COLUMN     "conditionsVersion" TEXT;

-- CreateTable
CREATE TABLE "InscriptionEnAttente" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "telephone" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "prenom" TEXT NOT NULL,
    "dateNaissance" TIMESTAMP(3) NOT NULL,
    "sexe" TEXT NOT NULL,
    "motDePasseHash" TEXT NOT NULL,
    "conditionsVersion" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "essais" INTEGER NOT NULL DEFAULT 0,
    "envois" INTEGER NOT NULL DEFAULT 1,
    "dernierEnvoiLe" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dateCreation" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expireLe" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InscriptionEnAttente_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InscriptionEnAttente_email_idx" ON "InscriptionEnAttente"("email");

-- CreateIndex
CREATE INDEX "InscriptionEnAttente_expireLe_idx" ON "InscriptionEnAttente"("expireLe");
