-- AlterTable
-- Colonnes deja presentes en base au moment d'ecrire cette migration (ajoutees
-- hors migration trackee par une autre session cette nuit, jamais revendiquees
-- dans docs/coordination-agents.md) : ce fichier documente/trackee ce qui
-- existe deja plutot que de le recreer. Idempotent via IF NOT EXISTS pour
-- rester rejouable sans erreur sur un environnement qui ne les aurait pas
-- encore (ex. une base fraiche partant de zero).
ALTER TABLE "ExamenMedical" ADD COLUMN IF NOT EXISTS "niveauUrgence" TEXT NOT NULL DEFAULT 'normal';
ALTER TABLE "ExamenMedical" ADD COLUMN IF NOT EXISTS "aJeunRequis" BOOLEAN NOT NULL DEFAULT false;
