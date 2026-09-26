"use client";

import { useActionState, useId, useState } from "react";
import { useRouter } from "next/navigation";
import { corrigerResultatValideAction, type LaboratoireActionState } from "@/modules/laboratoire/actions";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/TextField";

const etatInitial: LaboratoireActionState = { error: null, success: false };

/**
 * Correction d'un resultat deja valide (F-LAB-04, RG-ROL-31 du pack) : le
 * resultat valide n'est jamais modifie sur place, une correction archive la
 * version validee puis rouvre la saisie pour une nouvelle version, qui devra
 * etre validee par un autre professionnel. Le design system ne fournit pas de
 * composant "textarea" (meme remarque que FormulaireValidation.tsx).
 */
export function SectionCorrectionValide({ examenId }: { examenId: string }) {
  const router = useRouter();
  const champMotifId = useId();
  const [ouvert, setOuvert] = useState(false);
  const [state, formAction, pending] = useActionState(
    async (etatPrecedent: LaboratoireActionState, formData: FormData) => {
      const resultat = await corrigerResultatValideAction(etatPrecedent, formData);
      if (resultat.success) router.refresh();
      return resultat;
    },
    etatInitial
  );

  if (state.success) {
    return (
      <p className="text-[13px] font-semibold text-vigilance">
        Correction ouverte : la version validee est archivee, saisissez la nouvelle version.
      </p>
    );
  }

  if (!ouvert) {
    return (
      <Button type="button" variant="secondary" size="sm" className="w-fit" onClick={() => setOuvert(true)}>
        Corriger ce résultat validé
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
        <Alert level="critical" title="Correction impossible">
          {state.error}
        </Alert>
      ) : null}

      <p className="text-[13px] text-encre-secondaire">
        La version validée est conservée telle quelle dans l&apos;historique. Le prescripteur est prévenu de la
        correction, et la nouvelle version devra être validée par un autre professionnel.
      </p>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={champMotifId} className="flex flex-wrap items-baseline gap-1.5 text-[15px] font-semibold text-encre">
          Motif de la correction
          <span className="text-critique" aria-hidden="true">
            *
          </span>
        </label>
        <textarea
          id={champMotifId}
          name="motif"
          rows={3}
          required
          minLength={10}
          maxLength={500}
          placeholder="Pourquoi ce résultat validé doit être corrigé..."
          className="w-full resize-y rounded-champ border border-bordure-forte bg-surface px-3 py-2 text-[15px] text-encre transition-colors motion-reduce:transition-none placeholder:text-encre-attenuee focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2"
        />
      </div>

      <TextField label="Votre mot de passe" name="motDePasse" type="password" required />

      <div className="flex flex-wrap gap-2">
        <Button type="submit" variant="danger" size="sm" disabled={pending}>
          {pending ? "Correction en cours..." : "Confirmer la correction"}
        </Button>
        <Button type="button" variant="secondary" size="sm" disabled={pending} onClick={() => setOuvert(false)}>
          Annuler
        </Button>
      </div>
    </form>
  );
}
