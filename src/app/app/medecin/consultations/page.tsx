import Link from "next/link";
import { ArrowLeft, Stethoscope } from "lucide-react";
import {
  getConsultationsDuProfessionnel,
  type ConsultationResume,
} from "@/modules/clinical/actions";
import { Badge } from "@/components/ui/Badge";
import type { BadgeTone } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { cn } from "@/lib/cn";

function libelleStatut(statut: string): { texte: string; tone: BadgeTone } {
  const cle = statut.trim().toLowerCase();
  if (cle === "planifiee") return { texte: "Planifiee", tone: "info" };
  if (cle === "en_cours") return { texte: "En cours", tone: "warning" };
  if (cle === "terminee") return { texte: "Terminee", tone: "good" };
  if (cle === "annulee") return { texte: "Annulee", tone: "critical" };
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

/** Bouton de navigation stylise comme un Button primaire, rendu comme un lien unique. */
function LienNouvelleConsultation() {
  return (
    <Link
      href="/app/medecin/consultations/nouvelle"
      className={cn(
        "inline-flex h-11 w-fit items-center justify-center gap-2 rounded-champ bg-accent px-4 text-[15px] font-semibold text-white transition-colors motion-reduce:transition-none hover:bg-accent-fonce",
        "focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2"
      )}
    >
      Nouvelle consultation
    </Link>
  );
}

function CarteConsultation({ consultation }: { consultation: ConsultationResume }) {
  const statut = libelleStatut(consultation.statut);

  return (
    <Card
      title={consultation.patientNomComplet ?? "Patient non precise"}
      description={consultation.motif}
      actions={<Badge tone={statut.tone}>{statut.texte}</Badge>}
    >
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-[14px] font-semibold text-encre">
            {formaterDateHeure(consultation.date)}
          </p>
          {consultation.patientIdentifiantSante ? (
            <span className="text-[13px] text-encre-attenuee">
              Identifiant sante : {consultation.patientIdentifiantSante}
            </span>
          ) : null}
        </div>

        {consultation.symptomes.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {consultation.symptomes.map((symptome) => (
              <Badge key={symptome} tone="warning">
                {symptome}
              </Badge>
            ))}
          </div>
        ) : null}

        {consultation.constantes ? (
          <p className="text-[13px] text-encre-secondaire">
            <span className="font-semibold text-encre">Constantes : </span>
            {consultation.constantes}
          </p>
        ) : null}

        {consultation.observations ? (
          <p className="text-[13px] text-encre-secondaire">
            <span className="font-semibold text-encre">Observations : </span>
            {consultation.observations}
          </p>
        ) : null}

        <div className="rounded-champ border border-bordure bg-plan px-3 py-2">
          <p className="text-[13px] font-semibold text-encre-secondaire">Conclusion</p>
          <p className="text-[14px] text-encre">
            {consultation.conclusion || "Aucune conclusion renseignee."}
          </p>
        </div>
      </div>
    </Card>
  );
}

/**
 * Ecran "Mes consultations" du professionnel (Phase 4) : historique complet
 * des consultations realisees par le professionnel connecte
 * (getConsultationsDuProfessionnel), deja triees par date decroissante cote
 * serveur. Lien vers la creation d'une nouvelle consultation, qui proposera
 * alors le selecteur de patient (aucun patientId en query param).
 */
export default async function ConsultationsProfessionnelPage() {
  const consultations = await getConsultationsDuProfessionnel();

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
          <h1 className="text-[28px] font-black text-encre">Mes consultations</h1>
          <p className="max-w-2xl text-[15px] text-encre-secondaire">
            Historique des consultations que vous avez realisees, les plus
            recentes en premier.
          </p>
        </div>
        <LienNouvelleConsultation />
      </header>

      {consultations.length === 0 ? (
        <Card>
          <div className="flex flex-col items-center gap-2 rounded-champ border border-dashed border-bordure-forte bg-plan px-4 py-8 text-center">
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-accent-clair text-accent">
              <Stethoscope size={20} aria-hidden="true" />
            </span>
            <p className="text-[14px] font-semibold text-encre">
              Aucune consultation enregistree
            </p>
            <p className="max-w-[36ch] text-[13px] text-encre-attenuee">
              Vous n&apos;avez pour le moment realise aucune consultation.
              Demarrez-en une depuis un rendez-vous confirme ou directement
              ci-dessus.
            </p>
          </div>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {consultations.map((consultation) => (
            <CarteConsultation key={consultation.id} consultation={consultation} />
          ))}
        </div>
      )}
    </div>
  );
}
