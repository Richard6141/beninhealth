"use client";

import { useActionState, useState } from "react";
import {
  delivrerPrescriptionAction,
  type PrescriptionActionState,
  type PrescriptionResume,
} from "@/modules/prescription/actions";
import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";

const etatInitial: PrescriptionActionState = { error: null, success: false };

type StatutLivraison = "delivree" | "delivree_partiellement";

function formaterDateHeure(date: string): string {
  try {
    return new Date(date).toLocaleString("fr-FR", { dateStyle: "long", timeStyle: "short" });
  } catch {
    return date;
  }
}

export function CartePrescriptionADelivrer({ prescription }: { prescription: PrescriptionResume }) {
  const [state, formAction, pending] = useActionState(delivrerPrescriptionAction, etatInitial);
  const [choix, setChoix] = useState<StatutLivraison>("delivree");

  function classeOption(actif: boolean) {
    return cn(
      "rounded-[calc(var(--radius-champ)-4px)] px-3 py-1.5 text-[13px] font-semibold transition-colors motion-reduce:transition-none",
      actif ? "bg-surface text-accent shadow-[var(--ombre-carte)]" : "text-encre-attenuee hover:text-encre"
    );
  }

  return (
    <div className="flex flex-col gap-4 rounded-carte border border-bordure bg-surface p-4 shadow-[var(--ombre-carte)] sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[15px] font-bold text-encre">{prescription.patientNomComplet}</p>
          <p className="text-[13px] text-encre-attenuee">
            {prescription.patientIdentifiantSante} · Prescrite le {formaterDateHeure(prescription.date)}
          </p>
        </div>
        <Badge tone={prescription.statut === "delivree_partiellement" ? "warning" : "info"}>
          {prescription.statut === "delivree_partiellement" ? "Partiellement délivrée" : "En attente"}
        </Badge>
      </div>

      <ul className="flex flex-col gap-2 border-t border-bordure pt-3">
        {prescription.lignes.map((ligne) => (
          <li
            key={ligne.medicamentId}
            className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-[14px]"
          >
            <span className="font-semibold text-encre">
              {ligne.medicamentNom}{" "}
              <span className="font-normal text-encre-attenuee">
                ({ligne.dosage}, {ligne.forme})
              </span>
            </span>
            <span className="text-encre-secondaire">
              {ligne.posologie} · Qté {ligne.quantite}
            </span>
          </li>
        ))}
      </ul>

      <form action={formAction} className="flex flex-col gap-3 border-t border-bordure pt-4">
        <input type="hidden" name="prescriptionId" value={prescription.id} />
        <input type="hidden" name="statutLivraison" value={choix} />

        {state.error ? (
          <Alert level="critical" title="Délivrance impossible">
            {state.error}
          </Alert>
        ) : null}
        {state.success ? (
          <Alert level="success" title="Délivrance enregistrée">
            Le statut de la prescription a été mis à jour.
          </Alert>
        ) : null}

        <div
          role="radiogroup"
          aria-label="Statut de délivrance"
          className="inline-flex w-fit items-center gap-1 rounded-champ bg-surface-appui p-1"
        >
          <button
            type="button"
            role="radio"
            aria-checked={choix === "delivree"}
            onClick={() => setChoix("delivree")}
            className={classeOption(choix === "delivree")}
          >
            Délivrée entièrement
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={choix === "delivree_partiellement"}
            onClick={() => setChoix("delivree_partiellement")}
            className={classeOption(choix === "delivree_partiellement")}
          >
            Délivrée partiellement
          </button>
        </div>

        <textarea
          name="commentaire"
          rows={2}
          placeholder="Commentaire (optionnel) : médicament indisponible, substitution proposée, etc."
          className="rounded-champ border border-bordure-forte bg-surface px-3 py-2 text-[14px] text-encre placeholder:text-encre-attenuee transition-colors motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2"
        />

        <Button type="submit" variant="primary" className="w-fit" disabled={pending}>
          {pending ? "Enregistrement..." : "Confirmer la délivrance"}
        </Button>
      </form>
    </div>
  );
}
