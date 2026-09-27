"use client";

import { useActionState, useEffect } from "react";
import { Download } from "lucide-react";
import {
  genererLienTelechargementDocumentAction,
  type LienTelechargementDocumentActionState,
} from "@/modules/document/telechargement";
import { Button } from "@/components/ui/Button";

const etatInitial: LienTelechargementDocumentActionState = { error: null, url: null };

/**
 * Bouton "Télécharger" d'un document medical, cote patient (F-CIT-06 du
 * pack). Le lien de telechargement est genere a la demande (RG-CIT-50 : URL
 * temporaire de 60 secondes, generee apres controle d'acces), jamais un lien
 * direct et permanent : chaque clic redemande un jeton frais. Meme patron
 * que BoutonTelechargerOrdonnance.tsx.
 */
export function BoutonTelechargerDocument({ documentId }: { documentId: string }) {
  const [state, formAction, pending] = useActionState(
    genererLienTelechargementDocumentAction,
    etatInitial
  );

  useEffect(() => {
    if (state.url) {
      window.location.href = state.url;
    }
  }, [state.url]);

  return (
    <form action={formAction}>
      <input type="hidden" name="documentId" value={documentId} />
      <Button type="submit" variant="secondary" size="sm" disabled={pending}>
        <Download size={14} aria-hidden="true" className="mr-1.5" />
        {pending ? "Préparation..." : "Télécharger"}
      </Button>
      {state.error ? <p className="mt-1 text-[12px] text-critique">{state.error}</p> : null}
    </form>
  );
}
