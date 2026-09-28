import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getConsultationsDuProfessionnel } from "@/modules/clinical/actions";
import { getConsultationPourExamen, listLaboratoires } from "@/modules/laboratoire/actions";
import { getReferentielExamensActifs } from "@/modules/administration/referentiel-examens";
import { Alert } from "@/components/ui/Alert";
import { FormulaireDemandeExamen } from "./FormulaireDemandeExamen";
import { SelecteurConsultation } from "./SelecteurConsultation";

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
 * Ecran "Demander un examen" (Phase 8) : lit consultationId en query param,
 * transmis soit depuis le lien "Demander un examen" d'une consultation
 * precise, soit depuis le bouton generique de /app/medecin/examens ou de la
 * fiche patient (sans id, affiche alors SelecteurConsultation, filtre sur
 * patientId si fourni - RG-LAB-01 du pack : une demande d'examen est
 * toujours liee a une consultation, jamais creee dans l'absolu, meme
 * principe que /app/medecin/prescriptions/nouvelle). Verifie via
 * getConsultationPourExamen que la consultation existe et appartient bien au
 * professionnel connecte (Zero Trust deja applique cote module, qui retourne
 * null si la consultation est introuvable ou ne lui appartient pas).
 */
export default async function NouvelExamenPage({ searchParams }: NouvelExamenPageProps) {
  const params = await searchParams;
  const consultationId = premiereValeur(params.consultationId).trim();
  const patientIdParam = premiereValeur(params.patientId).trim();

  if (!consultationId) {
    const toutesConsultations = await getConsultationsDuProfessionnel();
    const consultations = patientIdParam
      ? toutesConsultations.filter((consultation) => consultation.patientId === patientIdParam)
      : toutesConsultations;

    return (
      <div className="conteneur-page mx-auto flex flex-col gap-6 px-4 py-8 sm:px-6">
        <LienRetour />
        <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-accent">
          Espace professionnel
        </p>
        <h1 className="text-[28px] font-bold text-titre">Demander un examen</h1>
        {consultations.length > 0 ? (
          <SelecteurConsultation consultations={consultations} />
        ) : (
          <Alert level="info" title="Aucune consultation disponible">
            Vous n&apos;avez pour le moment aucune consultation enregistree
            pour ce patient. Demarrez-en une depuis l&apos;historique des
            consultations avant de pouvoir demander un examen.
          </Alert>
        )}
      </div>
    );
  }

  const [laboratoires, consultation, optionsExamensReferentiel] = await Promise.all([
    listLaboratoires(),
    getConsultationPourExamen(consultationId),
    getReferentielExamensActifs(),
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
        <h1 className="text-[28px] font-bold text-titre">Demander un examen</h1>
        <p className="max-w-2xl text-[15px] text-encre-secondaire">
          Adressez une demande d&apos;examen a un laboratoire partenaire pour
          un patient.
        </p>
      </header>

      <FormulaireDemandeExamen
        laboratoires={laboratoires}
        consultationId={consultationId}
        patientId={consultation.patientId}
        patientNomComplet={consultation.patientNomComplet}
        optionsExamensReferentiel={optionsExamensReferentiel}
      />
    </div>
  );
}
