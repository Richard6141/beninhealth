-- CreateTable
CREATE TABLE "PreferenceNotification" (
    "id" TEXT NOT NULL,
    "utilisateurId" TEXT NOT NULL,
    "categorie" TEXT NOT NULL,
    "sms" BOOLEAN NOT NULL DEFAULT false,
    "email" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "PreferenceNotification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PreferenceNotification_utilisateurId_categorie_key" ON "PreferenceNotification"("utilisateurId", "categorie");

-- AddForeignKey
ALTER TABLE "PreferenceNotification" ADD CONSTRAINT "PreferenceNotification_utilisateurId_fkey" FOREIGN KEY ("utilisateurId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

