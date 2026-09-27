import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import { Activity, CalendarClock, ShieldAlert, Stethoscope, Users } from "lucide-react";
import type { TableauBordEtablissement, PeriodeTableauBord } from "@/modules/pilotage/lecture";
import type { ValeurMasquee } from "@/modules/pilotage/masquage";
import { Card } from "@/components/ui/Card";
import { Tooltip } from "@/components/ui/Tooltip";
import { GraphiqueConsultationsQuotidiennes } from "./GraphiqueConsultationsQuotidiennes";

const PERIODES: { id: PeriodeTableauBord; label: string }[] = [
  { id: "aujourdhui", label: "Aujourd'hui" },
  { id: "7j", label: "7 jours" },
  { id: "30j", label: "30 jours" },
  { id: "mois", label: "Ce mois-ci" },
];

function texteValeurMasquee(valeur: ValeurMasquee): string {
  return valeur === "< 5" ? "< 5" : String(valeur);
}

function SelecteurPeriode({ periodeActive }: { periodeActive: PeriodeTableauBord }) {
  return (
    <div role="group" aria-label="Choisir la période" className="flex flex-wrap gap-1 rounded-champ border border-bordure bg-plan p-1">
      {PERIODES.map((periode) => {
        const selectionnee = periode.id === periodeActive;
        return (
          <Link
            key={periode.id}
            href={`/app/etablissement?periode=${periode.id}`}
            aria-current={selectionnee ? "true" : undefined}
            className={
              selectionnee
                ? "rounded-champ bg-accent px-3 py-1.5 text-[13px] font-semibold text-surface"
                : "rounded-champ px-3 py-1.5 text-[13px] font-semibold text-encre-secondaire hover:text-encre"
            }
          >
            {periode.label}
          </Link>
        );
      })}
      <span className="px-3 py-1.5 text-[13px] text-encre-attenuee" title="Pas encore disponible dans cette version">
        Personnalisée (bientôt)
      </span>
    </div>
  );
}

function TuilePilotage({
  icon: Icon,
  label,
  value,
  info,
}: {
  icon: LucideIcon;
  label: string;
  value: ReactNode;
  info?: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-champ border border-bordure bg-plan px-4 py-3">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent-clair text-accent">
        <Icon size={20} aria-hidden="true" />
      </span>
      <div className="flex min-w-0 flex-col">
        <span className="flex items-center gap-1 text-[12px] font-semibold uppercase tracking-[0.06em] text-encre-attenuee">
          {label}
          {info ? <Tooltip content={info} /> : null}
        </span>
        <span className="chiffres text-[22px] font-bold text-encre">{value}</span>
      </div>
    </div>
  );
}

/**
 * Section F-PIL-01 du pack (mise a jour du tableau de bord etablissement,
 * chapitre 14) : indicateurs de pilotage sources de AgregatQuotidien
 * (src/modules/pilotage/lecture.ts), en complement des statistiques Phase 6
 * deja affichees plus haut sur cet ecran (SectionIndicateurs, module
 * analytics). RG-PIL-02 (masquage petits effectifs) et RG-PIL-03 (masquage
 * complementaire) sont deja appliques cote serveur avant que ces donnees
 * n'atteignent ce composant : rien ici ne doit re-deriver une valeur exacte
 * a partir d'un "< 5".
 */
