import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import {
  getConsultationPourPrescription,
  listMedicaments,
} from "@/modules/prescription/actions";
import { Alert } from "@/components/ui/Alert";
import { FormulairePrescription } from "./FormulairePrescription";

interface NouvellePrescriptionPageProps {
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
 * Ecran "Nouvelle prescription" (Phase 5) : lit consultationId en query param,
 * transmis depuis le lien "Prescrire" de /app/medecin/consultations. Verifie
 * via getConsultationPourPrescription que la consultation existe et
 * appartient bien au professionnel connecte (Zero Trust deja applique cote
 * module, qui retourne null si la consultation est introuvable ou ne lui
 * appartient pas). Si une prescription existe deja pour cette consultation,
 * un bandeau d'avertissement est affiche au-dessus du formulaire mais la
 * creation d'une nouvelle prescription reste possible (pas de blocage).
 */
export default async function NouvellePrescriptionPage({
  searchParams,
}: NouvellePrescriptionPageProps) {
  const params = await searchParams;
  const consultationId = premiereValeur(params.consultationId).trim();

  if (!consultationId) {
    return (
      <div className="conteneur-page mx-auto flex flex-col gap-6 px-4 py-8 sm:px-6">
        <LienRetour />
        <Alert level="critical" title="Consultation non precisee">
          Aucune consultation n&apos;a ete indiquee. Ouvrez cet ecran depuis le
          bouton « Prescrire » d&apos;une consultation dans votre historique.
        </Alert>
      </div>
    );
  }

  const [consultation, medicaments] = await Promise.all([
    getConsultationPourPrescription(consultationId),
    listMedicaments(),
  ]);

  if (!consultation) {
    return (
      <div className="conteneur-page mx-auto flex flex-col gap-6 px-4 py-8 sm:px-6">
        <LienRetour />
        <Alert level="critical" title="Consultation introuvable">
          Cette consultation est introuvable ou ne vous appartient pas.
          Verifiez le lien utilise ou repartez de l&apos;historique de vos
          consultations.
        </Alert>
      </div>
    );
  }

  return (
    <div className="conteneur-page mx-auto flex flex-col gap-8 px-4 py-8 sm:px-6">
      <header className="flex flex-col gap-2">
        <LienRetour />
        <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-accent">
          Espace professionnel
        </p>
        <h1 className="text-[28px] font-black text-encre">Nouvelle prescription</h1>
        <p className="max-w-2xl text-[15px] text-encre-secondaire">
          Consultation de {consultation.patientNomComplet} : {consultation.motif}
        </p>
      </header>

      {consultation.dejaPrescription ? (
        <Alert level="warning" title="Prescription deja existante">
          Une prescription existe deja pour cette consultation. Vous pouvez
          neanmoins en enregistrer une nouvelle si cela est necessaire.
        </Alert>
      ) : null}

      <FormulairePrescription
        consultationId={consultation.id}
        medicaments={medicaments}
      />
    </div>
  );
}
