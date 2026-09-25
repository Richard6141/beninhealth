"use client";

import { useMemo, useState } from "react";
import type { PrescriptionResume } from "@/modules/prescription/actions";
import { TextField } from "@/components/ui/TextField";
import { CartePrescriptionADelivrer } from "./CartePrescriptionADelivrer";

export function ListePrescriptionsADelivrer({
  prescriptions,
}: {
  prescriptions: PrescriptionResume[];
}) {
  const [recherche, setRecherche] = useState("");

  const prescriptionsFiltrees = useMemo(() => {
    const terme = recherche.trim().toLowerCase();

    if (!terme) return prescriptions;

    return prescriptions.filter(
      (prescription) =>
        (prescription.patientNomComplet ?? "").toLowerCase().includes(terme) ||
        (prescription.patientIdentifiantSante ?? "").toLowerCase().includes(terme)
    );
  }, [recherche, prescriptions]);

  return (
    <div className="flex flex-col gap-5">
      <TextField
        label="Rechercher un patient"
        placeholder="Nom, prénom ou identifiant santé"
        value={recherche}
        onChange={(evenement) => setRecherche(evenement.target.value)}
      />

      {prescriptionsFiltrees.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-champ border border-dashed border-bordure-forte bg-plan px-4 py-10 text-center">
          <p className="text-[14px] font-semibold text-encre">
            {prescriptions.length === 0
              ? "Aucune prescription en attente de délivrance."
              : "Aucun résultat pour cette recherche."}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {prescriptionsFiltrees.map((prescription) => (
            <CartePrescriptionADelivrer key={prescription.id} prescription={prescription} />
          ))}
        </div>
      )}
    </div>
  );
}
