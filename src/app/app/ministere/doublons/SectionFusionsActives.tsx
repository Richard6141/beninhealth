"use client";

import { useActionState, useEffect, useId, useState } from "react";
import { useRouter } from "next/navigation";
import { Undo2 } from "lucide-react";
import { defusionnerAction, type FusionActionState, type FusionActiveResume } from "@/modules/patient/fusion-doublons";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

const etatInitial: FusionActionState = { error: null, success: false };

function formaterDate(date: string): string {
  try {
    return new Date(date).toLocaleString("fr-FR", { dateStyle: "long", timeStyle: "short" });
  } catch {
    return date;
  }
}

function joursRestants(defusionLimiteLe: string): number {
  return Math.max(0, Math.ceil((new Date(defusionLimiteLe).getTime() - Date.now()) / (24 * 60 * 60 * 1000)));
}

function LigneFusionActive({ fusion }: { fusion: FusionActiveResume }) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(defusionnerAction, etatInitial);
  const [ouvert, setOuvert] = useState(false);
  const motifId = useId();

  useEffect(() => {
    if (state.success) router.refresh();
  }, [state.success, router]);

  if (state.success) {
    return (
      <Alert level="success" title="Fusion défusionnée">
        Les données ont été ramenées vers le dossier {fusion.secondaire.identifiantSante}. Son compte est réactivé (statut restauré).
      </Alert>
    );
  }

  return (
    <Card
      title={`${fusion.principal.identifiantSante} ← ${fusion.secondaire.identifiantSante}`}
      description={`Fusionné le ${formaterDate(fusion.dateExecution)} · ${joursRestants(fusion.defusionLimiteLe)} jour(s) restant(s) pour défusionner`}
    >
      <div className="flex flex-col gap-3">
        <p className="text-[13px] text-encre-secondaire">
          <span className="font-semibold text-encre">{fusion.principal.nomComplet}</span> a absorbé{" "}
          <span className="font-semibold text-encre">{fusion.secondaire.nomComplet}</span>.
        </p>
        <p className="text-[13px] text-encre-secondaire">
          <span className="font-semibold text-encre">Justification d&apos;origine :</span> {fusion.justification}
        </p>

        {state.error ? (
          <Alert level="critical" title="Défusion refusée">
            {state.error}
          </Alert>
        ) : null}

        {ouvert ? (
          <form action={formAction} className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <input type="hidden" name="fusionId" value={fusion.id} />
            <div className="flex flex-1 flex-col gap-1">
              <label htmlFor={motifId} className="text-[12px] font-semibold text-encre">
                Motif de la défusion (au moins 20 caractères)
              </label>
              <input id={motifId} name="motif" required minLength={20} className="h-10 rounded-champ border border-bordure-forte bg-surface px-3 text-[14px] text-encre" />
            </div>
            <Button type="submit" variant="danger" size="sm" disabled={pending}>
              {pending ? "Défusion..." : "Confirmer la défusion"}
            </Button>
          </form>
        ) : (
          <Button type="button" variant="secondary" size="sm" iconBefore={Undo2} className="w-fit" onClick={() => setOuvert(true)}>
            Défusionner
          </Button>
        )}
      </div>
    </Card>
  );
}

/** Fusions actives encore dans la fenêtre de défusion de 30 jours (RG-ADM-40). */
export function SectionFusionsActives({ fusions }: { fusions: FusionActiveResume[] }) {
  if (fusions.length === 0) return null;

  return (
    <section aria-labelledby="titre-fusions-actives" className="flex flex-col gap-4">
      <h2 id="titre-fusions-actives" className="text-[20px] font-bold text-encre">
        Fusions récentes, encore réversibles ({fusions.length})
      </h2>
      <div className="flex flex-col gap-3">
        {fusions.map((fusion) => (
          <LigneFusionActive key={fusion.id} fusion={fusion} />
        ))}
      </div>
    </section>
  );
}
