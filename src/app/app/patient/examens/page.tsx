import Link from "next/link";
import { ArrowLeft, FlaskConical } from "lucide-react";
import { getMesExamens, type ExamenResume } from "@/modules/laboratoire/actions";
import { Badge } from "@/components/ui/Badge";
import type { BadgeTone } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";

function libelleStatut(statut: string): { texte: string; tone: BadgeTone } {
  const cle = statut.trim().toLowerCase();
  if (cle === "demande") return { texte: "Demande", tone: "info" };
  if (cle === "en_cours") return { texte: "En cours", tone: "warning" };
  if (cle === "termine") return { texte: "Termine", tone: "good" };
  if (cle === "annule") return { texte: "Annule", tone: "critical" };
  return { texte: statut, tone: "neutral" };
}

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

function CarteExamen({ examen }: { examen: ExamenResume }) {
  const statut = libelleStatut(examen.statut);
  const estTermine = examen.statut.trim().toLowerCase() === "termine";

  return (
    <Card
      title={formaterDate(examen.date)}
      description={
        examen.demandeurNomComplet
          ? `Demande par ${examen.demandeurNomComplet}`
          : "Medecin demandeur non precise"
      }
      actions={<Badge tone={statut.tone}>{statut.texte}</Badge>}
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1 border-b border-bordure pb-4">
          <p className="text-[13px] font-semibold text-encre-secondaire">
            Type d&apos;examen
          </p>
          <p className="text-[14px] text-encre">{examen.typeExamen}</p>
        </div>

        <div className="flex flex-col gap-1 border-b border-bordure pb-4">
          <p className="text-[13px] font-semibold text-encre-secondaire">
            Laboratoire
          </p>
          <p className="text-[14px] text-encre">{examen.laboratoireNom}</p>
        </div>

        <div className="flex flex-col gap-1">
          <p className="text-[13px] font-semibold text-encre-secondaire">
            Resultat
          </p>
          {estTermine ? (
            <>
              <p className="text-[14px] text-encre">
                {examen.resultat || "Resultat transmis sans detail."}
              </p>
              {examen.dateResultat ? (
                <p className="mt-1 text-[12px] text-encre-attenuee">
                  Recu le {formaterDateHeure(examen.dateResultat)}
                </p>
              ) : null}
            </>
          ) : (
            <p className="text-[13px] text-encre-attenuee">
              En attente de resultat du laboratoire.
            </p>
          )}
        </div>
      </div>
    </Card>
  );
}

/**
 * Historique complet des examens du patient connecte (Phase 8), du plus
 * recent au plus ancien (ordre deja garanti par getMesExamens()). Le
 * resultat n'est affiche que si le statut est "termine" : tant que l'examen
 * n'a pas ete rendu par le laboratoire, l'ecran l'indique honnetement plutot
 * que d'afficher une valeur vide ou simulee.
 */
export default async function ExamensPatientPage() {
  const examens = await getMesExamens();

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
        <h1 className="text-[28px] font-black text-encre">Mes examens</h1>
        <p className="max-w-2xl text-[15px] text-encre-secondaire">
          Historique complet de vos examens medicaux, du plus recent au plus
          ancien.
        </p>
      </header>

      {examens.length === 0 ? (
        <Card>
          <div className="flex flex-col items-center gap-2 rounded-champ border border-dashed border-bordure-forte bg-plan px-4 py-8 text-center">
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-accent-clair text-accent">
              <FlaskConical size={20} aria-hidden="true" />
            </span>
            <p className="text-[14px] font-semibold text-encre">
              Aucun examen enregistre
            </p>
            <p className="max-w-[30ch] text-[13px] text-encre-attenuee">
              Vos examens apparaitront ici apres une demande de votre medecin.
            </p>
          </div>
        </Card>
      ) : (
        <div className="flex flex-col gap-4">
          {examens.map((examen) => (
            <CarteExamen key={examen.id} examen={examen} />
          ))}
        </div>
      )}
    </div>
  );
}
