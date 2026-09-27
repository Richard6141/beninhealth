-- F-AUTH-05 (RG-AUTH-40) : invitation a activer un compte, jeton hache, 7 jours, usage unique.
-- CreateTable
CREATE TABLE "InvitationCompte" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "jetonHash" TEXT NOT NULL,
    "creeParId" TEXT,
    "expireLe" TIMESTAMP(3) NOT NULL,
    "utiliseLe" TIMESTAMP(3),
    "annuleeLe" TIMESTAMP(3),
    "dateCreation" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InvitationCompte_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "InvitationCompte_jetonHash_key" ON "InvitationCompte"("jetonHash");

-- CreateIndex
CREATE INDEX "InvitationCompte_userId_idx" ON "InvitationCompte"("userId");

-- AddForeignKey
ALTER TABLE "InvitationCompte" ADD CONSTRAINT "InvitationCompte_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
