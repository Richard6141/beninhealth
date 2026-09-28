import type { ReactNode } from "react";
import type { ExamenResume } from "@/modules/laboratoire/actions";
import type { Indicateur } from "@/modules/laboratoire/referentiel-parametres-examens";
import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import type { BadgeTone } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { SectionValidation } from "../FormulaireValidation";

function formaterDateHeure(date: string): string {
  try {
    return new Date(date).toLocaleString("fr-FR", { dateStyle: "long", timeStyle: "short" });
  } catch {
    return date;
  }
}

/** Libelle descriptif de l'indicateur deja calcule et fige cote serveur (F-LAB-03), jamais recalcule ici. */
function libelleIndicateur(indicateur: Indicateur): { texte: string; tone: BadgeTone } {
  switch (indicateur) {
    case "LL":
      return { texte: "Critique bas (LL)", tone: "critical" };
    case "L":
      return { texte: "Bas (L)", tone: "warning" };
    case "N":
      return { texte: "Normal (N)", tone: "good" };
    case "H":
      return { texte: "Eleve (H)", tone: "warning" };
    case "HH":
      return { texte: "Critique haut (HH)", tone: "critical" };
  }
}

function Bloc({ titre, children }: { titre: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5 rounded-champ border border-bordure bg-plan px-4 py-3">
      <span className="text-[12px] font-semibold uppercase tracking-[0.06em] text-encre-attenuee">{titre}</span>
      {children}
    </div>
  );
}

/**
 * Un resultat en attente de validation, tel que le voit le valideur (F-LAB-04
 * du pack) : valeurs et indicateurs, antecedents du patient pour cet examen
 * dans ce laboratoire, versions validees precedentes s'il s'agit d'une
 * correction (RG-ROL-31), puis les controles "Valider" / "Renvoyer pour
 * correction" (SectionValidation, reutilisee telle quelle, qui masque ces
 * controles au professionnel ayant lui-meme saisi le resultat ; le serveur
 * reste seul juge, LAB_SELF_VALIDATION).
 */
export function CarteValidation({ examen, estSaisiParMoi }: { examen: ExamenResume; estSaisiParMoi: boolean }) {
  const parametres = examen.resultatsParametres ?? [];

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="text-[16px] font-bold text-encre">{examen.patientNomComplet ?? "Patient non précisé"}</span>
          {examen.patientIdentifiantSante ? (
            <span className="text-[12px] text-encre-attenuee">{examen.patientIdentifiantSante}</span>
          ) : null}
          <span className="text-[14px] text-encre">
            {examen.typeExamen}
            {examen.numero ? <span className="chiffres text-encre-attenuee">{` (${examen.numero})`}</span> : null}
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          {examen.niveauUrgence === "urgent" ? <Badge tone="critical">Urgent</Badge> : null}
          {examen.versionResultat > 1 ? <Badge tone="info">{`Correction, version ${examen.versionResultat}`}</Badge> : null}
          {examen.sensible ? <Badge tone="warning">Annonce requise</Badge> : null}
        </div>
      </div>

      <p className="text-[13px] text-encre-secondaire">
        {examen.saisiParNomComplet ? `Saisi par ${examen.saisiParNomComplet}` : "Saisi par un professionnel du laboratoire"}
        {examen.dateResultat ? ` le ${formaterDateHeure(examen.dateResultat)}` : ""}
        {examen.demandeurNomComplet ? `, demandé par ${examen.demandeurNomComplet}` : ""}
      </p>

      {examen.commentaireValidation ? (
        <Alert level="info" title="Resaisie après renvoi ou correction">
          {examen.commentaireValidation}
        </Alert>
      ) : null}

      {parametres.length > 0 ? (
        <Bloc titre="Valeurs">
          <ul className="flex flex-col gap-2">
            {parametres.map((parametre) => {
              const indicateur = libelleIndicateur(parametre.indicateur);
              return (
                <li key={parametre.code} className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[13px] text-encre">
                    {parametre.libelle} :{" "}
                    <span className="chiffres font-semibold">{parametre.valeur}</span> {parametre.unite}
                    {parametre.referenceAdulteParDefaut ? (
                      <span className="text-[12px] text-encre-attenuee"> (référence adulte)</span>
                    ) : null}
                  </span>
                  <Badge tone={indicateur.tone}>{indicateur.texte}</Badge>
                </li>
              );
            })}
          </ul>
        </Bloc>
      ) : (
        <Bloc titre="Résultat">
          <span className="whitespace-pre-wrap text-[14px] text-encre">{examen.resultat ?? "Aucun résultat saisi."}</span>
        </Bloc>
      )}

      <Bloc titre="Antériorités du patient pour cet examen">
        {examen.anterieurs && examen.anterieurs.length > 0 ? (
          <ul className="flex flex-col gap-2">
            {examen.anterieurs.map((anterieur) => (
              <li key={anterieur.date} className="text-[13px] text-encre-secondaire">
                <span className="chiffres font-semibold text-encre">{formaterDateHeure(anterieur.date)}</span>
                {anterieur.resultat ? (
                  <span className="block whitespace-pre-wrap text-encre-attenuee">{anterieur.resultat}</span>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <span className="text-[13px] text-encre-attenuee">Aucun résultat validé antérieur dans ce laboratoire.</span>
        )}
      </Bloc>

      {examen.versionsPrecedentes && examen.versionsPrecedentes.length > 0 ? (
        <Bloc titre="Versions validées précédentes (archivées, non modifiables)">
          <ul className="flex flex-col gap-2">
            {examen.versionsPrecedentes.map((version) => (
              <li key={version.numero} className="text-[13px] text-encre-secondaire">
                <span className="font-semibold text-encre">Version {version.numero}</span>
                {` (corrigée le ${formaterDateHeure(version.dateCorrection)}) : ${version.motifCorrection}`}
                {version.resultat ? (
                  <span className="block whitespace-pre-wrap text-encre-attenuee">{version.resultat}</span>
                ) : null}
              </li>
            ))}
          </ul>
        </Bloc>
      ) : null}

      <div className="border-t border-bordure pt-4">
        <SectionValidation examen={examen} estSaisiParMoi={estSaisiParMoi} />
      </div>
    </Card>
  );
}
