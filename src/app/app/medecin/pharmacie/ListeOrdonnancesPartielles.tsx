import Link from "next/link";
import { Pill } from "lucide-react";
import type { OrdonnancePartielleResume } from "@/modules/prescription/actions";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";

function formaterDate(date: string): string {
  try {
    return new Date(date).toLocaleDateString("fr-FR", { dateStyle: "long" });
  } catch {
    return date;
  }
}

/**
 * Ordonnances delivrees en partie par cette pharmacie et encore valables
 * (F-PHA-01 du pack, "pour les patients qui reviennent"). Aucune ordonnance
 * qui n'a pas ete presentee a cette pharmacie n'apparait ici : une nouvelle
 * ordonnance se retrouve par numero et annee de naissance (RG-PHA-02).
 */
export function ListeOrdonnancesPartielles({ ordonnances }: { ordonnances: OrdonnancePartielleResume[] }) {
  if (ordonnances.length === 0) {
    return (
      <Card className="p-0 sm:p-0">
        <div className="flex flex-col items-center gap-2 px-4 py-12 text-center">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-surface-appui text-encre-attenuee">
            <Pill size={20} aria-hidden="true" />
          </span>
          <p className="text-[14px] font-semibold text-encre">Aucune ordonnance à reprendre</p>
          <p className="max-w-[40ch] text-[13px] text-encre-attenuee">
            Les ordonnances que cette pharmacie a délivrées en partie, et qui sont encore valables, apparaissent ici.
          </p>
        </div>
      </Card>
    );
  }

  return (
    <ul className="flex flex-col gap-3">
      {ordonnances.map((ordonnance) => (
        <li key={ordonnance.id}>
          <Link
            href={`/app/medecin/pharmacie/${ordonnance.id}`}
            className="flex flex-col gap-2 rounded-carte border border-bordure bg-surface px-5 py-4 shadow-[var(--ombre-carte)] transition-colors motion-reduce:transition-none hover:border-accent focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-[15px] font-semibold text-encre">{ordonnance.patientNomComplet}</span>
              <Badge tone="warning">Délivrée en partie</Badge>
            </div>
            <span className="chiffres text-[13px] text-encre-secondaire">{ordonnance.numero}</span>
            <span className="text-[13px] text-encre-secondaire">
              Reste à délivrer :{" "}
              {ordonnance.lignesManquantes
                .map((ligne) => `${ligne.medicamentNom} (${ligne.quantiteRestante})`)
                .join(", ")}
            </span>
            <span className="text-[12px] text-encre-attenuee">
              Dernière délivrance le {formaterDate(ordonnance.derniereDelivranceISO)} · valable jusqu&apos;au{" "}
              {formaterDate(ordonnance.dateFinValiditeISO)}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
