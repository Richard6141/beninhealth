-- CreateTable
CREATE TABLE "RevueAccesUrgence" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "journalAuditId" TEXT NOT NULL,
    "reviewerId" TEXT NOT NULL,
    "decision" TEXT NOT NULL,
    "commentaire" TEXT NOT NULL,
    "date" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RevueAccesUrgence_journalAuditId_fkey" FOREIGN KEY ("journalAuditId") REFERENCES "JournalAudit" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "RevueAccesUrgence_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "RevueAccesUrgence_journalAuditId_key" ON "RevueAccesUrgence"("journalAuditId");
