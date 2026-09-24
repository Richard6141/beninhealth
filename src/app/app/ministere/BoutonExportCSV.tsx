"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { exporterRepartitionCSV } from "@/modules/analytics/actions";
import { Button } from "@/components/ui/Button";

/**
 * Declenche exporterRepartitionCSV() (Server Action) puis provoque le
 * telechargement du resultat cote client via un Blob et un lien temporaire,
 * sans route API dediee : le contenu ne quitte jamais le navigateur de
 * l'utilisateur autrement que par ce telechargement local.
 */
export function BoutonExportCSV() {
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  async function telecharger() {
    setEnCours(true);
    setErreur(null);
    try {
      const csv = await exporterRepartitionCSV();
      if (!csv) {
        setErreur("Aucune donnee a exporter.");
        return;
      }
      // Prefixe BOM UTF-8 pour un affichage correct des accents dans Excel.
      const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const lien = document.createElement("a");
      lien.href = url;
      lien.download = "repartition-etablissements.csv";
      document.body.appendChild(lien);
      lien.click();
      document.body.removeChild(lien);
      URL.revokeObjectURL(url);
    } catch {
      setErreur("L'export a echoue. Veuillez reessayer.");
    } finally {
      setEnCours(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
      <Button
        type="button"
        variant="secondary"
        size="sm"
        iconBefore={Download}
        disabled={enCours}
        onClick={telecharger}
      >
        {enCours ? "Export en cours..." : "Exporter en CSV"}
      </Button>
      {erreur ? (
        <p role="alert" className="text-[12px] text-critique">
          {erreur}
        </p>
      ) : null}
    </div>
  );
}
