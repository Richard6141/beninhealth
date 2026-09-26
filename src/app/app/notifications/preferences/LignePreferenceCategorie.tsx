"use client";

import { useActionState, useState } from "react";
import {
  mettreAJourPreferenceAction,
  type PreferenceCategorieResume,
  type PreferenceNotificationActionState,
} from "@/modules/notification/preferences";
import type { DefinitionCategorieNotification } from "@/modules/notification/categories";
import { Button } from "@/components/ui/Button";

const etatInitial: PreferenceNotificationActionState = { error: null, success: false };

/**
 * Une ligne de preference modifiable (F-NOT-03) : canal interne verrouille
 * (toujours actif), SMS et email modifiables. Enregistrement independant
 * par ligne (pas un formulaire global), pour rester simple et donner un
 * retour immediat categorie par categorie.
 */
export function LignePreferenceCategorie({
  definition,
  preferenceInitiale,
}: {
  definition: DefinitionCategorieNotification;
  preferenceInitiale: PreferenceCategorieResume;
}) {
  const [state, formAction, pending] = useActionState(mettreAJourPreferenceAction, etatInitial);
  const [sms, setSms] = useState(preferenceInitiale.sms);
  const [email, setEmail] = useState(preferenceInitiale.email);

  return (
    <div className="flex flex-col gap-3 rounded-champ border border-bordure bg-surface p-4">
      <div className="flex flex-col gap-1">
        <p className="text-[15px] font-semibold text-encre">{definition.libelle}</p>
        <p className="text-[13px] text-encre-secondaire">{definition.description}</p>
      </div>

      <form action={formAction} className="flex flex-wrap items-center gap-4">
        <input type="hidden" name="categorie" value={definition.code} />
        <input type="hidden" name="sms" value={sms ? "1" : ""} />
        <input type="hidden" name="email" value={email ? "1" : ""} />

        <label className="flex items-center gap-2 text-[13px] text-encre-attenuee">
          <input type="checkbox" checked disabled />
          Interne (toujours actif)
        </label>
        <label className="flex items-center gap-2 text-[13px] font-semibold text-encre">
          <input type="checkbox" checked={sms} onChange={(e) => setSms(e.target.checked)} />
          SMS
        </label>
        <label className="flex items-center gap-2 text-[13px] font-semibold text-encre">
          <input type="checkbox" checked={email} onChange={(e) => setEmail(e.target.checked)} />
          E-mail
        </label>

        <Button type="submit" variant="secondary" size="sm" disabled={pending}>
          {pending ? "Enregistrement..." : "Enregistrer"}
        </Button>

        {state.success ? <span className="text-[12px] font-semibold text-bon">Enregistré.</span> : null}
        {state.error ? <span className="text-[12px] text-critique">{state.error}</span> : null}
      </form>
    </div>
  );
}
