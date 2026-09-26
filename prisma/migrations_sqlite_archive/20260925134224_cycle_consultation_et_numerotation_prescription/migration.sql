-- F-CLI-05/07 du pack : cycle de vie brouillon -> valide de la consultation.
ALTER TABLE "Consultation" ADD COLUMN "dateValidation" DATETIME;
ALTER TABLE "Consultation" ADD COLUMN "empreinteContenu" TEXT;

-- Les consultations existantes sont deja des enregistrements finalises
-- (creees avant ce cycle brouillon/valide) : elles restent "terminee" avec
-- une date de validation retroactive alignee sur leur date de creation.
UPDATE "Consultation" SET "dateValidation" = "date" WHERE "statut" = 'terminee';

-- F-PRE-04 du pack : numero d'ordonnance lisible + empreinte de contenu.
ALTER TABLE "Prescription" ADD COLUMN "numero" TEXT;
ALTER TABLE "Prescription" ADD COLUMN "empreinteContenu" TEXT;

-- Backfill des prescriptions existantes : numerotation sequentielle
-- RX-DEMO-<sequence 4 chiffres> (l'ordre chronologique exact n'a pas
-- d'importance retroactivement, contrairement au format applique aux
-- nouvelles prescriptions par src/modules/prescription/actions.ts), empreinte
-- marquee retroactive (contenu non re-hache).
UPDATE "Prescription"
SET
  "numero" = 'RX-DEMO-' || printf('%04d', (
    SELECT COUNT(*) FROM "Prescription" AS p2 WHERE p2."rowid" <= "Prescription"."rowid"
  )),
  "empreinteContenu" = 'retroactif-' || "id"
WHERE "numero" IS NULL;

CREATE UNIQUE INDEX "Prescription_numero_key" ON "Prescription"("numero");
