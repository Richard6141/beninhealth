"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Check, X } from "lucide-react";
import {
  repondreDemandeAccesAction,
  type DemandeAccesRecue,
  type ReponseDemandeAccesState,
} from "@/modules/transfert/demandes-patient";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

const etatInitial: ReponseDemandeAccesState = { error: null, success: false };

function heureLocale(iso: string): string {
  return new Date(iso).toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Africa/Porto-Novo",
  });
}

export function ReponseDemandeAcces({ demande }: { demande: DemandeAccesRecue }) {
  const router = useRouter();
  const [etat, action, enCours] = useActionState(repondreDemandeAccesAction, etatInitial);

  useEffect(() => {
    if (etat.success) {
      router.refresh();
    }
  }, [etat.success, router]);

  return (
    <Card
      title={`${demande.titre} ${demande.demandeurNomComplet}`}
      description={`${demande.etablissementNom}, à répondre avant ${heureLocale(demande.expireLe)}`}
    >
      <div className="flex flex-col gap-4">
        <dl className="grid gap-3 text-[15px] sm:grid-cols-2">
          <div>
            <dt className="text-[13px] font-semibold text-encre-attenuee">Pour</dt>
            <dd className="text-encre">{demande.motif}</dd>
          </div>
          <div>
            <dt className="text-[13px] font-semibold text-encre-attenuee">Durée de l&apos;accès demandé</dt>
            <dd className="text-encre">{demande.duree}</dd>
          </div>
        </dl>

        <Alert level="warning" title="Cette personne est-elle devant vous ?">
          Ne l&apos;autorisez que si vous êtes en consultation avec elle. Si vous ne la connaissez pas, refusez.
        </Alert>

        {etat.error ? (
          <p className="text-[14px] text-critique" role="alert">
            {etat.error}
          </p>
        ) : null}

        <form action={action} className="flex flex-wrap gap-3">
          <input type="hidden" name="demandeId" value={demande.id} />
          <Button type="submit" name="decision" value="accepter" iconBefore={Check} disabled={enCours}>
            Autoriser l&apos;accès
          </Button>
          <Button type="submit" name="decision" value="refuser" variant="danger" iconBefore={X} disabled={enCours}>
            Refuser
          </Button>
        </form>
      </div>
    </Card>
  );
}
