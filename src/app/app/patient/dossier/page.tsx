import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { ArrowLeft, Stethoscope, UserRound } from "lucide-react";
import { getMonDossierPatient } from "@/modules/patient/actions";
import { getMesInformationsDeclarees } from "@/modules/patient/informations-declarees";
import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { FormulaireDossier } from "./FormulaireDossier";
import { SectionChronologie } from "./SectionChronologie";
import { SectionInformationsDeclarees } from "./SectionInformationsDeclarees";

function formaterDate(date: string): string {
  try {
    return new Date(date).toLocaleDateString("fr-FR", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  } catch {
    return date;
  }
}

/** Titre de section avec icône, pour marquer clairement les trois regroupements
 * logiques du dossier : identité, santé, contacts. */
function TitreSection({
  icon: Icon,
  id,
  children,
}: {
  icon: LucideIcon;
  id: string;
  children: string;
}) {
  return (
    <h2 id={id} className="flex items-center gap-2 text-[20px] font-bold text-encre">
      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-accent-clair text-accent">
        <Icon size={16} aria-hidden="true" />
      </span>
      {children}
    </h2>
  );
}


interface DossierPatientPageProps {
  searchParams: Promise<{ type?: string; annee?: string; page?: string }>;
}

/**
 * Ecran "dossier santé" complet (Phase 3, Partie 4 §7 du cahier des charges) :
 * lecture détaillée du résumé santé (getMonDossierPatient), regroupée en
 * blocs logiques (identité, informations médicales déclarées, contacts
 * d'urgence, chronologie), chronologie unifiée (F-CIT-03 du pack :
 * consultations, ordonnances, résultats, vaccinations, documents fusionnés,
 * filtrés et paginés, voir SectionChronologie), puis formulaire d'édition
 * branché sur updatePatientProfileAction (groupe sanguin et grossesse
 * uniquement, voir FormulaireDossier.tsx).
 *
 * Allergies, antécédents, maladies chroniques et contacts d'urgence (F-CIT-04
 * du pack) sont désormais gérés individuellement (ajout/retrait, historique)
 * par SectionInformationsDeclarees, alimentée par getMesInformationsDeclarees.
 */
export default async function DossierPatientPage({ searchParams }: DossierPatientPageProps) {
  const [dossier, informationsDeclarees, searchParamsResolus] = await Promise.all([
    getMonDossierPatient(),
    getMesInformationsDeclarees(),
    searchParams,
  ]);

  return (
    <div className="conteneur-page mx-auto flex flex-col gap-8 px-4 py-8 sm:px-6">
      <header className="flex flex-col gap-2">
        <Link
          href="/app/patient"
          className="inline-flex w-fit items-center gap-1 text-[13px] font-semibold text-accent hover:underline"
        >
          <ArrowLeft size={14} aria-hidden="true" />
          Retour au tableau de bord
        </Link>
        <h1 className="text-[28px] font-bold text-titre">Mon dossier santé</h1>
        <p className="max-w-2xl text-[15px] text-encre-secondaire">
          Retrouvez et mettez à jour les informations de santé qui vous
          concernent.
        </p>
      </header>

      {dossier ? (
        <>
          <section aria-labelledby="titre-identite" className="flex flex-col gap-4">
            <TitreSection icon={UserRound} id="titre-identite">
              Identité et informations générales
            </TitreSection>
            <Card>
              <dl className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
                <div>
                  <dt className="text-[13px] font-semibold text-encre-secondaire">
                    Identifiant santé
                  </dt>
                  <dd className="mt-1.5 text-[15px] text-encre">
                    {dossier.identifiantSante}
                  </dd>
                </div>
                <div>
                  <dt className="text-[13px] font-semibold text-encre-secondaire">
                    Date de naissance
                  </dt>
                  <dd className="mt-1.5 text-[15px] text-encre">
                    {formaterDate(dossier.dateNaissance)}
                  </dd>
                </div>
                <div>
                  <dt className="text-[13px] font-semibold text-encre-secondaire">
                    Sexe
                  </dt>
                  <dd className="mt-1.5 text-[15px] text-encre">
                    {dossier.sexe === "M" ? "Homme" : "Femme"}
                  </dd>
                </div>
                <div>
                  <dt className="text-[13px] font-semibold text-encre-secondaire">
                    Groupe sanguin
                  </dt>
                  <dd className="mt-1.5">
                    <Badge tone="accent">{dossier.groupeSanguin || "Inconnu"}</Badge>
                  </dd>
                </div>
              </dl>
            </Card>
          </section>

          <section aria-labelledby="titre-sante" className="flex flex-col gap-4">
            <TitreSection icon={Stethoscope} id="titre-sante">
              Informations médicales et contacts d&apos;urgence
            </TitreSection>
            <SectionInformationsDeclarees informations={informationsDeclarees} />
          </section>
        </>
      ) : (
        <Alert level="info" title="Aucun dossier patient associé">
          Votre compte n&apos;est pas encore relié à un dossier patient. Cette
          page s&apos;activera dès qu&apos;un dossier sera créé.
        </Alert>
      )}

      <section aria-labelledby="titre-historique" className="flex flex-col gap-4">
        <TitreSection icon={Stethoscope} id="titre-historique">
          Historique
        </TitreSection>
        <SectionChronologie searchParams={searchParamsResolus} />
      </section>

      <section aria-labelledby="titre-edition" className="flex flex-col gap-4">
        <h2 id="titre-edition" className="text-[20px] font-bold text-encre">
          Mettre à jour mes informations
        </h2>
        <Card description="Ces informations sont utilisées par les professionnels de santé autorisés pour mieux vous prendre en charge.">
          <FormulaireDossier dossier={dossier} />
        </Card>
      </section>
    </div>
  );
}
