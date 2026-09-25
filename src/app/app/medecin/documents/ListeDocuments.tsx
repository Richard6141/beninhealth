import Link from "next/link";
import { Download, FileText } from "lucide-react";
import { getDocumentsDuPatient, type DocumentResume } from "@/modules/document/actions";
import { OPTIONS_TYPE_DOCUMENT } from "@/modules/document/types-documents";
import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { FormulaireRetraitDocument } from "./FormulaireRetraitDocument";

function libelleType(type: string): string {
  return OPTIONS_TYPE_DOCUMENT.find((option) => option.valeur === type)?.libelle ?? type;
}

function formaterDate(date: string): string {
  try {
    return new Date(date).toLocaleDateString("fr-FR", { dateStyle: "long" });
  } catch {
    return date;
  }
}

function formaterTaille(octets: number): string {
  const ko = octets / 1024;
  if (ko < 1024) return `${Math.max(1, Math.round(ko))} Ko`;
  return `${(ko / 1024).toFixed(1)} Mo`;
}

function CarteDocument({ document }: { document: DocumentResume }) {
  return (
    <Card
      title={document.titre}
      description={`${libelleType(document.type)} · ${formaterDate(document.dateDocument)}`}
      actions={
        <div className="flex flex-wrap items-center justify-end gap-1.5">
          {document.niveauConfidentialite === "sensible" ? <Badge tone="critical">Sensible</Badge> : null}
          {document.retirePourErreur ? <Badge tone="warning">Retire</Badge> : null}
        </div>
      }
    >
      <div className="flex flex-col gap-3">
        <p className="text-[13px] text-encre-secondaire">
          Ajoute par <span className="font-semibold text-encre">{document.auteurNomComplet}</span> le{" "}
          {formaterDate(document.dateCreation)}
        </p>
        <p className="text-[12px] text-encre-attenuee">
          {document.nomFichierOriginal} · {formaterTaille(document.tailleOctets)}
        </p>

        {document.retirePourErreur && document.motifRetrait ? (
          <p className="text-[13px] text-critique">
            Retire (ajoute par erreur) : {document.motifRetrait}
          </p>
        ) : null}

        <div className="flex flex-wrap items-center gap-3">
          <a
            href={`/api/documents/${document.id}`}
            className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-accent hover:underline"
          >
            <Download size={14} aria-hidden="true" />
            Telecharger
          </a>
          {document.estAuteur && !document.retirePourErreur ? (
            <FormulaireRetraitDocument documentId={document.id} />
          ) : null}
        </div>
      </div>
    </Card>
  );
}

export interface ListeDocumentsProps {
  patientId: string;
}

/**
 * Documents medicaux du patient (F-CLI-13 du pack), les plus recents en
 * premier (getDocumentsDuPatient) : Zero Trust, null si le medecin connecte
 * n'a pas (ou plus) de consentement actif pour ce patient. A integrer dans
 * /app/medecin/patients/[id] (hors perimetre de cet agent, ce fichier est
 * fourni pret a l'emploi pour cette integration).
 */
export async function ListeDocuments({ patientId }: ListeDocumentsProps) {
  const documents = await getDocumentsDuPatient(patientId);

  if (documents === null) {
    return (
      <section aria-labelledby="titre-documents" className="flex flex-col gap-4">
        <h2 id="titre-documents" className="text-[20px] font-bold text-encre">
          Documents medicaux
        </h2>
        <Alert level="critical" title="Documents inaccessibles">
          Vous n&apos;avez pas (ou plus) d&apos;acces au dossier de ce patient.
        </Alert>
      </section>
    );
  }

  return (
    <section aria-labelledby="titre-documents" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="titre-documents" className="text-[20px] font-bold text-encre">
          Documents medicaux
        </h2>
        <Link
          href={`/app/medecin/documents/nouveau?patientId=${encodeURIComponent(patientId)}`}
          className="text-[13px] font-semibold text-accent hover:underline"
        >
          Ajouter un document
        </Link>
      </div>

      {documents.length === 0 ? (
        <Card>
          <div className="flex flex-col items-center gap-2 rounded-champ border border-dashed border-bordure-forte bg-plan px-4 py-8 text-center">
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-accent-clair text-accent">
              <FileText size={20} aria-hidden="true" />
            </span>
            <p className="text-[14px] font-semibold text-encre">Aucun document</p>
            <p className="max-w-[36ch] text-[13px] text-encre-attenuee">
              Aucun document n&apos;a encore ete ajoute au dossier de ce
              patient.
            </p>
          </div>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {documents.map((document) => (
            <CarteDocument key={document.id} document={document} />
          ))}
        </div>
      )}
    </section>
  );
}
