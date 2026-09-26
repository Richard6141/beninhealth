-- Remplace le champ texte libre Consultation.constantes par des constantes
-- vitales structurees (F-CLI-06 du pack). Perte assumee des 2 valeurs texte
-- libre existantes (donnees de demo/developpement), voir
-- docs/audit-cote-medecin.md.
ALTER TABLE "Consultation" DROP COLUMN "constantes";

ALTER TABLE "Consultation" ADD COLUMN "temperatureCelsius" REAL;
ALTER TABLE "Consultation" ADD COLUMN "pouls" INTEGER;
ALTER TABLE "Consultation" ADD COLUMN "tensionSystolique" INTEGER;
ALTER TABLE "Consultation" ADD COLUMN "tensionDiastolique" INTEGER;
ALTER TABLE "Consultation" ADD COLUMN "frequenceRespiratoire" INTEGER;
ALTER TABLE "Consultation" ADD COLUMN "saturationOxygene" INTEGER;
ALTER TABLE "Consultation" ADD COLUMN "poidsKg" REAL;
ALTER TABLE "Consultation" ADD COLUMN "tailleCm" REAL;
ALTER TABLE "Consultation" ADD COLUMN "glycemieGL" REAL;
