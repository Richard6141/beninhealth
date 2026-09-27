-- CreateTable
CREATE TABLE "JetonCarteSante" (
    "id" TEXT NOT NULL,
    "jetonHash" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "expireLe" TIMESTAMP(3) NOT NULL,
    "consommeLe" TIMESTAMP(3),
    "dateCreation" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JetonCarteSante_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReferentielSimple" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "libelle" TEXT NOT NULL,
    "ordre" INTEGER NOT NULL DEFAULT 0,
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "dateCreation" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dateModification" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReferentielSimple_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DiagnosticCim10" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "libelle" TEXT NOT NULL,
    "chapitre" TEXT NOT NULL DEFAULT '',
    "groupeMaladie" TEXT NOT NULL DEFAULT '',
    "sensible" BOOLEAN NOT NULL DEFAULT false,
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "dateCreation" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dateModification" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DiagnosticCim10_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "JetonCarteSante_jetonHash_key" ON "JetonCarteSante"("jetonHash");

-- CreateIndex
CREATE INDEX "JetonCarteSante_patientId_idx" ON "JetonCarteSante"("patientId");

-- CreateIndex
CREATE UNIQUE INDEX "ReferentielSimple_type_code_key" ON "ReferentielSimple"("type", "code");

-- CreateIndex
CREATE UNIQUE INDEX "DiagnosticCim10_code_key" ON "DiagnosticCim10"("code");

-- CreateIndex
CREATE INDEX "DiagnosticCim10_groupeMaladie_idx" ON "DiagnosticCim10"("groupeMaladie");

-- AddForeignKey
ALTER TABLE "JetonCarteSante" ADD CONSTRAINT "JetonCarteSante_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;
