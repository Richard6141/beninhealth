"use client";

import { useActionState, useEffect } from "react";
import { Download } from "lucide-react";
import {
  genererLienTelechargementOrdonnanceAction,
  type LienTelechargementActionState,
} from "@/modules/prescription/telechargement";
import { Button } from "@/components/ui/Button";

const etatInitial: LienTelechargementActionState = { error: null, url: null };

/**
 * Bouton "Télécharger en PDF" d'une ordonnance (F-CIT-06 du pack). Le lien
 * de telechargement est genere a la demande (RG-CIT-50 : URL temporaire de
 * 60 secondes, generee apres controle d'acces), jamais un lien direct et
 * permanent vers le PDF : chaque clic redemande un jeton frais.
 */
export function BoutonTelechargerOrdonnance({ prescriptionId }: { prescriptionId: string }) {
  const [state, formAction, pending] = useActionState(
    genererLienTelechargementOrdonnanceAction,
    etatInitial
  );

  useEffect(() => {
    if (state.url) {
      window.location.href = state.url;
    }
  }, [state.url]);

  return (
    <form action={formAction}>
      <input type="hidden" name="prescriptionId" value={prescriptionId} />
      <Button type="submit" variant="secondary" size="sm" disabled={pending}>
        <Download size={14} aria-hidden="true" className="mr-1.5" />
        {pending ? "Préparation..." : "Télécharger en PDF"}
      </Button>
      {state.error ? <p className="mt-1 text-[12px] text-critique">{state.error}</p> : null}
    </form>
  );
}
