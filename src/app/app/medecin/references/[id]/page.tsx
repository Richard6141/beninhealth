import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getDetailReference } from "@/modules/reference/actions";
import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { FormulaireContreReference } from "./FormulaireContreReference";

interface DetailReferencePageProps {
  params: Promise<{ id: string }>;
}

function formaterDate(dateISO: string): string {
  return new Date(dateISO).toLocaleDateString("fr-FR", { dateStyle: "long", timeStyle: "short" });
}

/**
 * Detail d'une reference (F-CLI-14) : motif, resume clinique, patient, puis
 * soit le formulaire de contre-reference (medecin de l'etablissement
 * destinataire, reference encore ouverte), soit la contre-reference deja
 * redigee. getDetailReference retourne null pour quiconque n'est ni le
 * medecin referent ni un medecin de l'etablissement destinataire (Zero
 * Trust).
 */
export default async function DetailReferencePage({ params }: DetailReferencePageProps) {
  const { id } = await params;
  const reference = await getDetailReference(id);

  if (!reference) {
    return (
      <div className="conteneur-page mx-auto flex flex-col gap-6 px-4 py-8 sm:px-6">
        <Link
          href="/app/medecin/references"
          className="inline-flex w-fit items-center gap-1 text-[13px] font-semibold text-accent hover:underline"
        >
          <ArrowLeft size={14} aria-hidden="true" />
          Retour a mes references
        </Link>
        <Alert level="critical" title="Reference inaccessible">
          Cette reference est introuvable, ou vous n&apos;y avez pas accès.
        </Alert>
      </div>
    );
  }

  return (
    <div className="conteneur-page mx-auto flex flex-col gap-8 px-4 py-8 sm:px-6">
      <Link
        href="/app/medecin/references"
        className="inline-flex w-fit items-center gap-1 text-[13px] font-semibold text-accent hover:underline"
      >
        <ArrowLeft size={14} aria-hidden="true" />
        Retour a mes references
      </Link>

      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-accent">
            Reference
          </p>
          {reference.niveauUrgence === "urgente" ? <Badge tone="critical">Urgente</Badge> : null}
          <Badge tone={reference.statut === "ouverte" ? "accent" : "neutral"}>
            {reference.statut === "ouverte" ? "Ouverte" : "Cloturee"}
          </Badge>
        </div>
        <h1 className="text-[28px] font-bold text-titre">{reference.patientNomComplet}</h1>
        <p className="text-[13px] text-encre-secondaire">
          {reference.patientIdentifiantSante} · {reference.patientAge} an
          {reference.patientAge > 1 ? "s" : ""} · {reference.patientSexe === "F" ? "Féminin" : "Masculin"}
        </p>
      </header>

      {reference.patientAllergies.length > 0 ? (
        <Alert level="critical" title="Allergies connues">
          {reference.patientAllergies.join(", ")}
        </Alert>
      ) : null}

      <Card
        title="Motif et resume clinique"
        description={`Envoyee par ${reference.medecinReferentNomComplet} (${reference.etablissementOrigineNom}) le ${formaterDate(reference.dateCreation)}, vers ${reference.etablissementDestinationNom}`}
      >
        <p className="text-[14px] font-semibold text-encre">{reference.motif}</p>
        <p className="mt-2 whitespace-pre-wrap text-[14px] text-encre-secondaire">{reference.resumeClinique}</p>
        <p className="mt-4 text-[13px] text-encre-attenuee">
          Consultation d&apos;origine : {reference.consultationMotif || "non precise"}
        </p>
      </Card>

      {reference.contreReferenceTexte ? (
        <Card
          title="Contre-reference"
          description={
            reference.contreReferenceAuteurNomComplet && reference.dateContreReference
              ? `Redigee par ${reference.contreReferenceAuteurNomComplet} le ${formaterDate(reference.dateContreReference)}`
              : undefined
          }
        >
          <p className="whitespace-pre-wrap text-[14px] text-encre">{reference.contreReferenceTexte}</p>
        </Card>
      ) : reference.peutRepondre ? (
        <FormulaireContreReference referenceId={reference.id} />
      ) : reference.statut === "ouverte" ? (
        <p className="text-[13px] text-encre-attenuee">
          En attente de reponse d&apos;un medecin de {reference.etablissementDestinationNom}.
        </p>
      ) : null}
    </div>
  );
}
