-- CreateTable
CREATE TABLE "CodeReinitialisationMotDePasse" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "dateCreation" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expireLe" TIMESTAMP(3) NOT NULL,
    "consommeLe" TIMESTAMP(3),

    CONSTRAINT "CodeReinitialisationMotDePasse_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "CodeReinitialisationMotDePasse" ADD CONSTRAINT "CodeReinitialisationMotDePasse_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
