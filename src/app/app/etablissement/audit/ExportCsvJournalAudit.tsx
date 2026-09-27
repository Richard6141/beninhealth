"use client";

import { useActionState, useState } from "react";
import { verifierMotDePasseExportCsvAuditAction, type ExportCsvAuditActionState } from "@/modules/audit/actions";
import type { FiltresJournalAudit } from "@/modules/audit/actions";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/TextField";

const etatInitial: ExportCsvAuditActionState = { error: null, success: false };

const LONGUEUR_MIN_MOTIF = 10;

function construireUrlExport(filtres: FiltresJournalAudit, jeton: string): string {
  const params = new URLSearchParams();
  params.set("dateDebut", filtres.dateDebut);
  params.set("dateFin", filtres.dateFin);
  if (filtres.acteur) params.set("acteur", filtres.acteur);
  if (filtres.patientIdentifiantSante) params.set("patient", filtres.patientIdentifiantSante);
  if (filtres.action) params.set("action", filtres.action);
  if (filtres.etablissementId) params.set("etablissementId", filtres.etablissementId);
  params.set("jeton", jeton);
  return `/api/audit/journal/export-csv?${params.toString()}`;
}

/**
 * Export CSV du journal d'audit (F-AUD-01 du pack), avec motif obligatoire
 * et re-authentification (meme patron que F-CIT-13,
 * src/app/app/patient/droits/GestionDroitsDonnees.tsx) : la periode et les
 * autres filtres exportes sont ceux actuellement affiches a l'ecran (la
 * recherche courante), jamais toute la base.
 */
export function ExportCsvJournalAudit({ filtres }: { filtres: FiltresJournalAudit }) {
  const [state, formAction, pending] = useActionState<ExportCsvAuditActionState, FormData>(
    verifierMotDePasseExportCsvAuditAction,
    etatInitial
  );
  const [ouvert, setOuvert] = useState(false);
  const [motif, setMotif] = useState("");

  if (state.success && state.jeton) {
    return (
      <div className="flex flex-col gap-2 rounded-champ border border-bordure bg-plan p-3">
        <Alert level="success" title="Identité confirmée">
          Le fichier reprend la recherche actuelle (période et filtres affichés).
        </Alert>
        <a
          href={construireUrlExport(filtres, state.jeton)}
          className="inline-flex h-9 w-fit items-center justify-center gap-2 rounded-champ border border-bordure-forte bg-surface px-4 text-[13px] font-semibold text-encre transition-colors motion-reduce:transition-none hover:bg-surface-appui"
        >
          Télécharger le CSV
        </a>
      </div>
    );
  }

  if (!ouvert) {
    return (
      <Button type="button" variant="secondary" className="w-fit" onClick={() => setOuvert(true)}>
        Exporter en CSV
      </Button>
    );
  }

  return (
    <form
      action={formAction}
      className="flex flex-col gap-3 rounded-champ border border-bordure bg-plan p-3"
    >
      {state.error ? (
        <Alert level="critical" title="Confirmation impossible">
          {state.error}
        </Alert>
      ) : null}
      <input type="hidden" name="dateDebut" value={filtres.dateDebut} />
      <input type="hidden" name="dateFin" value={filtres.dateFin} />
      <div className="flex flex-col gap-1.5">
        <label htmlFor="motif-export-audit" className="text-[13px] font-semibold text-encre">
          Motif de l&apos;export <span className="text-critique">*</span>
        </label>
        <textarea
          id="motif-export-audit"
          name="motif"
          rows={2}
          required
          minLength={LONGUEUR_MIN_MOTIF}
          value={motif}
          onChange={(event) => setMotif(event.target.value)}
          placeholder="Ex. contrôle mensuel des accès du service X"
          className="w-full resize-y rounded-champ border border-bordure-forte bg-surface px-3 py-2 text-[14px] text-encre transition-colors motion-reduce:transition-none placeholder:text-encre-attenuee focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2"
        />
      </div>
      <TextField label="Mot de passe actuel" name="motDePasse" type="password" autoComplete="current-password" required />
      <div className="flex gap-3">
        <Button
          type="submit"
          variant="primary"
          className="w-fit"
          disabled={pending || motif.trim().length < LONGUEUR_MIN_MOTIF}
        >
          {pending ? "Vérification..." : "Confirmer et préparer l'export"}
        </Button>
        <Button type="button" variant="secondary" className="w-fit" onClick={() => setOuvert(false)}>
          Annuler
        </Button>
      </div>
    </form>
  );
}
