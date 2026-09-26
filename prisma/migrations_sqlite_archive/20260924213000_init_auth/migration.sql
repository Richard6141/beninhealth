-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "nom" TEXT NOT NULL,
    "prenom" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "telephone" TEXT NOT NULL,
    "motDePasseHash" TEXT NOT NULL,
    "statut" TEXT NOT NULL DEFAULT 'actif',
    "dateCreation" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "derniereConnexion" DATETIME
);

-- CreateTable
CREATE TABLE "UserRole" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    CONSTRAINT "UserRole_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "EtablissementSanitaire" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "nom" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "localisation" TEXT NOT NULL,
    "latitude" REAL NOT NULL,
    "longitude" REAL NOT NULL,
    "servicesDisponibles" TEXT NOT NULL DEFAULT '[]',
    "capacite" INTEGER NOT NULL
);

-- CreateTable
CREATE TABLE "ProfessionnelSante" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "specialite" TEXT NOT NULL,
    "numeroProfessionnel" TEXT NOT NULL,
    "etablissementId" TEXT NOT NULL,
    "statutValidation" TEXT NOT NULL DEFAULT 'en_attente',
    CONSTRAINT "ProfessionnelSante_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ProfessionnelSante_etablissementId_fkey" FOREIGN KEY ("etablissementId") REFERENCES "EtablissementSanitaire" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Patient" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "identifiantSante" TEXT NOT NULL,
    "referenceIdentiteNationale" TEXT,
    "dateNaissance" DATETIME NOT NULL,
    "sexe" TEXT NOT NULL,
    "groupeSanguin" TEXT NOT NULL DEFAULT 'inconnu',
    "contactsUrgence" TEXT NOT NULL DEFAULT '[]',
    CONSTRAINT "Patient_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "JournalAudit" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "utilisateurId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "donneeConcernee" TEXT NOT NULL,
    "date" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "adresseTechnique" TEXT NOT NULL,
    "justification" TEXT NOT NULL,
    CONSTRAINT "JournalAudit_utilisateurId_fkey" FOREIGN KEY ("utilisateurId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "UserRole_userId_nom_key" ON "UserRole"("userId", "nom");

-- CreateIndex
CREATE UNIQUE INDEX "ProfessionnelSante_userId_key" ON "ProfessionnelSante"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ProfessionnelSante_numeroProfessionnel_key" ON "ProfessionnelSante"("numeroProfessionnel");

-- CreateIndex
CREATE UNIQUE INDEX "Patient_userId_key" ON "Patient"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Patient_identifiantSante_key" ON "Patient"("identifiantSante");
