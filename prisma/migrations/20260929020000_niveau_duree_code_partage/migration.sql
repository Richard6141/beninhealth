-- F-CIT-11 : le citoyen choisit desormais le niveau d'acces et la duree du
-- consentement resultant au moment de generer un code de partage, comme
-- F-CIT-10 (le pack impose "comme F-CIT-10", auparavant fixe a
-- "consultations" / 24h sans ce choix). Migration strictement additive :
-- nouvelles colonnes avec valeur par defaut, aucune colonne supprimee ni
-- type change ; les codes deja en base (non consommes ou dejas consommes)
-- restent lisibles avec ces valeurs par defaut.

ALTER TABLE "public"."CodePartageDossier"
  ADD COLUMN "niveauAcces" TEXT NOT NULL DEFAULT 'FULL',
  ADD COLUMN "duree" TEXT NOT NULL DEFAULT '24h';
