import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getSession } from "@/lib/session";
import { getDetailPrescriptionPourDelivrance } from "@/modules/prescription/actions";
import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import type { BadgeTone } from "@/components/ui/Badge";
import { FormulaireDelivrance } from "./FormulaireDelivrance";
import { HistoriqueDelivrances } from "./HistoriqueDelivrances";

interface DetailDelivrancePageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ jeton?: string | string[] }>;
}

const STATUTS_PERMETTANT_UNE_DELIVRANCE = ["validee", "delivree_partiellement"];

function libelleEtTonStatut(statut: string): { texte: string; tone: BadgeTone } {
  if (statut === "validee") return { texte: "À délivrer", tone: "info" };
  if (statut === "delivree_partiellement") return { texte: "Délivrée en partie", tone: "warning" };
  if (statut === "delivree") return { texte: "Délivrée", tone: "good" };
  if (statut === "annulee") return { texte: "Annulée", tone: "critical" };
  if (statut === "arretee") return { texte: "Arrêtée", tone: "critical" };
  return { texte: statut, tone: "neutral" };
}

function formaterDateHeure(date: string): string {
  try {
    return new Date(date).toLocaleString("fr-FR", { dateStyle: "long", timeStyle: "short" });
  } catch {
    return date;
  }
}

/**
 * Ecran de delivrance d'une prescription precise (F-PHA-03 du pack) : detail
 * ligne a ligne (quantite restante, substitution, motif), et historique des
 * delivrances deja enregistrees pour cette meme prescription (avec
 * annulation dans les 24h, RG-PHA-13). Reserve au role "pharmacien" ;
 * getDetailPrescriptionPourDelivrance fait de toute facon la meme
 * verification cote Server Action (Zero Trust).
 */
export default async function DetailDelivrancePage({ params, searchParams }: DetailDelivrancePageProps) {
  const { id } = await params;
  const { jeton: jetonBrut } = await searchParams;
  const jeton = Array.isArray(jetonBrut) ? jetonBrut[0] : jetonBrut;
  const session = await getSession();

  if (!session || !session.roles.includes("pharmacien")) {
    redirect("/app/medecin");
  }

  const detail = await getDetailPrescriptionPourDelivrance(id, jeton);

  if (!detail) {
    return (
      <div className="mx-auto flex w-full max-w-[1100px] flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
        <Link
          href="/app/medecin/pharmacie"
          className="inline-flex w-fit items-center gap-1 text-[13px] font-semibold text-accent hover:underline"
        >
          <ArrowLeft size={14} aria-hidden="true" />
          Retour aux prescriptions à délivrer
        </Link>
        <Alert level="critical" title="Prescription introuvable">
          Cette prescription est introuvable, ou ne vous a pas été présentée : retrouvez-la avec son numéro et
          l&apos;année de naissance du patient.
        </Alert>
      </div>
    );
  }

  const statut = libelleEtTonStatut(detail.statut);
  const peutDelivrer = STATUTS_PERMETTANT_UNE_DELIVRANCE.includes(detail.statut) && !detail.expiree;

  return (
    <div className="mx-auto flex w-full max-w-[1100px] flex-col gap-8 px-4 py-8 sm:px-6 lg:px-8">
      <Link
        href="/app/medecin/pharmacie"
        className="inline-flex w-fit items-center gap-1 text-[13px] font-semibold text-accent hover:underline"
      >
        <ArrowLeft size={14} aria-hidden="true" />
        Retour aux prescriptions à délivrer
      </Link>

      <header className="flex flex-col gap-2">
        <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-accent">
          Ordonnance {detail.numero}
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-[28px] font-bold text-titre">{detail.patientNomComplet}</h1>
          <Badge tone={statut.tone}>{statut.texte}</Badge>
        </div>
        <p className="text-[13px] text-encre-attenuee">
          {detail.patientAgeAnnees} ans · {detail.patientSexe === "F" ? "Femme" : detail.patientSexe === "M" ? "Homme" : detail.patientSexe}
        </p>
        <p className="text-[13px] text-encre-attenuee">
          Prescrite le {formaterDateHeure(detail.date)} par {detail.prescripteurNomComplet} ({detail.prescripteurEtablissementNom}) · valable
          jusqu&apos;au {new Date(detail.dateFinValiditeISO).toLocaleDateString("fr-FR", { dateStyle: "long" })}
        </p>
        {detail.instructions ? (
          <p className="max-w-2xl text-[14px] text-encre-secondaire">{detail.instructions}</p>
        ) : null}
      </header>

      {detail.patientAllergies.length > 0 ? (
        <Alert level="critical" title="Allergies médicamenteuses déclarées">
          {detail.patientAllergies.join(", ")}
        </Alert>
      ) : null}

      {peutDelivrer ? (
        <FormulaireDelivrance prescriptionId={detail.id} lignes={detail.lignes} jeton={jeton} />
      ) : (
        <Alert level="info" title="Aucune nouvelle délivrance possible">
          {detail.expiree
            ? "Cette ordonnance a dépassé sa durée de validité et ne peut plus être délivrée."
            : detail.statut === "delivree"
              ? "Cette prescription a déjà été entièrement délivrée."
              : detail.statut === "arretee"
                ? "Cette prescription a été arrêtée par le médecin et ne peut plus être délivrée."
                : "Cette prescription est annulée et ne peut pas être délivrée."}
        </Alert>
      )}

      <HistoriqueDelivrances delivrances={detail.delivrances} />
    </div>
  );
}
