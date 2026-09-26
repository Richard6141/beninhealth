"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { exporterComparaisonCSV } from "@/modules/pilotage/tendances";
import type { FiltresTendances } from "@/modules/pilotage/tendances-constantes";

/**
 * Meme principe que BoutonExportCSV.tsx (src/app/app/ministere) : le CSV est
 * genere cote serveur (memes filtres, memes valeurs deja masquees RG-PIL-02
 * que le graphique et le tableau affiches), puis telecharge cote client via
 * un Blob, sans route API dediee.
 */
export function BoutonTelechargerTendances({ filtres }: { filtres: FiltresTendances }) {
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  async function telecharger() {
    setEnCours(true);
    setErreur(null);
    try {
      const csv = await exporterComparaisonCSV(filtres);
      if (!csv) {
        setErreur("Aucune donnée à exporter pour cette sélection.");
        return;
      }
      const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
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

  return (
    <div className="flex flex-col items-end gap-1.5">
      <Button type="button" variant="secondary" size="sm" iconBefore={Download} disabled={enCours} onClick={telecharger}>
        {enCours ? "Export en cours..." : "Télécharger les données"}
      </Button>
      {erreur ? (
        <p role="alert" className="text-[12px] text-critique">
          {erreur}
        </p>
      ) : null}
    </div>
  );
}
