import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getBrouillonExistant, getPatientsAvecConsentement } from "@/modules/clinical/actions";
import { getPriseEnChargeNonRecuperee } from "@/modules/soins/actions";
import { Alert } from "@/components/ui/Alert";
import { FormulaireConsultation } from "./FormulaireConsultation";
import { SelecteurPatient } from "./SelecteurPatient";

interface NouvelleConsultationPageProps {
  searchParams: Promise<{
    patientId?: string | string[];
    rendezVousId?: string | string[];
  }>;
}

function premiereValeur(valeur: string | string[] | undefined): string {
  if (Array.isArray(valeur)) return valeur[0] ?? "";
  return valeur ?? "";
}

/**
 * Ecran "Nouvelle consultation" (Phase 4) : lit patientId et rendezVousId en
 * query params (optionnels, transmis depuis un rendez-vous confirme dans
 * /app/medecin/rendez-vous). Si patientId est absent, affiche d'abord un
 * selecteur de patient (SelecteurPatient, peuple par
 * getPatientsAvecConsentement) qui navigue vers cette meme page avec
 * patientId renseigne. Une fois le patient determine, affiche le formulaire
 * de consultation (FormulaireConsultation, enregistrerConsultationAction) :
 * un brouillon deja ouvert pour ce patient (RG-CLI-40) est detecte via
 * getBrouillonExistant et rouvert plutot que d'en recommencer un second.
 */
export default async function NouvelleConsultationPage({
  searchParams,
}: NouvelleConsultationPageProps) {
  const params = await searchParams;
  const patientId = premiereValeur(params.patientId).trim();
  const rendezVousId = premiereValeur(params.rendezVousId).trim();

  const patients = await getPatientsAvecConsentement();
  const patientSelectionne = patientId
    ? patients.find((patient) => patient.patientId === patientId)
    : undefined;
  // RG-CLI-40 du pack : un seul brouillon ouvert par patient - s'il en
  // existe deja un pour ce medecin et ce patient, l'ecran le rouvre plutot
  // que de laisser en commencer un second.
  const brouillonExistant = patientId ? await getBrouillonExistant(patientId) : null;
  // F-CLI-12 : propose les constantes prises par l'infirmier uniquement pour
  // une premiere saisie, jamais par-dessus un brouillon deja en cours.
  const priseEnCharge =
    patientId && !brouillonExistant ? await getPriseEnChargeNonRecuperee(patientId) : null;

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
        <h1 className="text-[28px] font-black text-encre">Nouvelle consultation</h1>
        <p className="max-w-2xl text-[15px] text-encre-secondaire">
          Choisissez un patient vous ayant accorde un acces a son dossier,
          puis enregistrez le compte-rendu de la consultation.
        </p>
      </header>

      {patientId ? (
        <>
          {brouillonExistant ? (
            <Alert level="info" title="Brouillon repris">
              Un brouillon de consultation pour ce patient était déjà en
              cours : vos saisies précédentes ont été rechargées.
            </Alert>
          ) : null}
          {priseEnCharge ? (
            <Alert level="info" title="Constantes reprises de la prise en charge infirmière">
              Priorité {priseEnCharge.prioriteTri}. Note de soins : {priseEnCharge.noteSoins}
            </Alert>
          ) : null}
          <FormulaireConsultation
            patientId={patientId}
            patientNomComplet={patientSelectionne?.nomComplet ?? "ce patient"}
            patientIdentifiantSante={patientSelectionne?.identifiantSante ?? ""}
            patientAllergies={patientSelectionne?.allergies ?? []}
            patientDateNaissance={patientSelectionne?.dateNaissance ?? null}
            rendezVousId={rendezVousId}
            brouillon={brouillonExistant}
            priseEnCharge={priseEnCharge}
          />
        </>
      ) : patients.length > 0 ? (
        <SelecteurPatient patients={patients} />
      ) : (
        <Alert level="info" title="Aucun patient disponible">
          Aucun patient ne vous a pour le moment accorde d&apos;acces a son
          dossier. Un patient doit vous autoriser l&apos;acces depuis son
          espace personnel avant qu&apos;une consultation puisse etre
          enregistree pour lui.
        </Alert>
      )}
    </div>
  );
}
