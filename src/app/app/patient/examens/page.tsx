import Link from "next/link";
import { ArrowLeft, FlaskConical } from "lucide-react";
import { getMesExamens, type ExamenResume, type ResultatParametre } from "@/modules/laboratoire/actions";
import type { Indicateur } from "@/modules/laboratoire/referentiel-parametres-examens";
import { Badge } from "@/components/ui/Badge";
import type { BadgeTone } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";

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
  // RG-LAB-03 : demande non prise en charge par le laboratoire sous 30 jours.
  if (cle === "expire") return { texte: "Expiree", tone: "critical" };
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

/**
 * Libelle et pastille pour un indicateur de parametre structure (F-LAB-03),
 * purement descriptif ("Bas"/"Eleve"), sans interpretation medicale (RG-CIT-20 :
 * ni diagnostic ni gravite suggeree au-dela du terme lui-meme). L'indicateur
 * lui-meme est deja calcule et fige cote serveur, jamais recalcule ici.
 */
function libelleIndicateur(indicateur: Indicateur): { texte: string; tone: BadgeTone } {
  switch (indicateur) {
    case "LL":
      return { texte: "Tres bas", tone: "critical" };
    case "L":
      return { texte: "Bas", tone: "warning" };
    case "N":
      return { texte: "Normal", tone: "good" };
    case "H":
      return { texte: "Eleve", tone: "warning" };
    case "HH":
      return { texte: "Tres eleve", tone: "critical" };
  }
}

/** Une ligne de resultat structure (F-LAB-03/F-CIT-06) : valeur, unite, plage normale et indicateur visuel. */
function LigneParametreResultat({ parametre }: { parametre: ResultatParametre }) {
  const indicateur = libelleIndicateur(parametre.indicateur);
  const plage = parametre.plageNormaleAffichee;

  return (
    <div className="flex flex-col gap-1 rounded-champ border border-bordure bg-plan px-3 py-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[13px] font-semibold text-encre">{parametre.libelle}</p>
        <Badge tone={indicateur.tone}>{indicateur.texte}</Badge>
      </div>
      <p className="chiffres text-[15px] font-semibold text-encre">
        {parametre.valeur} <span className="text-[12px] font-normal text-encre-attenuee">{parametre.unite}</span>
      </p>
      {plage ? (
        <p className="text-[12px] text-encre-attenuee">
          Normale : {plage.min} a {plage.max} {parametre.unite}
        </p>
      ) : null}
      {parametre.referenceAdulteParDefaut ? (
        <p className="text-[12px] text-encre-attenuee">
          Reference adulte appliquee (valeur pediatrique non disponible pour ce parametre).
        </p>
      ) : null}
    </div>
  );
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
          {examen.numero ? <p className="chiffres text-[12px] text-encre-attenuee">{examen.numero}</p> : null}
        </div>

        <div className="flex flex-col gap-1 border-b border-bordure pb-4">
          <p className="text-[13px] font-semibold text-encre-secondaire">
            Laboratoire
          </p>
          <p className="text-[14px] text-encre">{examen.laboratoireNom}</p>
        </div>

        <div className="flex flex-col gap-1">
          <p className="text-[13px] font-semibold text-encre-secondaire">
            {examen.versionResultat > 1 ? `Resultat (version corrigee ${examen.versionResultat})` : "Resultat"}
          </p>
          {estTermine && examen.sensible && !examen.resultatAnnonceAuPatient ? (
            <p className="text-[13px] text-encre-attenuee">
              Un resultat vous sera communique par votre medecin.
            </p>
          ) : estTermine ? (
            <>
              {examen.resultatsParametres && examen.resultatsParametres.length > 0 ? (
                <div className="flex flex-col gap-2">
                  {examen.resultatsParametres.map((parametre) => (
                    <LigneParametreResultat key={parametre.code} parametre={parametre} />
                  ))}
                </div>
              ) : (
                <p className="text-[14px] text-encre">
                  {examen.resultat || "Resultat transmis sans detail."}
                </p>
              )}
              {examen.dateResultat ? (
                <p className="mt-1 text-[12px] text-encre-attenuee">
                  Recu le {formaterDateHeure(examen.dateResultat)}
                </p>
              ) : null}
              <p className="mt-2 text-[12px] font-semibold text-encre-secondaire">
                Discutez de ce resultat avec votre medecin.
              </p>
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
        <h1 className="text-[28px] font-bold text-titre">Mes examens</h1>
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
