-- F-ETA-05 : duree et capacite de creneau (additif, defauts compatibles avec
-- l'existant : capacite 1 = comportement inchange, aucune ligne existante
-- n'est modifiee autrement que par ce defaut).

-- AlterTable
ALTER TABLE "CreneauDisponibilite" ADD COLUMN     "dureeCreneauMinutes" INTEGER NOT NULL DEFAULT 30,
ADD COLUMN     "capacite" INTEGER NOT NULL DEFAULT 1;
