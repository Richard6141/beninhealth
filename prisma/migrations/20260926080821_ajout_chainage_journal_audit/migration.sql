-- RG-AUD-02 du pack : chainage cryptographique du journal d'audit.
-- L'empreinte de chaque ligne est calculee par un trigger Postgres, jamais
-- par le code applicatif : ainsi toute ecriture dans JournalAudit est
-- chainee, quel que soit le chemin d'ecriture (journaliser() reste le seul
-- point d'ecriture cote application, mais le trigger est le vrai garant).

-- Necessaire pour digest() (SHA-256). Deja active manuellement sur la base
-- partagee pendant la conception de cette migration ; IF NOT EXISTS la rend
-- de toute facon idempotente pour tout environnement qui rejoue l'historique
-- de migrations depuis le debut.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- AlterTable
ALTER TABLE "JournalAudit" ADD COLUMN     "empreinte" TEXT,
ADD COLUMN     "empreintePrecedente" TEXT,
ADD COLUMN     "numeroSequence" BIGSERIAL NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "JournalAudit_numeroSequence_key" ON "JournalAudit"("numeroSequence");

-- Retro-chainage des lignes deja existantes (avant que le trigger ci-dessous
-- ne prenne le relais pour toute nouvelle ecriture). Parcourt les lignes
-- dans l'ordre de numeroSequence (ordre total fiable, contrairement a
-- "date" qui peut partager la meme milliseconde entre deux ecritures
-- concurrentes) et calcule chaque empreinte a partir de la precedente.
DO $$
DECLARE
  ligne RECORD;
  precedente TEXT := NULL;
BEGIN
  FOR ligne IN
    SELECT id, "utilisateurId", action, "donneeConcernee", justification
    FROM "JournalAudit"
    ORDER BY "numeroSequence" ASC
  LOOP
    UPDATE "JournalAudit"
    SET "empreintePrecedente" = precedente,
        "empreinte" = encode(
          digest(
            convert_to(
              COALESCE(precedente, '') || ligne.id || ligne."utilisateurId" || ligne.action || ligne."donneeConcernee" || ligne.justification,
              'UTF8'
            ),
            'sha256'
          ),
          'hex'
        )
    WHERE id = ligne.id;

    precedente := encode(
      digest(
        convert_to(
          COALESCE(precedente, '') || ligne.id || ligne."utilisateurId" || ligne.action || ligne."donneeConcernee" || ligne.justification,
          'UTF8'
        ),
        'sha256'
      ),
      'hex'
    );
  END LOOP;
END $$;

-- Fonction et trigger : chainent automatiquement toute nouvelle ligne, quel
-- que soit le code applicatif qui l'insere (journaliser(), une future
-- Server Action qui l'oublierait, ou une requete SQL directe).
CREATE OR REPLACE FUNCTION chainer_journal_audit() RETURNS TRIGGER AS $$
DECLARE
  derniere_empreinte TEXT;
BEGIN
  SELECT empreinte INTO derniere_empreinte
  FROM "JournalAudit"
  ORDER BY "numeroSequence" DESC
  LIMIT 1;

  NEW."empreintePrecedente" := derniere_empreinte;
  NEW."empreinte" := encode(
    digest(
      convert_to(
        COALESCE(derniere_empreinte, '') || NEW.id || NEW."utilisateurId" || NEW.action || NEW."donneeConcernee" || NEW.justification,
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_chainer_journal_audit ON "JournalAudit";
CREATE TRIGGER trg_chainer_journal_audit
BEFORE INSERT ON "JournalAudit"
FOR EACH ROW EXECUTE FUNCTION chainer_journal_audit();
