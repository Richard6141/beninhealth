"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  marquerReferenceCommunautaireVueAction,
  type SuiviCommunautaireActionState,
} from "@/modules/communautaire/actions";
import { Button } from "@/components/ui/Button";

const etatInitial: SuiviCommunautaireActionState = { error: null, success: false };

/** Marque une reference communautaire "vue" (F-COM-03) : ne change aucun statut clinique, seulement "prise en compte". */
export function BoutonMarquerVue({ id }: { id: string }) {
  const [state, formAction, pending] = useActionState(marquerReferenceCommunautaireVueAction, etatInitial);
  const router = useRouter();

  useEffect(() => {
    if (state.success) {
      router.refresh();
    }
  }, [state.success, router]);

  return (
    <form action={formAction}>
      <input type="hidden" name="id" value={id} />
      <Button type="submit" variant="secondary" size="sm" disabled={pending}>
        {pending ? "..." : "Marquer vue"}
      </Button>
    </form>
  );
}
