"use client";

import { useActionState, useState } from "react";
import { retirerDocumentAction, type DocumentActionState } from "@/modules/document/actions";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/TextField";

const etatInitial: DocumentActionState = { error: null, success: false };

/**
 * Retrait d'un document medical "ajoute par erreur" (RG-CLI-113 du pack) :
 * jamais une suppression, le document reste visible et telechargeable,
 * seulement marque comme retire avec un motif obligatoire (au moins 10
 * caracteres, verifie cote serveur). Reserve a l'auteur du document (voir
 * ListeDocuments, qui n'affiche ce controle que si estAuteur est vrai).
 */
export function FormulaireRetraitDocument({ documentId }: { documentId: string }) {
  const [ouvert, setOuvert] = useState(false);
  const [state, formAction, pending] = useActionState(retirerDocumentAction, etatInitial);

  if (state.success) {
    return <p className="text-[13px] font-semibold text-critique">Document retire (ajoute par erreur).</p>;
  }

  if (!ouvert) {
    return (
      <Button type="button" variant="ghost" size="sm" onClick={() => setOuvert(true)}>
        Retirer (ajoute par erreur)
      </Button>
    );
  }

  return (
    <form
      action={formAction}
      aria-busy={pending}
      className="flex w-full flex-col gap-3 rounded-champ border border-critique bg-critique-clair p-3"
    >
      <input type="hidden" name="documentId" value={documentId} />

      <Alert level="critical" title="Retrait pour ajout par erreur">
        Reserve au cas ou ce document a ete ajoute au mauvais dossier ou par
        erreur. Il restera visible et telechargeable, marque comme retire.
      </Alert>

      {state.error ? (
        <Alert level="critical" title="Retrait impossible">
          {state.error}
        </Alert>
      ) : null}

      <TextField label="Motif du retrait" name="motif" required hint="Au moins 10 caracteres." />

      <div className="flex flex-wrap gap-2">
        <Button type="submit" variant="primary" size="sm" disabled={pending}>
          {pending ? "Retrait en cours..." : "Confirmer le retrait"}
        </Button>
        <Button type="button" variant="secondary" size="sm" onClick={() => setOuvert(false)}>
          Annuler
        </Button>
      </div>
    </form>
  );
}
