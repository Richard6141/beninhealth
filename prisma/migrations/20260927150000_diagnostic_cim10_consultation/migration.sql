-- F-CLI-06/07 : branchement du referentiel CIM-10 sur la consultation
-- (RG-CLI-52, RG-CLI-53). Purement additif : colonnes facultatives ou a
-- valeur par defaut, aucune ligne existante modifiee.
ALTER TABLE "Consultation" ADD COLUMN     "diagnosticPrincipalCertitude" TEXT,
ADD COLUMN     "diagnosticPrincipalCode" TEXT,
ADD COLUMN     "diagnosticPrincipalLibelle" TEXT,
ADD COLUMN     "diagnosticsSecondaires" TEXT NOT NULL DEFAULT '[]',
ADD COLUMN     "sensible" BOOLEAN NOT NULL DEFAULT false;
