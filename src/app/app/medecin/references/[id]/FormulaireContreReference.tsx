"use client";

import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import {
  enregistrerContreReferenceAction,
  type ReferenceActionState,
} from "@/modules/reference/actions";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

const etatInitial: ReferenceActionState = { error: null, success: false };

export interface FormulaireContreReferenceProps {
  referenceId: string;
}

/**
 * Formulaire de contre-reference (F-CLI-14) : reserve, cote serveur, a un
 * medecin de l'etablissement destinataire tant que la reference est encore
 * ouverte (voir enregistrerContreReferenceAction). Rafraichit la page au
 * succes pour afficher la contre-reference desormais enregistree a la place
 * du formulaire.
 */
export function FormulaireContreReference({ referenceId }: FormulaireContreReferenceProps) {
  const [state, formAction, pending] = useActionState(enregistrerContreReferenceAction, etatInitial);
  const router = useRouter();

  useEffect(() => {
    if (state.success) {
      router.refresh();
    }
  }, [state.success, router]);

  return (
    <Card
      title="Rediger la contre-reference"
      description="Compte-rendu transmis au medecin referent, clot la reference."
    >
      <form action={formAction} aria-busy={pending} className="flex flex-col gap-4">
        <input type="hidden" name="referenceId" value={referenceId} />

        {state.error ? (
          <Alert level="critical" title="Contre-reference non enregistree">
            {state.error}
          </Alert>
        ) : null}

        <textarea
          name="contreReferenceTexte"
          required
          rows={6}
          placeholder="Conclusions, conduite a tenir, suites proposees..."
          className="w-full resize-y rounded-champ border border-bordure-forte bg-surface px-3 py-2 text-[16px] text-encre transition-colors motion-reduce:transition-none placeholder:text-encre-attenuee focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2"
        />

        <Button type="submit" variant="primary" className="w-fit" disabled={pending}>
          {pending ? "Enregistrement en cours..." : "Enregistrer et cloturer"}
        </Button>
      </form>
    </Card>
  );
}
