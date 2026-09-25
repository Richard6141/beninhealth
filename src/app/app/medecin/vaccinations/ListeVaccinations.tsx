import { Syringe } from "lucide-react";
import type { VaccinationResume } from "@/modules/vaccination/actions";
import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { FormulaireRetraitVaccination } from "./FormulaireRetraitVaccination";

function formaterDate(date: string): string {
  try {
    return new Date(date).toLocaleDateString("fr-FR", { dateStyle: "long" });
  } catch {
    return date;
  }
}

export interface ListeVaccinationsProps {
  vaccinations: VaccinationResume[];
}

/**
 * Historique des vaccinations d'un patient (F-CLI-11 du pack), du plus
 * recent au plus ancien (deja trie cote serveur par getVaccinationsDuPatient).
 * Composant pur, sans "use client" (utilisable depuis un ecran serveur comme
 * depuis un ecran client) : le retrait (RG-CLI-100) est isole dans
 * FormulaireRetraitVaccination, seul sous-composant interactif.
 */
export function ListeVaccinations({ vaccinations }: ListeVaccinationsProps) {
  if (vaccinations.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        <h2 className="text-[20px] font-bold text-encre">Historique des vaccinations</h2>
        <Card>
          <div className="flex flex-col items-center gap-2 rounded-champ border border-dashed border-bordure-forte bg-plan px-4 py-8 text-center">
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-accent-clair text-accent">
              <Syringe size={20} aria-hidden="true" />
            </span>
            <p className="text-[14px] font-semibold text-encre">Aucune vaccination enregistree</p>
            <p className="max-w-[36ch] text-[13px] text-encre-attenuee">
              Aucune vaccination n&apos;a encore ete enregistree pour ce patient.
            </p>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-[20px] font-bold text-encre">Historique des vaccinations</h2>
      <div className="grid gap-4 md:grid-cols-2">
        {vaccinations.map((vaccination) => (
          <Card
            key={vaccination.id}
            title={
              vaccination.saisieParErreur ? (
                <span className="line-through decoration-2">{vaccination.vaccin}</span>
              ) : (
                vaccination.vaccin
              )
            }
            description={`Dose ${vaccination.numeroDose}`}
            actions={
              vaccination.saisieParErreur ? (
                <Badge tone="critical">Retiree</Badge>
              ) : (
                <Badge tone="good">Enregistree</Badge>
              )
            }
          >
            <div className="flex flex-col gap-2">
              <p className="text-[14px] font-semibold text-encre">
                {formaterDate(vaccination.dateAdministration)}
              </p>
              <p className="text-[13px] text-encre-secondaire">
                <span className="font-semibold text-encre">Lot : </span>
                {vaccination.numeroLot}
              </p>
              <p className="text-[13px] text-encre-secondaire">
                <span className="font-semibold text-encre">Site : </span>
                {vaccination.siteInjection}
                {" · "}
                <span className="font-semibold text-encre">Voie : </span>
                {vaccination.voieLibelle}
              </p>
              <p className="text-[13px] text-encre-attenuee">
                {vaccination.professionnelNomComplet} · {vaccination.etablissementNom}
              </p>

              {vaccination.saisieParErreur && vaccination.motifRetrait ? (
                <Alert level="warning" title="Vaccination retiree (saisie par erreur)">
                  {vaccination.motifRetrait}
                </Alert>
              ) : null}

              {!vaccination.saisieParErreur ? (
                <div className="border-t border-bordure pt-3">
                  <FormulaireRetraitVaccination vaccinationId={vaccination.id} />
                </div>
              ) : null}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
