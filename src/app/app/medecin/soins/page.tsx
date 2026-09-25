import Link from "next/link";
import { ArrowLeft, HeartPulse } from "lucide-react";
import {
  getPatientsAttendantConstantes,
  type PatientAttendantConstantes,
} from "@/modules/soins/actions";
import { Card } from "@/components/ui/Card";
import { cn } from "@/lib/cn";

function formaterHeure(dateIso: string): string {
  try {
    return new Date(dateIso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return dateIso;
  }
}

function LienPrendreEnCharge({ patient }: { patient: PatientAttendantConstantes }) {
  const href = `/app/medecin/soins/nouvelle?patientId=${encodeURIComponent(patient.patientId)}&rendezVousId=${encodeURIComponent(patient.rendezVousId)}`;

  return (
    <Link
      href={href}
      className={cn(
        "inline-flex h-11 w-fit items-center justify-center gap-2 rounded-champ bg-accent px-4 text-[15px] font-semibold text-white transition-colors motion-reduce:transition-none hover:bg-accent-fonce",
        "focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2"
      )}
    >
      Prendre en charge
    </Link>
  );
}

function CartePatientAttente({ patient }: { patient: PatientAttendantConstantes }) {
  return (
    <Card
      title={patient.patientNomComplet}
      description={patient.motif || "Motif non precise"}
      actions={
        <span className="text-[13px] font-semibold text-encre-secondaire">
          {formaterHeure(patient.heureRendezVous)}
        </span>
      }
    >
      <LienPrendreEnCharge patient={patient} />
    </Card>
  );
}

/**
 * Ecran "Prise en charge infirmiere" (F-CLI-12 du pack) : liste des patients
 * arrives (rendez-vous confirmes pour aujourd'hui) dans l'etablissement de
 * l'infirmier connecte, dont les constantes n'ont pas encore ete prises.
 * Selectionner un patient ouvre le formulaire de saisie
 * (/app/medecin/soins/nouvelle).
 */
export default async function SoinsPage() {
  const patients = await getPatientsAttendantConstantes();

  return (
    <div className="conteneur-page mx-auto flex flex-col gap-8 px-4 py-8 sm:px-6">
      <header className="flex flex-col gap-2">
        <Link
          href="/app/medecin"
          className="inline-flex w-fit items-center gap-1 text-[13px] font-semibold text-accent hover:underline"
        >
          <ArrowLeft size={14} aria-hidden="true" />
          Retour au tableau de bord
        </Link>
        <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-accent">
          Espace infirmier
        </p>
        <h1 className="text-[28px] font-black text-encre">Prise en charge infirmiere</h1>
        <p className="max-w-2xl text-[15px] text-encre-secondaire">
          Patients confirmes pour aujourd&apos;hui dont les constantes n&apos;ont pas encore ete prises.
        </p>
      </header>

      {patients.length === 0 ? (
        <Card>
          <div className="flex flex-col items-center gap-2 rounded-champ border border-dashed border-bordure-forte bg-plan px-4 py-8 text-center">
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-accent-clair text-accent">
              <HeartPulse size={20} aria-hidden="true" />
            </span>
            <p className="text-[14px] font-semibold text-encre">Aucun patient en attente</p>
            <p className="max-w-[36ch] text-[13px] text-encre-attenuee">
              Tous les patients confirmes pour aujourd&apos;hui ont deja leurs
              constantes prises, ou aucun rendez-vous n&apos;est confirme pour
              le moment.
            </p>
          </div>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {patients.map((patient) => (
            <CartePatientAttente key={patient.rendezVousId} patient={patient} />
          ))}
        </div>
      )}
    </div>
  );
}
