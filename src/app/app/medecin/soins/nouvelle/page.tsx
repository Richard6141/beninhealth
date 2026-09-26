import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getResumePatient } from "@/modules/clinical/actions";
import { getPriseEnChargeNonRecuperee } from "@/modules/soins/actions";
import { Alert } from "@/components/ui/Alert";
import { FormulairePriseEnCharge } from "./FormulairePriseEnCharge";

interface NouvellePriseEnChargePageProps {
  searchParams: Promise<{ patientId?: string | string[]; rendezVousId?: string | string[] }>;
}

function premiereValeur(valeur: string | string[] | undefined): string {
  if (Array.isArray(valeur)) return valeur[0] ?? "";
  return valeur ?? "";
}

function LienRetour() {
  return (
    <Link
      href="/app/medecin/soins"
      className="inline-flex w-fit items-center gap-1 text-[13px] font-semibold text-accent hover:underline"
    >
      <ArrowLeft size={14} aria-hidden="true" />
      Retour a la liste d&apos;attente
    </Link>
  );
}

/**
 * Ecran "Nouvelle prise en charge" (F-CLI-12 du pack) : lit patientId (et
 * optionnellement rendezVousId) en query param, transmis depuis le lien
 * "Prendre en charge" de /app/medecin/soins. Le resume patient (nom,
 * identifiant sante, allergies, date de naissance) est obtenu via
 * getResumePatient (src/modules/clinical/actions.ts), deja garant du meme
 * controle Zero Trust (Consentement actif) que ce module doit lui-meme
 * appliquer a l'enregistrement.
 */
export default async function NouvellePriseEnChargePage({
  searchParams,
}: NouvellePriseEnChargePageProps) {
  const params = await searchParams;
  const patientId = premiereValeur(params.patientId).trim();
  const rendezVousId = premiereValeur(params.rendezVousId).trim();

  if (!patientId) {
    return (
      <div className="conteneur-page mx-auto flex flex-col gap-6 px-4 py-8 sm:px-6">
        <LienRetour />
        <Alert level="warning" title="Patient non precise">
          Choisissez un patient depuis la liste d&apos;attente pour commencer
          une prise en charge.
        </Alert>
      </div>
    );
  }

  const [resumePatient, priseEnChargeExistante] = await Promise.all([
    getResumePatient(patientId),
    getPriseEnChargeNonRecuperee(patientId),
  ]);

  if (!resumePatient) {
    return (
      <div className="conteneur-page mx-auto flex flex-col gap-6 px-4 py-8 sm:px-6">
        <LienRetour />
        <Alert level="warning" title="Patient introuvable ou consentement manquant">
          Ce patient est introuvable, ou ne vous a pas encore accorde de
          consentement actif.
        </Alert>
      </div>
    );
  }

  return (
    <div className="conteneur-page mx-auto flex flex-col gap-8 px-4 py-8 sm:px-6">
      <header className="flex flex-col gap-2">
        <LienRetour />
        <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-accent">
          Espace infirmier
        </p>
        <h1 className="text-[28px] font-bold text-titre">Prise en charge infirmiere</h1>
        <p className="max-w-2xl text-[15px] text-encre-secondaire">
          Constantes vitales, priorite de tri et note de soins avant la
          consultation medicale.
        </p>
      </header>

      {priseEnChargeExistante ? (
        <Alert level="info" title="Prise en charge deja enregistree">
          Une prise en charge du{" "}
          {new Date(priseEnChargeExistante.date).toLocaleString("fr-FR", {
            dateStyle: "long",
            timeStyle: "short",
          })}{" "}
          existe deja pour ce patient et n&apos;a pas encore ete recuperee par
          un medecin. Un nouvel enregistrement s&apos;ajoutera a son dossier.
        </Alert>
      ) : null}

      <FormulairePriseEnCharge
        patientId={resumePatient.id}
        patientNomComplet={resumePatient.nomComplet}
        patientIdentifiantSante={resumePatient.identifiantSante}
        patientAllergies={resumePatient.allergies}
        patientDateNaissance={resumePatient.dateNaissance}
        rendezVousId={rendezVousId}
      />
    </div>
  );
}
