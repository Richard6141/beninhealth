import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getConsultationsDuProfessionnel } from "@/modules/clinical/actions";
import {
  getConsultationPourPrescription,
  listMedicaments,
} from "@/modules/prescription/actions";
import { Alert } from "@/components/ui/Alert";
import { FormulairePrescription } from "./FormulairePrescription";
import { RenouvellementPrescription } from "./RenouvellementPrescription";
import { SelecteurConsultation } from "./SelecteurConsultation";

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
 * transmis soit depuis le lien "Prescrire" d'une consultation precise, soit
 * depuis le bouton "Nouvelle prescription" de /app/medecin/prescriptions
 * (sans id, affiche alors SelecteurConsultation - RG-PRE-01 du pack : une
 * prescription est toujours liee a une consultation, jamais creee dans
 * l'absolu). Verifie via getConsultationPourPrescription que la consultation
 * existe et appartient bien au professionnel connecte (Zero Trust deja
 * applique cote module, qui retourne null si la consultation est introuvable
 * ou ne lui appartient pas). Si une prescription existe deja pour cette
 * consultation, un bandeau d'avertissement est affiche au-dessus du
 * formulaire mais la creation d'une nouvelle prescription reste possible
 * (pas de blocage).
 */
export default async function NouvellePrescriptionPage({
  searchParams,
}: NouvellePrescriptionPageProps) {
  const params = await searchParams;
  const consultationId = premiereValeur(params.consultationId).trim();

  if (!consultationId) {
    const consultations = await getConsultationsDuProfessionnel();

    return (
      <div className="conteneur-page mx-auto flex flex-col gap-6 px-4 py-8 sm:px-6">
        <LienRetour />
        <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-accent">
          Espace professionnel
        </p>
        <h1 className="text-[28px] font-bold text-titre">Nouvelle prescription</h1>
        {consultations.length > 0 ? (
          <SelecteurConsultation consultations={consultations} />
        ) : (
          <Alert level="info" title="Aucune consultation disponible">
            Vous n&apos;avez pour le moment aucune consultation enregistrée.
            Démarrez-en une depuis l&apos;historique des consultations avant
            de pouvoir prescrire.
          </Alert>
        )}
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
        <h1 className="text-[28px] font-bold text-titre">Nouvelle prescription</h1>
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

      <RenouvellementPrescription
        consultationId={consultation.id}
        anciennesPrescriptions={consultation.anciennesPrescriptions}
      />

      <FormulairePrescription
        consultationId={consultation.id}
        medicaments={medicaments}
        patientAllergies={consultation.patientAllergies}
        patientDateNaissanceISO={consultation.patientDateNaissanceISO}
        patientSexe={consultation.patientSexe}
        patientGrossesseEnCours={consultation.patientGrossesseEnCours}
        patientTraitementsActifs={consultation.patientTraitementsActifs}
      />
    </div>
  );
}
