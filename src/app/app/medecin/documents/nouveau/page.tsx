import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getConsultationsDuProfessionnel, getPatientsAvecConsentement } from "@/modules/clinical/actions";
import { FormulaireDocument } from "./FormulaireDocument";

interface NouveauDocumentPageProps {
  searchParams: Promise<{ patientId?: string | string[]; consultationId?: string | string[] }>;
}

function premiereValeur(valeur: string | string[] | undefined): string {
  if (Array.isArray(valeur)) return valeur[0] ?? "";
  return valeur ?? "";
}

function LienRetour() {
  return (
    <Link
      href="/app/medecin/patients"
      className="inline-flex w-fit items-center gap-1 text-[13px] font-semibold text-accent hover:underline"
    >
      <ArrowLeft size={14} aria-hidden="true" />
      Retour a mes patients
    </Link>
  );
}

/**
 * Ecran "Ajouter un document medical" (F-CLI-13 du pack) : lit patientId
 * et/ou consultationId en query param (optionnels), transmis depuis le lien
 * "Ajouter un document" de la fiche patient (/app/medecin/patients/[id]) ou
 * d'une consultation precise. Le patient est choisi dans un selecteur peuple
 * par getPatientsAvecConsentement (meme source que
 * /app/medecin/examens/nouvelle), pre-selectionne automatiquement quand
 * consultationId ou patientId est fourni ; la consultation liee reste
 * facultative (RG-CLI-111) et se choisit parmi les consultations du medecin
 * connecte pour le patient selectionne (getConsultationsDuProfessionnel).
 */
export default async function NouveauDocumentPage({ searchParams }: NouveauDocumentPageProps) {
  const params = await searchParams;
  const patientIdParam = premiereValeur(params.patientId).trim();
  const consultationIdParam = premiereValeur(params.consultationId).trim();

  const [patients, consultations] = await Promise.all([
    getPatientsAvecConsentement(),
    getConsultationsDuProfessionnel(),
  ]);

  const consultationPreselectionnee = consultationIdParam
    ? (consultations.find((consultation) => consultation.id === consultationIdParam) ?? null)
    : null;

  const patientIdPreselectionne = consultationPreselectionnee?.patientId ?? patientIdParam;

  return (
    <div className="conteneur-page mx-auto flex flex-col gap-8 px-4 py-8 sm:px-6">
      <header className="flex flex-col gap-2">
        <LienRetour />
        <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-accent">
          Espace professionnel
        </p>
        <h1 className="text-[28px] font-black text-encre">Ajouter un document medical</h1>
        <p className="max-w-2xl text-[15px] text-encre-secondaire">
          Ajoutez un document au dossier d&apos;un patient : compte rendu,
          resultat, imagerie, courrier ou certificat.
        </p>
      </header>

      <FormulaireDocument
        patients={patients}
        consultations={consultations.map((consultation) => ({
          id: consultation.id,
          patientId: consultation.patientId,
          date: consultation.date,
          motif: consultation.motif,
        }))}
        patientIdPreselectionne={patientIdPreselectionne}
        consultationIdPreselectionnee={consultationPreselectionnee?.id ?? ""}
      />
    </div>
  );
}
