import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getPatientsAvecConsentement } from "@/modules/clinical/actions";
import { getReferentielVaccinsActifs } from "@/modules/administration/referentiel-vaccinal";
import { FormulaireVaccination } from "./FormulaireVaccination";

interface NouvelleVaccinationPageProps {
  searchParams: Promise<{ patientId?: string | string[] }>;
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
 * Ecran "Enregistrer une vaccination" (F-CLI-11 du pack), reserve aux roles
 * medecin et infirmier. Lit patientId en query param (optionnel), transmis
 * depuis un futur lien de la fiche patient ; sinon le patient est choisi
 * dans un selecteur peuple par getPatientsAvecConsentement (meme source que
 * /app/medecin/examens/nouvelle).
 */
export default async function NouvelleVaccinationPage({ searchParams }: NouvelleVaccinationPageProps) {
  const params = await searchParams;
  const patientIdParam = premiereValeur(params.patientId).trim();

  const [patients, optionsVaccinsReferentiel] = await Promise.all([
    getPatientsAvecConsentement(),
    getReferentielVaccinsActifs(),
  ]);

  return (
    <div className="conteneur-page mx-auto flex flex-col gap-8 px-4 py-8 sm:px-6">
      <header className="flex flex-col gap-2">
        <LienRetour />
        <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-accent">
          Espace professionnel
        </p>
        <h1 className="text-[28px] font-bold text-titre">Enregistrer une vaccination</h1>
        <p className="max-w-2xl text-[15px] text-encre-secondaire">
          Enregistrez une vaccination administree en etablissement pour un
          patient. Une fois enregistree, une vaccination est definitive
          (RG-CLI-100) : une erreur de saisie se corrige par un retrait
          motive, jamais par une modification.
        </p>
      </header>

      <FormulaireVaccination
        patients={patients}
        patientIdPreselectionne={patientIdParam}
        optionsVaccinsReferentiel={optionsVaccinsReferentiel}
      />
    </div>
  );
}
