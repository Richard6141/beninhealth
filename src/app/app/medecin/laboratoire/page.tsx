import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import {
  getExamensPourLaboratoire,
  getIdProfessionnelCourant,
  type ExamenResume,
} from "@/modules/laboratoire/actions";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { FormulaireResultat } from "./FormulaireResultat";
import { SectionValidation } from "./FormulaireValidation";

function libelleStatut(statut: string): { texte: string; tone: BadgeTone } {
  const cle = statut.trim().toLowerCase();
  if (cle === "demande") return { texte: "Demande", tone: "warning" };
  if (cle === "en_cours") return { texte: "En cours", tone: "info" };
  if (cle === "correction_demandee") return { texte: "Correction demandee", tone: "critical" };
  if (cle === "resultat_saisi") return { texte: "En attente de validation", tone: "warning" };
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

function EnTeteExamen({ examen }: { examen: ExamenResume }) {
  return (
    <div className="flex flex-col gap-1">
      <p className="text-[13px] text-encre-attenuee">
        {examen.patientIdentifiantSante ?? "Identifiant sante non precise"}
      </p>
      <p className="text-[14px] font-semibold text-encre">
        {formaterDateHeure(examen.date)}
      </p>
      <p className="text-[13px] text-encre-secondaire">
        Demande par {examen.demandeurNomComplet ?? "Professionnel non precise"}
      </p>
    </div>
  );
}

function CarteExamenASaisir({ examen }: { examen: ExamenResume }) {
  const statut = libelleStatut(examen.statut);

  return (
    <Card
      className="border-vigilance bg-vigilance-clair"
      title={examen.patientNomComplet ?? "Patient non precise"}
      description={examen.typeExamen}
      actions={<Badge tone={statut.tone}>{statut.texte}</Badge>}
    >
      <div className="flex flex-col gap-3">
        <EnTeteExamen examen={examen} />
        <FormulaireResultat examen={examen} />
      </div>
    </Card>
  );
}

function CarteExamenValidation({
  examen,
  idProfessionnelCourant,
}: {
  examen: ExamenResume;
  idProfessionnelCourant: string | null;
}) {
  const statut = libelleStatut(examen.statut);
  const estSaisiParMoi =
    idProfessionnelCourant !== null && examen.saisiParId === idProfessionnelCourant;

  return (
    <Card
      title={examen.patientNomComplet ?? "Patient non precise"}
      description={examen.typeExamen}
      actions={<Badge tone={statut.tone}>{statut.texte}</Badge>}
    >
      <div className="flex flex-col gap-3">
        <EnTeteExamen examen={examen} />
        <div className="rounded-champ border border-bordure bg-plan px-3 py-2">
          <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-encre-attenuee">
            Resultat saisi
          </p>
          <p className="mt-1 whitespace-pre-wrap text-[14px] text-encre">
            {examen.resultat ?? "Aucun resultat enregistre."}
          </p>
          <p className="mt-1 text-[12px] text-encre-attenuee">
            Saisi par {examen.saisiParNomComplet ?? "un professionnel du laboratoire"}
            {examen.dateResultat ? ` le ${formaterDateHeure(examen.dateResultat)}` : ""}
          </p>
        </div>
        <SectionValidation examen={examen} estSaisiParMoi={estSaisiParMoi} />
      </div>
    </Card>
  );
}

function CarteExamenHistorique({ examen }: { examen: ExamenResume }) {
  const statut = libelleStatut(examen.statut);

  return (
    <Card
      title={examen.patientNomComplet ?? "Patient non precise"}
      description={examen.typeExamen}
      actions={<Badge tone={statut.tone}>{statut.texte}</Badge>}
    >
      <div className="flex flex-col gap-3">
        <EnTeteExamen examen={examen} />
        {examen.statut === "termine" ? (
          <div className="rounded-champ border border-bordure bg-plan px-3 py-2">
            <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-encre-attenuee">
              Resultat
            </p>
            <p className="mt-1 whitespace-pre-wrap text-[14px] text-encre">
              {examen.resultat ?? "Aucun resultat enregistre."}
            </p>
            {examen.dateResultat ? (
              <p className="mt-1 text-[12px] text-encre-attenuee">
                Saisi le {formaterDateHeure(examen.dateResultat)}
              </p>
            ) : null}
            {examen.saisiParNomComplet || examen.valideParNomComplet ? (
              <p className="mt-1 text-[12px] text-encre-attenuee">
                {examen.saisiParNomComplet ? `Saisi par ${examen.saisiParNomComplet}` : null}
                {examen.saisiParNomComplet && examen.valideParNomComplet ? ", " : null}
                {examen.valideParNomComplet ? `valide par ${examen.valideParNomComplet}` : null}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
    </Card>
  );
}

/**
 * Espace laboratoire (Phase 8, F-LAB-04 principe des quatre yeux) : saisie
 * puis validation des resultats d'examens medicaux. Reserve au role
 * "laboratoire" (les autres roles professionnels sont renvoyes vers le
 * tableau de bord generique) ; getExamensPourLaboratoire fait de toute facon
 * la meme verification cote Server Action (Zero Trust, pas de confiance dans
 * le seul routage cote ecran), a l'image de src/app/app/medecin/pharmacie/page.tsx.
 * Trois etats distincts, plus honnetes que l'ancien flux a une seule etape :
 * "A saisir" (rien encore soumis, ou renvoye pour correction), "En attente de
 * validation" (un resultat est saisi mais pas encore verrouille par un second
 * professionnel), "Historique" (verrouille ou annule).
 */
export default async function LaboratoirePage() {
  const session = await getSession();

  if (!session) {
    redirect("/connexion");
  }

  if (!session.roles.includes("laboratoire")) {
    redirect("/app/medecin");
  }

  const [examens, idProfessionnelCourant] = await Promise.all([
    getExamensPourLaboratoire(),
    getIdProfessionnelCourant(),
  ]);

  const aSaisir = examens.filter(
    (examen) =>
      examen.statut === "demande" ||
      examen.statut === "en_cours" ||
      examen.statut === "correction_demandee"
  );
  const enAttenteValidation = examens.filter((examen) => examen.statut === "resultat_saisi");
  const historique = examens.filter(
    (examen) => examen.statut === "termine" || examen.statut === "annule"
  );

  return (
    <div className="conteneur-page mx-auto flex flex-col gap-8 px-4 py-8 sm:px-6">
      <header className="flex flex-col gap-2">
        <Link
          href="/app/medecin"
          className="inline-flex w-fit items-center gap-1 text-[13px] font-semibold text-accent hover:underline"
        >
          <ArrowLeft size={14} aria-hidden="true" />
          Retour au tableau de bord
        </Link>
        <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-accent">
          Laboratoire
        </p>
        <h1 className="text-[28px] font-black text-encre">Examens medicaux</h1>
        <p className="max-w-2xl text-[15px] text-encre-secondaire">
          Tous les examens assignes a votre etablissement. Un resultat saisi
          doit etre valide par un autre professionnel du laboratoire avant de
          devenir visible du patient et du medecin demandeur (principe des
          quatre yeux).
        </p>
      </header>

      {examens.length === 0 ? (
        <Card>
          <p className="text-[13px] text-encre-attenuee">
            Aucun examen assigne a votre etablissement pour le moment.
          </p>
        </Card>
      ) : (
        <>
          <section aria-labelledby="titre-a-saisir" className="flex flex-col gap-4">
            <h2 id="titre-a-saisir" className="text-[20px] font-bold text-encre">
              A saisir
            </h2>
            {aSaisir.length === 0 ? (
              <Card>
                <p className="text-[13px] text-encre-attenuee">
                  Aucun examen en attente de saisie.
                </p>
              </Card>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                {aSaisir.map((examen) => (
                  <CarteExamenASaisir key={examen.id} examen={examen} />
                ))}
              </div>
            )}
          </section>

          <section aria-labelledby="titre-validation" className="flex flex-col gap-4">
            <h2 id="titre-validation" className="text-[20px] font-bold text-encre">
              En attente de validation
            </h2>
            {enAttenteValidation.length === 0 ? (
              <Card>
                <p className="text-[13px] text-encre-attenuee">
                  Aucun resultat en attente de validation.
                </p>
              </Card>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                {enAttenteValidation.map((examen) => (
                  <CarteExamenValidation
                    key={examen.id}
                    examen={examen}
                    idProfessionnelCourant={idProfessionnelCourant}
                  />
                ))}
              </div>
            )}
          </section>

          <section aria-labelledby="titre-historique" className="flex flex-col gap-4">
            <h2 id="titre-historique" className="text-[20px] font-bold text-encre">
              Historique
            </h2>
            {historique.length === 0 ? (
              <Card>
                <p className="text-[13px] text-encre-attenuee">
                  Aucun examen termine ou annule pour le moment.
                </p>
              </Card>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                {historique.map((examen) => (
                  <CarteExamenHistorique key={examen.id} examen={examen} />
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
