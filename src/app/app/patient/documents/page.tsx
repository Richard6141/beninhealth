import Link from "next/link";
import { ArrowLeft, FileText } from "lucide-react";
import { getMesDocuments, type DocumentResume } from "@/modules/document/actions";
import { OPTIONS_TYPE_DOCUMENT } from "@/modules/document/types-documents";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { BoutonTelechargerDocument } from "./BoutonTelechargerDocument";

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
      actions={document.niveauConfidentialite === "sensible" ? <Badge tone="critical">Sensible</Badge> : undefined}
    >
      <div className="flex flex-col gap-3">
        <p className="text-[13px] text-encre-secondaire">
          Ajoute par <span className="font-semibold text-encre">{document.auteurNomComplet}</span> le{" "}
          {formaterDate(document.dateCreation)}
        </p>
        <p className="text-[12px] text-encre-attenuee">
          {document.nomFichierOriginal} · {formaterTaille(document.tailleOctets)}
        </p>

        {document.retirePourErreur ? (
          <p className="text-[13px] text-critique">
            Retire par son auteur (ajoute par erreur){document.motifRetrait ? ` : ${document.motifRetrait}` : "."}
          </p>
        ) : (
          <BoutonTelechargerDocument documentId={document.id} />
        )}
      </div>
    </Card>
  );
}

/**
 * Ecran dedie aux documents medicaux du patient connecte (F-CIT-06 du pack) :
 * compte rendu, resultat, imagerie, courrier, certificat. getMesDocuments()
 * ne renvoie que les documents du patient connecte lui-meme (son propre
 * dossier, aucun Consentement requis, meme principe que getMesExamens et
 * getMesPrescriptions). Le telechargement passe par un lien temporaire de 60
 * secondes genere a la demande (RG-CIT-50, BoutonTelechargerDocument.tsx),
 * jamais par un lien direct et permanent vers le fichier.
 *
 * Ce dossier "documents" existait deja partiellement : getMesDocuments() est
 * deja utilise par le tableau de bord (3 plus recents) et la chronologie du
 * dossier, mais aucun ecran dedie ne listait l'ensemble jusqu'ici.
 */
export default async function DocumentsPatientPage() {
  const documents = await getMesDocuments();

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
        <h1 className="text-[28px] font-bold text-titre">Mes documents</h1>
        <p className="max-w-2xl text-[15px] text-encre-secondaire">
          Comptes rendus, résultats, imageries, courriers et certificats
          ajoutés à votre dossier par vos professionnels de santé, du plus
          récent au plus ancien.
        </p>
      </header>

      {documents.length === 0 ? (
        <Card>
          <div className="flex flex-col items-center gap-2 rounded-champ border border-dashed border-bordure-forte bg-plan px-4 py-8 text-center">
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-accent-clair text-accent">
              <FileText size={20} aria-hidden="true" />
            </span>
            <p className="text-[14px] font-semibold text-encre">Aucun document</p>
            <p className="max-w-[36ch] text-[13px] text-encre-attenuee">
              Vos documents apparaîtront ici lorsqu&apos;un professionnel de
              santé en ajoutera un à votre dossier.
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
    </div>
  );
}
