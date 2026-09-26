"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  rechercherOrdonnancePresenteeAction,
  type RechercheOrdonnanceActionState,
} from "@/modules/prescription/actions";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { TextField } from "@/components/ui/TextField";

const etatInitial: RechercheOrdonnanceActionState = { error: null, success: false };

/**
 * F-PHA-02 du pack, version reduite : retrouver une ordonnance presentee au
 * comptoir par un patient qui n'apparait pas deja dans la liste "a
 * delivrer" de cette pharmacie (ex. prescrite ailleurs). Recherche par
 * numero + annee de naissance (RG-PHA-01, throttlee cote serveur, voir
 * rechercherOrdonnancePresenteeAction) plutot que par nom/identifiant sante
 * (deja couvert par ListePrescriptionsADelivrer, mais limite aux
 * prescriptions deja en attente localement).
 */
export function RechercheOrdonnance() {
  const [state, formAction, pending] = useActionState(
    rechercherOrdonnancePresenteeAction,
    etatInitial
  );
  const router = useRouter();

  useEffect(() => {
    if (state.success && state.prescriptionId) {
      router.push(`/app/medecin/pharmacie/${state.prescriptionId}`);
    }
  }, [state.success, state.prescriptionId, router]);

  return (
    <Card
      title="Retrouver une ordonnance"
      description="Pour un patient dont l'ordonnance n'apparaît pas déjà ci-dessous (prescrite dans un autre établissement, par exemple)."
    >
      <form action={formAction} aria-busy={pending} className="flex flex-col gap-4">
        {state.error ? (
          <Alert level="critical" title="Ordonnance introuvable">
            {state.error}
          </Alert>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="Numéro d'ordonnance"
            name="numero"
            required
            placeholder="Ex. RX-2026-0001"
          />
          <TextField
            label="Année de naissance du patient"
            name="anneeNaissance"
            type="number"
            required
            placeholder="Ex. 1990"
          />
        </div>

        <Button type="submit" variant="secondary" className="w-fit" disabled={pending}>
          {pending ? "Recherche en cours..." : "Rechercher"}
        </Button>
      </form>
    </Card>
  );
}
