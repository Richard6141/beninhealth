import Link from "next/link";
import { Pill } from "lucide-react";
import {
  getPrescriptionsADelivrer,
  type PrescriptionResume,
} from "@/modules/prescription/actions";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";

const NOMBRE_MAX_APERCU = 5;

function formaterDate(date: string): string {
  try {
    return new Date(date).toLocaleDateString("fr-FR", { dateStyle: "long" });
  } catch {
    return date;
  }
}

function ApercuPrescription({ prescription }: { prescription: PrescriptionResume }) {
  const nombreMedicaments = prescription.lignes.length;

  return (
    <li className="flex flex-col gap-1 border-b border-bordure pb-3 last:border-0 last:pb-0">
      <div className="flex items-center justify-between gap-2">
        <span className="font-semibold text-encre">
          {prescription.patientNomComplet ?? "Patient non précisé"}
        </span>
        <span className="text-[13px] text-encre-secondaire">{formaterDate(prescription.date)}</span>
      </div>
      <span className="text-[13px] text-encre-secondaire">
        {nombreMedicaments} médicament{nombreMedicaments > 1 ? "s" : ""} prescri
        {nombreMedicaments > 1 ? "ts" : "t"}
      </span>
    </li>
  );
}

/**
 * Tableau de bord dédié au rôle pharmacien : uniquement les prescriptions à
 * délivrer, jamais de section "Patients du jour" ou "Rendez-vous" (ce rôle ne
 * détient aucune permission read:rendez_vous ni read:patient dans la matrice
 * RBAC, voir src/security/permissions.ts — les afficher aurait été trompeur).
 */
export async function DashboardPharmacien() {
  const prescriptions = await getPrescriptionsADelivrer();
  const apercu = prescriptions.slice(0, NOMBRE_MAX_APERCU);

  return (
    <div className="mx-auto flex w-full max-w-[1100px] flex-col gap-8 px-4 py-8 sm:px-6 lg:px-8">
      <header className="flex flex-col gap-4 rounded-carte border border-bordure bg-surface px-6 py-6 shadow-[var(--ombre-carte)] sm:flex-row sm:items-start sm:justify-between sm:px-8">
        <div className="flex flex-col gap-2">
          <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-accent">
            Espace Pharmacien
          </p>
          <h1 className="text-[28px] font-black text-encre">Tableau de bord pharmacien</h1>
          <p className="max-w-2xl text-[15px] text-encre-secondaire">
            Retrouvez ici les prescriptions validées en attente de délivrance.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge tone="accent">Pharmacien</Badge>
        </div>
      </header>

      <section aria-labelledby="titre-prescriptions" className="flex flex-col gap-4">
        <h2 id="titre-prescriptions" className="text-[20px] font-bold text-encre">
          Prescriptions à délivrer
        </h2>

        <div className="flex items-center gap-3 rounded-champ border border-bordure bg-plan px-4 py-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent-clair text-accent">
            <Pill size={20} aria-hidden="true" />
          </span>
          <div className="flex min-w-0 flex-col">
            <span className="text-[12px] font-semibold uppercase tracking-[0.06em] text-encre-attenuee">
              En attente de délivrance
            </span>
            <span className="chiffres text-[22px] font-black text-encre">
              {prescriptions.length}
            </span>
          </div>
        </div>

        <Card
          title="Aperçu"
          description="Les prescriptions les plus anciennes en premier."
          actions={
            prescriptions.length > 0 ? <Badge tone="accent">{prescriptions.length}</Badge> : undefined
          }
        >
          {apercu.length === 0 ? (
            <p className="text-[13px] text-encre-attenuee">
              Aucune prescription en attente de délivrance pour le moment.
            </p>
          ) : (
            <ul className="flex flex-col gap-3">
              {apercu.map((prescription) => (
                <ApercuPrescription key={prescription.id} prescription={prescription} />
              ))}
            </ul>
          )}
          <Link
            href="/app/medecin/pharmacie"
            className="mt-4 inline-block w-fit text-[13px] font-semibold text-accent hover:underline"
          >
            Voir toutes les prescriptions à délivrer
          </Link>
        </Card>
      </section>
    </div>
  );
}
