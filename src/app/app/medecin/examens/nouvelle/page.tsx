import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getPatientsAvecConsentement } from "@/modules/clinical/actions";
import { getConsultationPourExamen, listLaboratoires } from "@/modules/laboratoire/actions";
import { FormulaireDemandeExamen } from "./FormulaireDemandeExamen";

interface NouvelExamenPageProps {
  searchParams: Promise<{ consultationId?: string | string[]; patientId?: string | string[] }>;
}

function premiereValeur(valeur: string | string[] | undefined): string {
  if (Array.isArray(valeur)) return valeur[0] ?? "";
  return valeur ?? "";
}

function LienRetour() {
  return (
    <Link
      href="/app/medecin/consultations"
      className="inline-flex w-fit items-center gap-1 text-[13px] font-semibold text-accent hover:underline"
    >
      <ArrowLeft size={14} aria-hidden="true" />
      Retour a l&apos;historique des consultations
    </Link>
  );
}

/**
 * Ecran "Demander un examen" (Phase 8) : lit consultationId et/ou patientId
 * en query param (optionnels), transmis depuis le lien "Demander un examen"
 * d'une consultation ou de la fiche patient (/app/medecin/patients/[id]). Le
 * patient est choisi dans un selecteur peuple par getPatientsAvecConsentement
 * (meme source que le selecteur de consultations), pre-selectionne
 * automatiquement via getConsultationPourExamen ou directement via patientId.
 */
export default async function NouvelExamenPage({ searchParams }: NouvelExamenPageProps) {
  const params = await searchParams;
  const consultationId = premiereValeur(params.consultationId).trim();
  const patientIdParam = premiereValeur(params.patientId).trim();

  const [laboratoires, patients, consultation] = await Promise.all([
    listLaboratoires(),
    getPatientsAvecConsentement(),
    consultationId ? getConsultationPourExamen(consultationId) : Promise.resolve(null),
  ]);

  return (
    <div className="conteneur-page mx-auto flex flex-col gap-8 px-4 py-8 sm:px-6">
      <header className="flex flex-col gap-2">
        <LienRetour />
        <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-accent">
          Espace professionnel
        </p>
        <h1 className="text-[28px] font-black text-encre">Demander un examen</h1>
        <p className="max-w-2xl text-[15px] text-encre-secondaire">
          Adressez une demande d&apos;examen a un laboratoire partenaire pour
          un patient.
        </p>
      </header>

      <FormulaireDemandeExamen
        laboratoires={laboratoires}
        patients={patients}
        consultationId={consultationId}
        patientIdPreselectionne={consultation?.patientId ?? patientIdParam}
      />
    </div>
  );
}
