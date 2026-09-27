-- F-AUTH-06 (RG-AUTH-51) : codes de secours de la double authentification.
-- CreateTable
CREATE TABLE "CodeSecoursMfa" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "empreinte" TEXT NOT NULL,
    "utiliseLe" TIMESTAMP(3),
    "creeLe" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CodeSecoursMfa_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CodeSecoursMfa_userId_empreinte_idx" ON "CodeSecoursMfa"("userId", "empreinte");

-- AddForeignKey
ALTER TABLE "CodeSecoursMfa" ADD CONSTRAINT "CodeSecoursMfa_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
