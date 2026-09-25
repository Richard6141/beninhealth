"use client";

import { useActionState, useId, useState } from "react";
import {
  renvoyerPourCorrectionAction,
  validerResultatExamenAction,
  type ExamenResume,
  type LaboratoireActionState,
} from "@/modules/laboratoire/actions";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/TextField";

const etatInitial: LaboratoireActionState = { error: null, success: false };

/**
 * Champ de commentaire libre pour le motif de renvoi pour correction : le
 * design system (src/components/ui) ne fournit pas de composant "textarea"
 * dedie (voir la meme remarque dans FormulaireResultat.tsx).
 */
function ChampCommentaire() {
  const fieldId = useId();

  return (
    <div className="flex flex-col gap-1.5">
      <label
        htmlFor={fieldId}
        className="flex flex-wrap items-baseline gap-1.5 text-[15px] font-semibold text-encre"
      >
        Motif du renvoi
        <span className="text-critique" aria-hidden="true">
          *
        </span>
      </label>
      <textarea
        id={fieldId}
        name="commentaire"
        rows={3}
        required
        placeholder="Ce qui doit etre corrige avant une nouvelle saisie..."
        className="w-full resize-y rounded-champ border border-bordure-forte bg-surface px-3 py-2 text-[15px] text-encre transition-colors motion-reduce:transition-none placeholder:text-encre-attenuee focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2"
      />
    </div>
  );
}

/**
 * Bouton "Valider" + re-authentification par mot de passe repliee par defaut
 * (meme convention que FormulaireRetrait.tsx dans
 * src/app/app/medecin/consultations/) : la fiche F-LAB-04 du pack demande une
 * re-authentification si la derniere connexion date de plus de 5 minutes ;
 * ce depot ne tracant pas cet horodatage au niveau de la session, le mot de
 * passe est re-saisi systematiquement, a chaque validation.
 */
function BoutonValider({ examenId }: { examenId: string }) {
  const [ouvert, setOuvert] = useState(false);
  const [state, formAction, pending] = useActionState(validerResultatExamenAction, etatInitial);

  if (state.success) {
    return <p className="text-[13px] font-semibold text-bon">Resultat valide.</p>;
  }

  if (!ouvert) {
    return (
      <Button type="button" variant="primary" size="sm" onClick={() => setOuvert(true)}>
        Valider
      </Button>
    );
  }

  return (
    <form
      action={formAction}
      aria-busy={pending}
      className="flex flex-col gap-3 rounded-champ border border-bordure bg-surface p-3"
    >
      <input type="hidden" name="examenId" value={examenId} />

      {state.error ? (
        <Alert level="critical" title="Validation impossible">
          {state.error}
        </Alert>
      ) : null}

      <TextField
        label="Votre mot de passe"
        name="motDePasse"
        type="password"
        required
        hint="Confirmation obligatoire avant de verrouiller un resultat (principe des quatre yeux)."
      />

      <div className="flex flex-wrap gap-2">
        <Button type="submit" variant="primary" size="sm" disabled={pending}>
          {pending ? "Validation en cours..." : "Confirmer la validation"}
        </Button>
        <Button type="button" variant="secondary" size="sm" onClick={() => setOuvert(false)}>
          Annuler
        </Button>
      </div>
    </form>
  );
}

/** Bouton "Renvoyer pour correction" + champ de motif obligatoire, replie par defaut. */
function BoutonRenvoyer({ examenId }: { examenId: string }) {
  const [ouvert, setOuvert] = useState(false);
  const [state, formAction, pending] = useActionState(
    renvoyerPourCorrectionAction,
    etatInitial
  );

  if (state.success) {
    return <p className="text-[13px] font-semibold text-vigilance">Renvoye pour correction.</p>;
  }

  if (!ouvert) {
    return (
      <Button type="button" variant="danger" size="sm" onClick={() => setOuvert(true)}>
        Renvoyer pour correction
      </Button>
    );
  }

  return (
    <form
      action={formAction}
      aria-busy={pending}
      className="flex flex-col gap-3 rounded-champ border border-critique bg-critique-clair p-3"
    >
      <input type="hidden" name="examenId" value={examenId} />

      {state.error ? (
        <Alert level="critical" title="Renvoi impossible">
          {state.error}
        </Alert>
      ) : null}

      <ChampCommentaire />

      <div className="flex flex-wrap gap-2">
        <Button type="submit" variant="danger" size="sm" disabled={pending}>
          {pending ? "Envoi en cours..." : "Confirmer le renvoi"}
        </Button>
        <Button type="button" variant="secondary" size="sm" onClick={() => setOuvert(false)}>
          Annuler
        </Button>
      </div>
    </form>
  );
}

/**
 * Section de validation d'un resultat en attente (F-LAB-04, principe des
 * quatre yeux). Si le professionnel connecte est celui qui a saisi le
 * resultat, aucun bouton de validation n'est propose : le masquage cote
 * client double le controle serveur (Zero Trust reste la seule autorite
 * reelle, voir validerResultatExamenAction et renvoyerPourCorrectionAction),
 * mais evite de presenter une action qui serait de toute facon refusee.
 */
export function SectionValidation({
  examen,
  estSaisiParMoi,
}: {
  examen: ExamenResume;
  estSaisiParMoi: boolean;
}) {
  if (estSaisiParMoi) {
    return (
      <Alert level="info" title="En attente de validation par un collegue">
        Vous avez saisi ce resultat : un autre professionnel du laboratoire
        doit le valider ou le renvoyer pour correction.
      </Alert>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      <BoutonValider examenId={examen.id} />
      <BoutonRenvoyer examenId={examen.id} />
    </div>
  );
}
