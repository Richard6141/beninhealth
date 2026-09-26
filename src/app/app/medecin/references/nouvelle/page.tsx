import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getConsultationPourReference, listEtablissementsDestinationReference } from "@/modules/reference/actions";
import { FormulaireReference } from "./FormulaireReference";

interface NouvelleReferencePageProps {
  searchParams: Promise<{ consultationId?: string | string[] }>;
}

function premiereValeur(valeur: string | string[] | undefined): string {
  if (Array.isArray(valeur)) return valeur[0] ?? "";
  return valeur ?? "";
}

/**
 * Ecran "Creer une reference" (F-CLI-14) : lit consultationId en query param,
 * transmis depuis le lien "Creer une reference" du brouillon de consultation
 * (meme pattern que /app/medecin/examens/nouvelle et prescriptions/nouvelle).
 * getConsultationPourReference verifie que la consultation appartient bien
 * au professionnel connecte (Zero Trust) et renvoie null sinon, auquel cas
 * l'ecran affiche un message plutot qu'un formulaire pre-rempli au hasard.
 */
export default async function NouvelleReferencePage({ searchParams }: NouvelleReferencePageProps) {
  const params = await searchParams;
  const consultationId = premiereValeur(params.consultationId).trim();

  const [etablissements, consultation] = await Promise.all([
    listEtablissementsDestinationReference(),
    consultationId ? getConsultationPourReference(consultationId) : Promise.resolve(null),
  ]);

  return (
    <div className="conteneur-page mx-auto flex flex-col gap-8 px-4 py-8 sm:px-6">
      <header className="flex flex-col gap-2">
        <Link
          href="/app/medecin/consultations"
          className="inline-flex w-fit items-center gap-1 text-[13px] font-semibold text-accent hover:underline"
        >
          <ArrowLeft size={14} aria-hidden="true" />
          Retour a l&apos;historique des consultations
        </Link>
        <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-accent">
          Espace professionnel
        </p>
        <h1 className="text-[28px] font-bold text-titre">Creer une reference</h1>
        <p className="max-w-2xl text-[15px] text-encre-secondaire">
          Adressez ce patient a un etablissement de niveau superieur (specialiste).
          L&apos;etablissement destinataire aura acces au dossier pendant 30 jours.
        </p>
      </header>

      {!consultationId || !consultation ? (
        <p className="text-[14px] text-encre-secondaire">
          Cette reference doit etre creee depuis une consultation en cours :
          retournez a votre brouillon de consultation puis choisissez « Creer
          une reference ».
        </p>
      ) : (
        <FormulaireReference
          consultationId={consultationId}
          patientNomComplet={consultation.patientNomComplet}
          motifConsultation={consultation.motif}
          etablissements={etablissements}
        />
      )}
    </div>
  );
}
