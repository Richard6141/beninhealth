import Link from "next/link";
import { ArrowLeft, ClipboardList } from "lucide-react";
import {
  getPrescriptionsDuProfessionnel,
  type PrescriptionResume,
} from "@/modules/prescription/actions";
import { Badge } from "@/components/ui/Badge";
import type { BadgeTone } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { cn } from "@/lib/cn";
import { ActionsPrescription } from "./ActionsPrescription";

/** Bouton de navigation stylise comme un Button primaire, rendu comme un lien unique. */
function LienNouvellePrescription() {
  return (
    <Link
      href="/app/medecin/prescriptions/nouvelle"
      className={cn(
        "inline-flex h-11 w-fit items-center justify-center gap-2 rounded-champ bg-accent px-4 text-[15px] font-semibold text-white transition-colors motion-reduce:transition-none hover:bg-accent-fonce",
        "focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2"
      )}
    >
      Nouvelle prescription
    </Link>
  );
}

function libelleStatut(statut: string): { texte: string; tone: BadgeTone } {
  const cle = statut.trim().toLowerCase();
  if (cle === "validee") return { texte: "Validée", tone: "info" };
  if (cle === "delivree_partiellement") return { texte: "Délivrée en partie", tone: "warning" };
  if (cle === "delivree") return { texte: "Délivrée", tone: "good" };
  if (cle === "annulee") return { texte: "Annulée", tone: "critical" };
  return { texte: statut, tone: "neutral" };
}

function formaterDateHeure(date: string): string {
  try {
    return new Date(date).toLocaleString("fr-FR", {
      dateStyle: "long",
      timeStyle: "short",
    });
  } catch {
    return date;
  }
}

function CartePrescription({ prescription }: { prescription: PrescriptionResume }) {
  const statut = libelleStatut(prescription.statut);

  return (
    <Card
      title={prescription.patientNomComplet ?? "Patient non precise"}
      description={prescription.consultationMotif}
      actions={<Badge tone={statut.tone}>{statut.texte}</Badge>}
    >
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-[14px] font-semibold text-encre">
            {formaterDateHeure(prescription.date)}
          </p>
          {prescription.patientIdentifiantSante ? (
            <span className="text-[13px] text-encre-attenuee">
              Identifiant sante : {prescription.patientIdentifiantSante}
            </span>
          ) : null}
        </div>

        <ul className="flex flex-col gap-2">
          {prescription.lignes.map((ligne, index) => (
            <li
              key={`${prescription.id}-${ligne.medicamentId}-${index}`}
              className="rounded-champ border border-bordure bg-plan px-3 py-2"
            >
              <p className="text-[14px] font-semibold text-encre">
                {ligne.medicamentNom} ({ligne.dosage}, {ligne.forme})
              </p>
              <p className="text-[13px] text-encre-secondaire">
                {ligne.posologie} : {ligne.quantite} unite(s), {ligne.dureeTraitementJours} jour(s)
              </p>
            </li>
          ))}
        </ul>

        {prescription.instructions ? (
          <p className="text-[13px] text-encre-secondaire">
            <span className="font-semibold text-encre">Instructions : </span>
            {prescription.instructions}
          </p>
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-bordure pt-3">
          <Link
            href={`/app/medecin/prescriptions/nouvelle?consultationId=${encodeURIComponent(prescription.consultationId)}`}
            className="text-[13px] font-semibold text-accent hover:underline"
          >
            Renouveler
          </Link>
          <ActionsPrescription
            prescriptionId={prescription.id}
            peutEtreAnnulee={prescription.peutEtreAnnulee}
            peutEtreArretee={prescription.peutEtreArretee}
          />
        </div>
      </div>
    </Card>
  );
}

/**
 * Ecran "Mes prescriptions" du professionnel (Phase 5) : historique complet
 * des prescriptions etablies par le professionnel connecte
 * (getPrescriptionsDuProfessionnel), deja triees par date decroissante cote
 * serveur.
 */
export default async function PrescriptionsProfessionnelPage() {
  const prescriptions = await getPrescriptionsDuProfessionnel();

  return (
    <div className="conteneur-page mx-auto flex flex-col gap-8 px-4 py-8 sm:px-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-2">
          <Link
            href="/app/medecin"
            className="inline-flex w-fit items-center gap-1 text-[13px] font-semibold text-accent hover:underline"
          >
            <ArrowLeft size={14} aria-hidden="true" />
            Retour au tableau de bord
          </Link>
          <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-accent">
            Espace professionnel
          </p>
          <h1 className="text-[28px] font-bold text-titre">Mes prescriptions</h1>
          <p className="max-w-2xl text-[15px] text-encre-secondaire">
            Historique des prescriptions que vous avez etablies, les plus
            recentes en premier.
          </p>
        </div>
        <LienNouvellePrescription />
      </header>

      {prescriptions.length === 0 ? (
        <Card>
          <div className="flex flex-col items-center gap-2 rounded-champ border border-dashed border-bordure-forte bg-plan px-4 py-8 text-center">
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-accent-clair text-accent">
              <ClipboardList size={20} aria-hidden="true" />
            </span>
            <p className="text-[14px] font-semibold text-encre">
              Aucune prescription enregistree
            </p>
            <p className="max-w-[36ch] text-[13px] text-encre-attenuee">
              Vous n&apos;avez pour le moment etabli aucune prescription.
              Cliquez sur « Nouvelle prescription » pour en creer une.
            </p>
          </div>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {prescriptions.map((prescription) => (
            <CartePrescription key={prescription.id} prescription={prescription} />
          ))}
        </div>
      )}
    </div>
  );
}
