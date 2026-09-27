import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, FlaskConical, Pill, Stethoscope } from "lucide-react";
import { getMaConsultationDetail } from "@/modules/patient/chronologie";
import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";

interface ConsultationDetailPageProps {
  params: Promise<{ id: string }>;
}

function formaterDate(date: string): string {
  try {
    return new Date(date).toLocaleDateString("fr-FR", { year: "numeric", month: "long", day: "numeric" });
  } catch {
    return date;
  }
}

function capitaliser(texte: string): string {
  return texte.length > 0 ? texte.charAt(0).toUpperCase() + texte.slice(1) : texte;
}

/**
 * Detail d'une consultation vu par le patient (F-CIT-03 du pack) : date,
 * etablissement, professionnel, motif, diagnostic en langage courant
 * (libelle CIM-10 simplifie, jamais le seul code), conclusion et conseils,
 * ordonnance liee, analyses demandees. Les observations cliniques reservees
 * (RG-CLI-54) ne sont jamais exposees : getMaConsultationDetail les renvoie
 * deja vides (voir ConsultationResume.observations dans clinical/actions.ts).
 *
 * getMaConsultationDetail() derive le patient de la session courante : une
 * consultation d'un autre patient (id devine) renvoie null ici, jamais son
 * contenu (Zero Trust).
 */
export default async function ConsultationDetailPage({ params }: ConsultationDetailPageProps) {
  const { id } = await params;
  const detail = await getMaConsultationDetail(id);

  if (!detail) {
    notFound();
  }

  const { consultation, prescriptions, examens } = detail;

  return (
    <div className="conteneur-page mx-auto flex flex-col gap-6 px-4 py-8 sm:px-6">
      <Link
        href="/app/patient/dossier"
        className="inline-flex w-fit items-center gap-1 text-[13px] font-semibold text-accent hover:underline"
      >
        <ArrowLeft size={14} aria-hidden="true" />
        Retour a mon dossier
      </Link>

      <header className="flex flex-col gap-2">
        <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-accent">Consultation</p>
        <h1 className="text-[28px] font-bold text-titre">{formaterDate(consultation.date)}</h1>
        <p className="max-w-2xl text-[15px] text-encre-secondaire">
          {consultation.motif}
          {consultation.professionnelNomComplet ? ` · Avec ${consultation.professionnelNomComplet}` : ""}
        </p>
      </header>

      {consultation.saisieParErreur ? (
        <Alert level="warning" title="Consultation retiree">
          {consultation.motifRetrait
            ? `Retiree : ${consultation.motifRetrait}`
            : "Cette consultation a ete retiree (saisie par erreur)."}
        </Alert>
      ) : null}

      <Card
        title={
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-accent-clair text-accent">
              <Stethoscope size={16} aria-hidden="true" />
            </span>
            Diagnostic et conclusion
          </div>
        }
      >
        <dl className="flex flex-col gap-4">
          {consultation.diagnosticPrincipalLibelle ? (
            <div>
              <dt className="text-[13px] font-semibold text-encre-secondaire">Diagnostic</dt>
              {/*
                Libelle deja en langage courant (referentiel CIM-10, voir
                administration/cim10-catalogue.ts) : jamais le seul code
                affiche seul au patient.
              */}
              <dd className="mt-1 text-[15px] text-encre">{consultation.diagnosticPrincipalLibelle}</dd>
            </div>
          ) : null}
          {consultation.diagnosticsSecondaires.length > 0 ? (
            <div>
              <dt className="text-[13px] font-semibold text-encre-secondaire">Autres diagnostics</dt>
              <dd className="mt-1 flex flex-wrap gap-1.5">
                {consultation.diagnosticsSecondaires.map((diagnostic) => (
                  <Badge key={diagnostic.code} tone="neutral">
                    {diagnostic.libelle}
                  </Badge>
                ))}
              </dd>
            </div>
          ) : null}
          {consultation.conclusion ? (
            <div>
              <dt className="text-[13px] font-semibold text-encre-secondaire">Conclusion et conseils</dt>
              <dd className="mt-1 text-[15px] text-encre">{consultation.conclusion}</dd>
            </div>
          ) : null}
          {!consultation.diagnosticPrincipalLibelle && !consultation.conclusion ? (
            <p className="text-[13px] text-encre-attenuee">
              Aucun diagnostic ni conclusion n&apos;a ete renseigne pour cette consultation.
            </p>
          ) : null}
        </dl>

        {consultation.addenda.length > 0 ? (
          <div className="mt-5 flex flex-col gap-2 border-t border-bordure pt-4">
            <p className="text-[13px] font-semibold text-encre-secondaire">Complements ajoutes ensuite</p>
            {consultation.addenda.map((addendum) => (
              <p key={addendum.id} className="text-[13px] text-encre">
                <span className="text-encre-attenuee">
                  {addendum.auteurNomComplet}, {formaterDate(addendum.date)} :
                </span>{" "}
                {addendum.contenu}
              </p>
            ))}
          </div>
        ) : null}
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card
          title={
            <div className="flex items-center gap-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-accent-clair text-accent">
                <Pill size={16} aria-hidden="true" />
              </span>
              Ordonnance liee
            </div>
          }
        >
          {prescriptions.length > 0 ? (
            <ul className="flex flex-col gap-3">
              {prescriptions.map((prescription) => (
                <li key={prescription.id} className="flex flex-col gap-1 border-b border-bordure pb-3 last:border-0 last:pb-0">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[14px] font-semibold text-encre">{prescription.numero}</span>
                    <Badge tone="neutral">{capitaliser(prescription.statut)}</Badge>
                  </div>
                  <Link
                    href="/app/patient/prescriptions"
                    className="text-[13px] font-semibold text-accent hover:underline"
                  >
                    Voir cette ordonnance
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[13px] text-encre-attenuee">Aucune ordonnance associee a cette consultation.</p>
          )}
        </Card>

        <Card
          title={
            <div className="flex items-center gap-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-accent-clair text-accent">
                <FlaskConical size={16} aria-hidden="true" />
              </span>
              Analyses demandees
            </div>
          }
        >
          {examens.length > 0 ? (
            <ul className="flex flex-col gap-3">
              {examens.map((examen) => (
                <li key={examen.id} className="flex flex-col gap-1 border-b border-bordure pb-3 last:border-0 last:pb-0">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[14px] font-semibold text-encre">{examen.typeExamen}</span>
                    <Badge tone="neutral">{capitaliser(examen.statut)}</Badge>
                  </div>
                  <Link href="/app/patient/examens" className="text-[13px] font-semibold text-accent hover:underline">
                    Voir cet examen
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[13px] text-encre-attenuee">Aucune analyse demandee lors de cette consultation.</p>
          )}
        </Card>
      </div>
    </div>
  );
}
