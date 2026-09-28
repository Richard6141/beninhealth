"use client";

import { useActionState, useState } from "react";
import { Download } from "lucide-react";
import { exporterComparaisonCSV } from "@/modules/pilotage/tendances";
import type { FiltresTendances } from "@/modules/pilotage/tendances-constantes";
import { verifierExportPilotageNationalAction } from "@/modules/pilotage/exports";
import {
  LONGUEUR_MIN_MOTIF_TEXTE_EXPORT,
  MOTIFS_EXPORT,
  type ExportPilotageActionState,
  type MotifExport,
} from "@/modules/pilotage/exports-constantes";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { SelectField } from "@/components/ui/SelectField";
import { TextField } from "@/components/ui/TextField";

const etatInitial: ExportPilotageActionState = { error: null, success: false };

/**
 * Export CSV des tendances et comparaisons territoriales (F-PIL-04, RG-PIL-40,
 * corrige le 2026-09-28). Meme parcours exact que BoutonExportCSV.tsx
 * (src/app/app/ministere, F-PIL-05) : motif obligatoire et mot de passe
 * reconfirme via verifierExportPilotageNationalAction, qui emet un jeton
 * signe de 5 minutes ; exporterComparaisonCSV (Server Action) exige ce jeton
 * cote serveur, reutilise les memes valeurs deja masquees (RG-PIL-02) que le
 * graphique et le tableau affiches, et journalise l'export ; le resultat est
 * ensuite telecharge cote client via un Blob, sans route API dediee.
 */
export function BoutonTelechargerTendances({ filtres }: { filtres: FiltresTendances }) {
  const [ouvert, setOuvert] = useState(false);
  const [state, formAction, pending] = useActionState(verifierExportPilotageNationalAction, etatInitial);
  const [motif, setMotif] = useState<MotifExport | "">("");
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  async function telecharger() {
    setEnCours(true);
    setErreur(null);
    try {
      const resultat = await exporterComparaisonCSV(filtres, state.jeton ?? null);
      if ("error" in resultat) {
        setErreur(resultat.error);
        return;
      }
      // Prefixe BOM UTF-8 pour un affichage correct des accents dans Excel.
      const blob = new Blob(["﻿" + resultat.contenu], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const lien = document.createElement("a");
      lien.href = url;
      lien.download = `tendances-${filtres.indicateurCode}-${filtres.granularite}.csv`;
      document.body.appendChild(lien);
      lien.click();
      document.body.removeChild(lien);
      URL.revokeObjectURL(url);
    } catch {
      setErreur("L'export a échoué. Veuillez réessayer.");
    } finally {
      setEnCours(false);
    }
  }

  if (!ouvert) {
    return (
      <Button type="button" variant="secondary" size="sm" iconBefore={Download} onClick={() => setOuvert(true)}>
        Télécharger les données
      </Button>
    );
  }

  if (state.success && state.jeton) {
    return (
      <div className="flex flex-col items-end gap-1.5">
        <Alert level="success" title="Identité confirmée">
          Le fichier est régénéré au moment du téléchargement (valable 5 minutes).
        </Alert>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          iconBefore={Download}
          disabled={enCours}
          onClick={telecharger}
        >
          {enCours ? "Export en cours..." : "Télécharger (CSV)"}
        </Button>
        {erreur ? (
          <p role="alert" className="text-[12px] text-critique">
            {erreur}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col items-end gap-3">
      {state.error ? (
        <Alert level="critical" title="Confirmation impossible">
          {state.error}
        </Alert>
      ) : null}
      <div className="flex w-full flex-col gap-3 sm:w-80">
        <SelectField
          label="Motif de l'export"
          name="motif"
          required
          placeholder="Choisissez un motif"
          value={motif}
          onChange={(event) => setMotif(event.target.value as MotifExport)}
          options={MOTIFS_EXPORT.map((option) => ({ value: option.value, label: option.label }))}
        />
        {motif === "autre" ? (
          <TextField label="Précisez le motif" name="motifTexte" required minLength={LONGUEUR_MIN_MOTIF_TEXTE_EXPORT} />
        ) : null}
        <TextField label="Mot de passe actuel" name="motDePasse" type="password" autoComplete="current-password" required />
      </div>
      <div className="flex flex-wrap justify-end gap-3">
        <Button type="button" variant="secondary" size="sm" onClick={() => setOuvert(false)}>
          Annuler
        </Button>
        <Button type="submit" variant="primary" size="sm" disabled={pending}>
          {pending ? "Vérification..." : "Confirmer et préparer l'export"}
        </Button>
      </div>
    </form>
  );
}
