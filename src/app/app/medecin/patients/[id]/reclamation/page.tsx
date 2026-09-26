import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getPatientPourReclamation } from "@/modules/identity/reclamation";
import { Alert } from "@/components/ui/Alert";
import { Card } from "@/components/ui/Card";
import { FormulaireGenerationCode } from "./FormulaireGenerationCode";

interface PageProps {
  params: Promise<{ id: string }>;
}

/**
 * Génère un code permettant au patient de réclamer son dossier "sans
 * compte" (F-AUTH-03 du pack). getPatientPourReclamation vérifie déjà
 * l'accès (consentement actif), jamais de donnée affichée sans lui (Zero
 * Trust).
 */
export default async function ReclamationPatientPage({ params }: PageProps) {
  const { id } = await params;
  const patient = await getPatientPourReclamation(id);

  return (
    <div className="conteneur-page mx-auto flex flex-col gap-8 px-4 py-8 sm:px-6">
      <Link
        href={`/app/medecin/patients/${id}`}
        className="inline-flex w-fit items-center gap-1 text-[13px] font-semibold text-accent hover:underline"
      >
        <ArrowLeft size={14} aria-hidden="true" />
        Retour au dossier
      </Link>

      <header className="flex flex-col gap-2">
        <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-accent">Dossier patient</p>
        <h1 className="text-[28px] font-bold text-titre">Réclamer le dossier</h1>
        <p className="max-w-2xl text-[15px] text-encre-secondaire">
          Générer un code permettant à ce patient d&apos;activer lui-même son compte.
        </p>
      </header>

      {patient === null ? (
        <Alert level="critical" title="Accès refusé">
          Vous n&apos;avez pas d&apos;accès autorisé à ce dossier.
        </Alert>
      ) : !patient.eligible ? (
        <Alert level="info" title="Dossier déjà réclamé">
          {patient.nomComplet} a déjà un compte actif : aucun code n&apos;est nécessaire.
        </Alert>
      ) : (
        <Card title={patient.nomComplet}>
          <FormulaireGenerationCode patientId={id} />
        </Card>
      )}
    </div>
  );
}
