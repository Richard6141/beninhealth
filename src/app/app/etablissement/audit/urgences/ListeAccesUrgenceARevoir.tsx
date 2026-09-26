import { ShieldAlert } from "lucide-react";
import type { AccesUrgenceARevoir } from "@/modules/audit/actions";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { FormulaireRevue } from "./FormulaireRevue";

const LIBELLES_TYPE: Record<string, string> = {
  patient: "résumé du dossier",
  consultation: "consultation",
  prescription: "prescription",
  examen_medical: "examen",
  suivi_communautaire: "suivi communautaire",
  vaccination: "vaccination",
  document_medical: "document médical",
  prise_en_charge_infirmiere: "prise en charge infirmière",
};

function libelleType(type: string): string {
  return LIBELLES_TYPE[type] ?? type;
}

function formaterDateHeure(date: string): string {
  try {
    return new Date(date).toLocaleString("fr-FR", { dateStyle: "long", timeStyle: "short" });
  } catch {
    return date;
  }
}

/**
 * Liste des acces d'urgence a revoir (F-AUD-02 du pack), le plus ancien en
 * premier, en rouge au-dela de 7 jours (RG-AUD, deja calcule cote serveur
 * dans getAccesUrgenceARevoir). Pour chaque acces : professionnel,
 * etablissement, duree, motif et justification, elements consultes pendant
 * l'acces (type et date, jamais le contenu), et un indice de legitimite
 * (une consultation a-t-elle ete creee pendant l'acces).
 */
export function ListeAccesUrgenceARevoir({ acces }: { acces: AccesUrgenceARevoir[] }) {
  if (acces.length === 0) {
    return (
      <Card>
        <div className="flex flex-col items-center gap-2 rounded-champ border border-dashed border-bordure-forte bg-plan px-4 py-10 text-center">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-accent-clair text-accent">
            <ShieldAlert size={20} aria-hidden="true" />
          </span>
          <p className="text-[14px] font-semibold text-encre">Aucun accès d&apos;urgence à revoir</p>
          <p className="max-w-[40ch] text-[13px] text-encre-attenuee">
            Tous les accès d&apos;urgence déclenchés ont déjà été revus.
          </p>
        </div>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {acces.map((entree) => (
        <Card
          key={entree.journalAuditId}
          className={entree.urgent ? "border-critique bg-critique-clair" : undefined}
        >
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="flex flex-col gap-1">
                <p className="text-[15px] font-bold text-encre">
                  {entree.professionnelNomComplet}
                  {entree.professionnelRole ? (
                    <span className="font-normal text-encre-secondaire"> · {entree.professionnelRole}</span>
                  ) : null}
                </p>
                {entree.etablissementNom ? (
                  <p className="text-[13px] text-encre-secondaire">{entree.etablissementNom}</p>
                ) : null}
                <p className="text-[13px] text-encre-secondaire">
                  Patient : <span className="font-semibold text-encre">{entree.patientNomComplet}</span> (
                  {entree.patientIdentifiantSante})
                </p>
              </div>
              <div className="flex flex-col items-end gap-1.5">
                {entree.urgent ? (
                  <span className="flex items-center gap-1 rounded-champ bg-critique px-2 py-1 text-[11px] font-bold uppercase tracking-[0.05em] text-white">
                    <ShieldAlert size={12} aria-hidden="true" />
                    {entree.ancienEnJours} jours sans revue
                  </span>
                ) : null}
                <span className="text-[12.5px] text-encre-attenuee">
                  {formaterDateHeure(entree.date)} · {entree.dureeEnHeures}h
                </span>
              </div>
            </div>

            <p className="text-[13px] text-encre">{entree.motifEtJustification}</p>

            <div className="flex flex-wrap items-center gap-2">
              {entree.consultationCreeePendantAcces ? (
                <Badge tone="good">Consultation créée pendant l&apos;accès</Badge>
              ) : (
                <Badge tone="warning">Aucune consultation créée pendant l&apos;accès</Badge>
              )}
            </div>

            {entree.elementsConsultes.length > 0 ? (
              <div className="rounded-champ border border-bordure bg-plan p-3">
                <p className="mb-1.5 text-[12px] font-semibold uppercase tracking-[0.05em] text-encre-attenuee">
                  Éléments consultés pendant l&apos;accès
                </p>
                <ul className="flex flex-col gap-1">
                  {entree.elementsConsultes.map((element, index) => (
                    <li key={index} className="text-[13px] text-encre-secondaire">
                      {libelleType(element.type)} : {formaterDateHeure(element.date)}
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="text-[13px] text-encre-attenuee">Aucun autre élément consulté pendant l&apos;accès.</p>
            )}

            <FormulaireRevue journalAuditId={entree.journalAuditId} />
          </div>
        </Card>
      ))}
    </div>
  );
}
