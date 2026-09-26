-- CreateTable
CREATE TABLE "CodeVerificationEmail" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "dateCreation" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expireLe" DATETIME NOT NULL,
    "consommeLe" DATETIME,
    CONSTRAINT "CodeVerificationEmail_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
