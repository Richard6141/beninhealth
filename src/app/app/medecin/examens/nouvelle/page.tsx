import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { listLaboratoires } from "@/modules/laboratoire/actions";
import { FormulaireDemandeExamen } from "./FormulaireDemandeExamen";

interface NouvelExamenPageProps {
  searchParams: Promise<{ consultationId?: string | string[] }>;
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
 * Ecran "Demander un examen" (Phase 8) : lit consultationId en query param
 * (optionnel), transmis depuis le lien "Demander un examen" de
 * /app/medecin/consultations. Le contrat de demanderExamenAction (module
 * laboratoire) attend un patientId explicite dans le FormData, meme quand une
 * consultationId est fournie : ce module n'expose pas de fonction pour
 * resoudre automatiquement le patient d'une consultation (contrairement au
 * module prescription), donc pour cette premiere version, le champ
 * "Identifiant du patient" reste une saisie manuelle dans tous les cas,
 * avec un rappel explicite quand on arrive depuis une consultation.
 */
export default async function NouvelExamenPage({ searchParams }: NouvelExamenPageProps) {
  const params = await searchParams;
  const consultationId = premiereValeur(params.consultationId).trim();
  const laboratoires = await listLaboratoires();

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
        consultationId={consultationId}
      />
    </div>
  );
}
