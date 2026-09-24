import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Activity, Building2, ClipboardList, Stethoscope, Users } from "lucide-react";
import type { StatistiquesNationales } from "@/modules/analytics/actions";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { BoutonExportCSV } from "./BoutonExportCSV";
import { GraphiqueConsultationsMensuelles } from "./GraphiqueConsultationsMensuelles";
import { libelleStatutRendezVous, libelleTypeEtablissement } from "./lib";

function TuileStat({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon;
  label: string;
  value: ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 rounded-champ border border-bordure bg-plan px-4 py-3">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface text-accent">
        <Icon size={18} aria-hidden="true" />
      </span>
      <div className="flex flex-col">
        <span className="text-[12px] font-semibold uppercase tracking-[0.06em] text-encre-attenuee">
          {label}
        </span>
        <span className="chiffres text-[20px] font-black text-encre">{value}</span>
      </div>
    </div>
  );
}

export interface IndicateursNationauxProps {
  statistiques: StatistiquesNationales;
}

/**
 * Section "Indicateurs nationaux" (Phase 6, ecran ministere) : tuiles de
 * totaux, tendance mensuelle des consultations, repartition par
 * etablissement et repartition des rendez-vous par statut. Toutes les
 * donnees proviennent de getStatistiquesNationales() (module analytics,
 * agregations uniquement, jamais de donnee nominative).
 */
export function IndicateursNationaux({ statistiques }: IndicateursNationauxProps) {
  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <TuileStat icon={Building2} label="Etablissements" value={statistiques.totalEtablissements} />
        <TuileStat icon={Stethoscope} label="Professionnels" value={statistiques.totalProfessionnels} />
        <TuileStat icon={Users} label="Patients" value={statistiques.totalPatients} />
        <TuileStat icon={Activity} label="Consultations" value={statistiques.totalConsultations} />
        <TuileStat icon={ClipboardList} label="Prescriptions" value={statistiques.totalPrescriptions} />
      </div>

      <Card
        title="Consultations, tendance mensuelle"
        description="Nombre de consultations enregistrees sur les 6 derniers mois, tous etablissements confondus."
      >
        <GraphiqueConsultationsMensuelles donnees={statistiques.consultationsParMois} />
      </Card>

      <Card
        title="Rendez-vous par statut"
        description="Repartition nationale des rendez-vous selon leur statut actuel."
      >
        {statistiques.rendezVousParStatut.length === 0 ? (
          <p className="text-[13px] text-encre-attenuee">Aucun rendez-vous enregistre.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {statistiques.rendezVousParStatut.map((ligne) => {
              const { texte, tone } = libelleStatutRendezVous(ligne.statut);
              return (
                <Badge key={ligne.statut} tone={tone} className="chiffres">
                  {texte} : {ligne.total}
                </Badge>
              );
            })}
          </div>
        )}
      </Card>

      <Card
        title="Repartition par etablissement"
        description="Activite agregee de chaque etablissement sanitaire du reseau."
        actions={<BoutonExportCSV />}
      >
        {statistiques.repartitionParEtablissement.length === 0 ? (
          <p className="text-[13px] text-encre-attenuee">Aucun etablissement enregistre.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-[13px]">
              <thead>
                <tr className="border-b border-bordure text-encre-secondaire">
                  <th scope="col" className="py-2 pr-4 font-semibold">
                    Etablissement
                  </th>
                  <th scope="col" className="py-2 pr-4 font-semibold">
                    Localisation
                  </th>
                  <th scope="col" className="py-2 pr-4 font-semibold">
                    Type
                  </th>
                  <th scope="col" className="py-2 pr-4 text-right font-semibold">
                    Consultations
                  </th>
                  <th scope="col" className="py-2 pr-4 text-right font-semibold">
                    Rendez-vous
                  </th>
                  <th scope="col" className="py-2 text-right font-semibold">
                    Professionnels
                  </th>
                </tr>
              </thead>
              <tbody>
                {statistiques.repartitionParEtablissement.map((ligne) => (
                  <tr key={ligne.etablissementNom} className="border-b border-bordure last:border-0">
                    <td className="py-2 pr-4 font-semibold text-encre">{ligne.etablissementNom}</td>
                    <td className="py-2 pr-4 text-encre-secondaire">{ligne.localisation}</td>
                    <td className="py-2 pr-4 text-encre-secondaire">
                      {libelleTypeEtablissement(ligne.type)}
                    </td>
                    <td className="chiffres py-2 pr-4 text-right text-encre">
                      {ligne.totalConsultations}
                    </td>
                    <td className="chiffres py-2 pr-4 text-right text-encre">
                      {ligne.totalRendezVous}
                    </td>
                    <td className="chiffres py-2 text-right text-encre">
                      {ligne.nombreProfessionnels}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
