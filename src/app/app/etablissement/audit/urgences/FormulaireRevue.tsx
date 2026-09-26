"use client";

import { useActionState, useId, useState } from "react";
import {
  enregistrerRevueAccesUrgenceAction,
  type RevueAccesUrgenceActionState,
} from "@/modules/audit/actions";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";

const etatInitial: RevueAccesUrgenceActionState = { error: null, success: false };

/**
 * Decision "Conforme" / "Non conforme" pour un acces d'urgence (F-AUD-02),
 * commentaire obligatoire dans les deux cas. Les deux useActionState sont
 * geres dans le meme composant (meme raison que ControlesValidation du
 * module laboratoire) : une fois l'un des deux aboutit, l'autre doit
 * disparaitre plutot que rester affiche sur un acces deja revu.
 */
export function FormulaireRevue({ journalAuditId }: { journalAuditId: string }) {
  const [decisionOuverte, setDecisionOuverte] = useState<"conforme" | "non_conforme" | null>(null);
  const [state, formAction, pending] = useActionState(enregistrerRevueAccesUrgenceAction, etatInitial);
  const commentaireId = useId();

  if (state.success) {
    return <p className="text-[13px] font-semibold text-bon">Décision enregistrée.</p>;
  }

  if (!decisionOuverte) {
    return (
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="primary" size="sm" onClick={() => setDecisionOuverte("conforme")}>
          Conforme
        </Button>
        <Button type="button" variant="danger" size="sm" onClick={() => setDecisionOuverte("non_conforme")}>
          Non conforme
        </Button>
      </div>
    );
  }

  return (
    <form
      action={formAction}
      aria-busy={pending}
      className={
        decisionOuverte === "non_conforme"
          ? "flex flex-col gap-3 rounded-champ border border-critique bg-critique-clair p-3"
          : "flex flex-col gap-3 rounded-champ border border-bordure bg-surface p-3"
      }
    >
      <input type="hidden" name="journalAuditId" value={journalAuditId} />
      <input type="hidden" name="decision" value={decisionOuverte} />

      {state.error ? (
        <Alert level="critical" title="Décision impossible">
          {state.error}
        </Alert>
      ) : null}

      <p className="text-[14px] font-semibold text-encre">
        Décision : {decisionOuverte === "conforme" ? "Conforme" : "Non conforme"}
      </p>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={commentaireId} className="text-[13px] font-semibold text-encre">
          Commentaire <span className="text-critique" aria-hidden="true">*</span>
        </label>
        <textarea
          id={commentaireId}
          name="commentaire"
          required
          minLength={10}
          rows={3}
          placeholder="Au moins 10 caractères..."
          className="w-full resize-y rounded-champ border border-bordure-forte bg-surface px-3 py-2 text-[14px] text-encre transition-colors motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2"
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          type="submit"
          variant={decisionOuverte === "non_conforme" ? "danger" : "primary"}
          size="sm"
          disabled={pending}
        >
          {pending ? "Enregistrement..." : "Confirmer la décision"}
        </Button>
        <Button type="button" variant="secondary" size="sm" onClick={() => setDecisionOuverte(null)}>
          Annuler
        </Button>
      </div>
    </form>
  );
}
