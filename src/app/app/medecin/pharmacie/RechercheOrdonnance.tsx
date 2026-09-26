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
 * comptoir par numero + annee de naissance (RG-PHA-01, throttlee cote
 * serveur, voir rechercherOrdonnancePresenteeAction). La recherche renvoie
 * un jeton de presentation signe, transmis a l'ecran de delivrance : c'est
 * la seule facon d'ouvrir une ordonnance qui n'a pas encore ete servie ici.
 */
export function RechercheOrdonnance() {
  const [state, formAction, pending] = useActionState(
    rechercherOrdonnancePresenteeAction,
    etatInitial
  );
  const router = useRouter();

  useEffect(() => {
    if (state.success && state.prescriptionId && state.jeton) {
      router.push(`/app/medecin/pharmacie/${state.prescriptionId}?jeton=${encodeURIComponent(state.jeton)}`);
    }
  }, [state.success, state.prescriptionId, state.jeton, router]);

  return (
    <Card
      title="Retrouver une ordonnance"
      description="Le numéro figure sur l'ordonnance. Demandez au patient son année de naissance."
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
