-- RG-CIT-81 : le patient peut mettre fin par avance a l'acces "contexte de
-- soins" (base B4) ouvert par sa venue dans l'etablissement, sans attendre
-- la fin naturelle de la fenetre de 72h. Additive, valeur par defaut false
-- pour toutes les lignes existantes (comportement inchange).

-- AlterTable
ALTER TABLE "RendezVous" ADD COLUMN "contexteSoinsTermineParPatient" BOOLEAN NOT NULL DEFAULT false;
