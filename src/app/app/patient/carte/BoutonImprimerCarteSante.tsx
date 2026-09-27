"use client";

import { useState } from "react";
import { Printer } from "lucide-react";
import { genererLienImpressionCarteAction } from "@/modules/patient/carte-sante";
import { Button } from "@/components/ui/Button";

/**
 * Bouton "Imprimer ma carte" (F-CIT-05, étape 4, P1) : demande un lien de
 * téléchargement à usage unique (60 secondes) vers le PDF au format carte
 * bancaire, jamais un lien direct et permanent, même principe que le
 * téléchargement d'ordonnance (F-CIT-06,
 * app/patient/prescriptions/BoutonTelechargerOrdonnance.tsx).
 */
export function BoutonImprimerCarteSante() {
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  async function telecharger() {
    setEnCours(true);
    setErreur(null);
    try {
      const resultat = await genererLienImpressionCarteAction();
      if (resultat.url) {
        window.location.href = resultat.url;
      } else {
        setErreur(resultat.error ?? "Une erreur est survenue. Veuillez réessayer.");
      }
    } finally {
      setEnCours(false);
    }
  }

  return (
    <div className="flex flex-col items-center gap-1">
      <Button type="button" variant="secondary" size="sm" onClick={() => void telecharger()} disabled={enCours}>
        <Printer size={14} aria-hidden="true" className="mr-1.5" />
        {enCours ? "Préparation..." : "Imprimer ma carte"}
      </Button>
      {erreur ? <p className="text-[12px] text-critique">{erreur}</p> : null}
    </div>
  );
}
