"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { repondreRectificationAction } from "@/modules/patient/droits-donnees";
import type { PatientActionState } from "@/modules/patient/actions";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";

const etatInitial: PatientActionState = { error: null, success: false };

/** Reponse a une demande de rectification (F-CIT-13) : ne modifie jamais l'element conteste lui-meme. */
export function FormulaireReponseRectification({ id }: { id: string }) {
  const [state, formAction, pending] = useActionState(repondreRectificationAction, etatInitial);
  const [ouvert, setOuvert] = useState(false);
  const router = useRouter();

  useEffect(() => {
    if (state.success) {
      router.refresh();
    }
  }, [state.success, router]);

  if (!ouvert) {
    return (
      <Button type="button" variant="secondary" size="sm" onClick={() => setOuvert(true)}>
        Répondre
      </Button>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-2" onSubmit={() => setOuvert(false)}>
      {state.error ? (
        <Alert level="critical" title="Envoi impossible" className="text-[13px]">
          {state.error}
        </Alert>
      ) : null}
      <input type="hidden" name="id" value={id} />
      <textarea
        name="reponse"
        rows={3}
        required
        placeholder="Votre réponse au patient (correction effectuée, information confirmée, etc.)"
        className="w-full resize-y rounded-champ border border-bordure-forte bg-surface px-3 py-2 text-[13px] text-encre focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2"
      />
      <div className="flex gap-2">
        <Button type="submit" variant="primary" size="sm" disabled={pending}>
          {pending ? "Envoi..." : "Envoyer la réponse"}
        </Button>
        <Button type="button" variant="secondary" size="sm" onClick={() => setOuvert(false)}>
          Annuler
        </Button>
      </div>
    </form>
  );
}
