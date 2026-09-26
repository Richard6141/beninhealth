-- CreateTable
CREATE TABLE "SessionActive" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "appareil" TEXT NOT NULL,
    "navigateur" TEXT NOT NULL,
    "adresseIp" TEXT NOT NULL,
    "dateCreation" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "derniereActivite" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SessionActive_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SessionActive_userId_idx" ON "SessionActive"("userId");

-- AddForeignKey
ALTER TABLE "SessionActive" ADD CONSTRAINT "SessionActive_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
