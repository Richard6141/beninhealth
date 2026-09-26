import Link from "next/link";
import { ArrowLeft, FlaskConical } from "lucide-react";
import {
  getExamensDemandesParProfessionnel,
  type ExamenResume,
} from "@/modules/laboratoire/actions";
import { Badge } from "@/components/ui/Badge";
import type { BadgeTone } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { cn } from "@/lib/cn";
import { BoutonAnnonceResultat } from "./BoutonAnnonceResultat";
import { BoutonAnnulerExamen } from "./BoutonAnnulerExamen";

function libelleStatut(statut: string): { texte: string; tone: BadgeTone } {
  const cle = statut.trim().toLowerCase();
  if (cle === "demande") return { texte: "Demande", tone: "info" };
  // "resultat_saisi" et "correction_demandee" sont des etats internes au
  // laboratoire (F-LAB-04, principe des quatre yeux) : hors du laboratoire,
  // seul un examen "termine" a un resultat visible (RG-LAB-30), les deux
  // etats intermediaires restent donc affiches comme "En cours".
  if (cle === "en_cours" || cle === "resultat_saisi" || cle === "correction_demandee") {
    return { texte: "En cours", tone: "warning" };
  }
  if (cle === "termine") return { texte: "Termine", tone: "good" };
  if (cle === "annule") return { texte: "Annule", tone: "critical" };
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
function LienNouvelExamen() {
  return (
    <Link
      href="/app/medecin/examens/nouvelle"
      className={cn(
        "inline-flex h-11 w-fit items-center justify-center gap-2 rounded-champ bg-accent px-4 text-[15px] font-semibold text-white transition-colors motion-reduce:transition-none hover:bg-accent-fonce",
        "focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2"
      )}
    >
      Demander un examen
    </Link>
  );
}

function CarteExamen({ examen }: { examen: ExamenResume }) {
  const statut = libelleStatut(examen.statut);
  const statutNormalise = examen.statut.trim().toLowerCase();
  const estTermine = statutNormalise === "termine";
  const peutAnnuler = statutNormalise === "demande" || statutNormalise === "en_cours";

  return (
    <Card
      title={examen.patientNomComplet ?? "Patient non precise"}
      description={examen.typeExamen}
      actions={
        <div className="flex flex-wrap items-center justify-end gap-1.5">
          {examen.sensible ? <Badge tone="critical">Sensible</Badge> : null}
          <Badge tone={statut.tone}>{statut.texte}</Badge>
        </div>
      }
    >
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-[14px] font-semibold text-encre">
            {formaterDateHeure(examen.date)}
          </p>
          {examen.patientIdentifiantSante ? (
            <span className="text-[13px] text-encre-attenuee">
              Identifiant sante : {examen.patientIdentifiantSante}
            </span>
          ) : null}
        </div>

        <p className="text-[13px] text-encre-secondaire">
          <span className="font-semibold text-encre">Laboratoire : </span>
          {examen.laboratoireNom}
        </p>

        {estTermine ? (
          <div className="rounded-champ border border-bordure bg-plan px-3 py-2">
            <p className="text-[13px] font-semibold text-encre-secondaire">Resultat</p>
            <p className="text-[14px] text-encre">
              {examen.resultat || "Resultat transmis sans detail."}
            </p>
            {examen.dateResultat ? (
              <p className="mt-1 text-[12px] text-encre-attenuee">
                Resultat recu le {formaterDateHeure(examen.dateResultat)}
              </p>
            ) : null}
          </div>
        ) : (
          <p className="text-[13px] text-encre-attenuee">
            En attente de resultat de la part du laboratoire.
          </p>
        )}

        {estTermine && examen.sensible ? (
          examen.resultatAnnonceAuPatient ? (
            <p className="text-[13px] font-semibold text-bon">Resultat annonce au patient.</p>
          ) : (
            <BoutonAnnonceResultat examenId={examen.id} />
          )
        ) : null}

        {peutAnnuler ? <BoutonAnnulerExamen examenId={examen.id} /> : null}
      </div>
    </Card>
  );
}

/**
 * Ecran "Mes examens demandes" du professionnel (Phase 8) : historique
 * complet des demandes d'examen faites par le professionnel connecte
 * (getExamensDemandesParProfessionnel), les plus recentes en premier (deja
 * triees cote serveur, meme convention que les prescriptions et
 * consultations).
 */
export default async function ExamensProfessionnelPage() {
  const examens = await getExamensDemandesParProfessionnel();

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
          <h1 className="text-[28px] font-bold text-titre">Mes examens demandes</h1>
          <p className="max-w-2xl text-[15px] text-encre-secondaire">
            Historique des demandes d&apos;examen que vous avez adressees a un
            laboratoire, les plus recentes en premier.
          </p>
        </div>
        <LienNouvelExamen />
      </header>

      {examens.length === 0 ? (
        <Card>
          <div className="flex flex-col items-center gap-2 rounded-champ border border-dashed border-bordure-forte bg-plan px-4 py-8 text-center">
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-accent-clair text-accent">
              <FlaskConical size={20} aria-hidden="true" />
            </span>
            <p className="text-[14px] font-semibold text-encre">
              Aucun examen demande
            </p>
            <p className="max-w-[36ch] text-[13px] text-encre-attenuee">
              Vous n&apos;avez pour le moment demande aucun examen. Demarrez-en
              une depuis une consultation ou directement ci-dessus.
            </p>
          </div>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {examens.map((examen) => (
            <CarteExamen key={examen.id} examen={examen} />
          ))}
        </div>
      )}
    </div>
  );
}
