-- F-LAB-01 : bref contexte clinique (200 caracteres, valide cote application)
-- donne au laboratoire a la demande d'un examen. Colonne additive et
-- nullable : aucun examen existant n'est affecte.

-- AlterTable
ALTER TABLE "ExamenMedical" ADD COLUMN "renseignementsCliniques" TEXT;
