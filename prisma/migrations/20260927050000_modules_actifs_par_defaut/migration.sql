-- F-ADM-07 : les 3 modules metier (pharmacie, laboratoire, communautaire) sont
-- actifs par defaut. Les lignes deja creees avaient ete semees "desactivees"
-- par erreur de defaut ; on ne les active que si aucun administrateur ne les a
-- jamais basculees (aucune trace au journal d'audit), donc jamais une decision
-- explicite de desactivation.
UPDATE "FonctionnaliteActivable" AS f
SET "actif" = true
WHERE f."cle" IN ('pharmacy.module', 'lab.module', 'community.module')
  AND f."actif" = false
  AND NOT EXISTS (
    SELECT 1 FROM "JournalAudit" AS j
    WHERE j."action" = 'modification_fonctionnalite_activable'
      AND j."donneeConcernee" = 'fonctionnalite:' || f."cle"
  );
