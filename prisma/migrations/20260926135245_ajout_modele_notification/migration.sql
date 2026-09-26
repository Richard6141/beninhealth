-- CreateTable
CREATE TABLE "ModeleNotification" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "declencheur" TEXT NOT NULL,
    "destinataire" TEXT NOT NULL,
    "canaux" TEXT NOT NULL,
    "texteModele" TEXT NOT NULL DEFAULT '',
    "ordre" INTEGER NOT NULL DEFAULT 0,
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "dateCreation" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dateModification" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ModeleNotification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ModeleNotification_code_key" ON "ModeleNotification"("code");
