-- CreateTable
CREATE TABLE "EnvoiSms" (
    "id" TEXT NOT NULL,
    "destinataire" TEXT NOT NULL,
    "texte" TEXT NOT NULL,
    "categorie" TEXT NOT NULL,
    "statut" TEXT NOT NULL DEFAULT 'simule',
    "dateProgrammee" TIMESTAMP(3),
    "modele" TEXT,
    "cout" DOUBLE PRECISION,
    "dateEnvoi" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EnvoiSms_pkey" PRIMARY KEY ("id")
);

