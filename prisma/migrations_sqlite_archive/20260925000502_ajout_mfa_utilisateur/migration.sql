-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "nom" TEXT NOT NULL,
    "prenom" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "telephone" TEXT NOT NULL,
    "motDePasseHash" TEXT NOT NULL,
    "statut" TEXT NOT NULL DEFAULT 'actif',
    "dateCreation" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "derniereConnexion" DATETIME,
    "avatarUrl" TEXT,
    "mfaSecret" TEXT,
    "mfaActif" BOOLEAN NOT NULL DEFAULT false
);
INSERT INTO "new_User" ("avatarUrl", "dateCreation", "derniereConnexion", "email", "id", "motDePasseHash", "nom", "prenom", "statut", "telephone") SELECT "avatarUrl", "dateCreation", "derniereConnexion", "email", "id", "motDePasseHash", "nom", "prenom", "statut", "telephone" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
