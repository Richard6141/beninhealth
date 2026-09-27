-- F-AUTH-02 : appareil partage (RG-AUTH-12) et appareils connus (alerte de nouvelle connexion).
-- AlterTable
ALTER TABLE "SessionActive" ADD COLUMN     "appareilPartage" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "AppareilConnu" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "empreinte" TEXT NOT NULL,
    "appareil" TEXT NOT NULL,
    "navigateur" TEXT NOT NULL,
    "premiereFoisLe" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "derniereFoisLe" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AppareilConnu_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AppareilConnu_userId_empreinte_key" ON "AppareilConnu"("userId", "empreinte");

-- AddForeignKey
ALTER TABLE "AppareilConnu" ADD CONSTRAINT "AppareilConnu_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