export function SectionPilotage({ tableauBord }: { tableauBord: TableauBordEtablissement }) {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SelecteurPeriode periodeActive={tableauBord.periode} />
        <Link
          href="/app/etablissement/audit/urgences"
          className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-accent hover:underline"
        >
          <ShieldAlert size={14} aria-hidden="true" />
          Accès d&apos;urgence réalisés dans l&apos;établissement
        </Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <TuilePilotage
          icon={Stethoscope}
          label="Consultations (IND-01)"
          value={texteValeurMasquee(tableauBord.consultations)}
          info="Nombre de consultations validées (hors saisies par erreur) sur la période sélectionnée."
        />
        <TuilePilotage
          icon={Users}
          label="Patients vus (IND-02)"
          value={texteValeurMasquee(tableauBord.patientsVus)}
          info="Patients distincts ayant eu au moins une consultation validée. Somme des comptes quotidiens : un patient vu deux jours différents peut être compté deux fois sur une période de plusieurs jours."
        />
        <TuilePilotage
          icon={CalendarClock}
          label="Rendez-vous du jour (IND-07)"
          value={
            tableauBord.rendezVousDuJour
              ? `${texteValeurMasquee(tableauBord.rendezVousDuJour.pris)} pris`
              : "0 pris"
          }
          info={
            tableauBord.rendezVousDuJour
              ? `Dont ${texteValeurMasquee(tableauBord.rendezVousDuJour.honores)} honorés, ${texteValeurMasquee(tableauBord.rendezVousDuJour.annules)} annulés et ${texteValeurMasquee(tableauBord.rendezVousDuJour.absences)} absences. Taux d'absence : ${tableauBord.tauxAbsenceRendezVous}.`
              : "Aucun rendez-vous prévu aujourd'hui."
          }
        />
        <TuilePilotage
          icon={Activity}
          label="Délai d'attente moyen (IND-11)"
          value={tableauBord.delaiAttenteMoyen}
          info="Du jour : arrivée à l'accueil (heure enregistrée) jusqu'au démarrage de la consultation. C'est une MOYENNE, pas la médiane du pack : une médiane ne s'additionne pas correctement sur plusieurs jours dans une architecture par agrégats quotidiens pré-calculés."
        />
      </div>

      <Card
        title="Consultations par jour"
        description="Évolution sur la période sélectionnée. Les jours de 1 à 4 consultations sont affichés « < 5 »."
      >
        <GraphiqueConsultationsQuotidiennes donnees={tableauBord.evolutionConsultations} />
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card
          title="Top des diagnostics (IND-03)"
          description="Consultations par groupe de maladies (classification par mots-clés, pas de codage CIM-10 dans ce dépôt)."
        >
          {tableauBord.topDiagnostics.length === 0 ? (
            <p className="text-[13px] text-encre-attenuee">Aucun diagnostic classifiable sur cette période.</p>
          ) : (
            <ol className="flex flex-col gap-2">
              {tableauBord.topDiagnostics.map((diagnostic, index) => (
                <li key={diagnostic.code} className="flex items-center justify-between gap-3 text-[13px]">
                  <span className="text-encre">
                    <span className="chiffres text-encre-attenuee">{index + 1}.</span> {diagnostic.libelle}
                  </span>
                  <span className="chiffres font-semibold text-encre">{texteValeurMasquee(diagnostic.valeur)}</span>
                </li>
              ))}
            </ol>
          )}
        </Card>

        <Card
          title="Activité par professionnel"
          description="Nombre d'actes de consultation validés sur la période, par professionnel."
        >
          {tableauBord.activiteParProfessionnel.length === 0 ? (
            <p className="text-[13px] text-encre-attenuee">Aucune consultation validée sur cette période.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {tableauBord.activiteParProfessionnel.map((ligne) => (
                <li key={ligne.professionnelId} className="flex items-center justify-between gap-3 text-[13px]">
                  <span className="text-encre">{ligne.nomComplet}</span>
                  <span className="chiffres font-semibold text-encre">{ligne.totalActes}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <p className="text-[12px] text-encre-attenuee">
        Ordonnances délivrées sous 30 jours : {tableauBord.tauxDelivranceOrdonnances}.{" "}
        {tableauBord.dateCalculPlusRecente
          ? `Dernière mise à jour des agrégats : ${tableauBord.dateCalculPlusRecente.toLocaleString("fr-FR")}.`
          : "Aucun agrégat calculé pour cette période pour le moment."}
      </p>
    </div>
  );
}
