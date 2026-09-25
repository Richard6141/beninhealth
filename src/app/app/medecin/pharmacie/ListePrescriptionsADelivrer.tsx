"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Pill, Search, UserRound } from "lucide-react";
import type { PrescriptionResume } from "@/modules/prescription/actions";
import { Badge } from "@/components/ui/Badge";
import type { BadgeTone } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { cn } from "@/lib/cn";

function libelleStatut(statut: string): { texte: string; tone: BadgeTone } {
  return statut === "delivree_partiellement"
    ? { texte: "Délivrée en partie", tone: "warning" }
    : { texte: "En attente", tone: "info" };
}

function formaterDateHeure(date: string): string {
  try {
    return new Date(date).toLocaleString("fr-FR", { dateStyle: "long", timeStyle: "short" });
  } catch {
    return date;
  }
}

type FiltreStatut = "tous" | "attente" | "partielle";

const OPTIONS_FILTRE_STATUT: { id: FiltreStatut; label: string }[] = [
  { id: "tous", label: "Tous" },
  { id: "attente", label: "En attente" },
  { id: "partielle", label: "Délivrée en partie" },
];

function correspondAuFiltreStatut(prescription: PrescriptionResume, filtre: FiltreStatut): boolean {
  if (filtre === "tous") return true;
  if (filtre === "partielle") return prescription.statut === "delivree_partiellement";
  return prescription.statut !== "delivree_partiellement";
}

const styleEnTete =
  "px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-encre-attenuee";
const styleCellule = "px-4 py-3.5 align-middle border-t border-bordure";

function EtatVideFiltre() {
  return (
    <div className="flex flex-col items-center gap-2 px-4 py-12 text-center">
      <span className="flex h-11 w-11 items-center justify-center rounded-full bg-surface-appui text-encre-attenuee">
        <Pill size={20} aria-hidden="true" />
      </span>
      <p className="text-[14px] font-semibold text-encre">Aucune prescription</p>
      <p className="max-w-[30ch] text-[13px] text-encre-attenuee">
        Aucune prescription ne correspond à ce filtre pour le moment.
      </p>
    </div>
  );
}

/**
 * Liste des prescriptions en attente de délivrance : un bouton segmenté
 * (statut) et une recherche en direct filtrent un tableau unique, meme
 * pattern que les tableaux de rendez-vous et d'examens laboratoire. Chaque
 * ligne mene directement a l'ecran dedie /app/medecin/pharmacie/[id]
 * (delivrance ligne a ligne, F-PHA-03) : pas de modale de details ici, la
 * page dediee joue deja ce role, plus adaptee a la complexite du formulaire
 * de delivrance qu'une modale.
 */
export function ListePrescriptionsADelivrer({
  prescriptions,
}: {
  prescriptions: PrescriptionResume[];
}) {
  const [filtreStatut, setFiltreStatut] = useState<FiltreStatut>("tous");
  const [recherche, setRecherche] = useState("");

  const compteurs = useMemo(
    () => ({
      tous: prescriptions.length,
      attente: prescriptions.filter((p) => p.statut !== "delivree_partiellement").length,
      partielle: prescriptions.filter((p) => p.statut === "delivree_partiellement").length,
    }),
    [prescriptions]
  );

  const prescriptionsFiltrees = useMemo(() => {
    const terme = recherche.trim().toLowerCase();

    return prescriptions.filter((prescription) => {
      if (!correspondAuFiltreStatut(prescription, filtreStatut)) return false;
      if (!terme) return true;

      return (
        (prescription.patientNomComplet ?? "").toLowerCase().includes(terme) ||
        (prescription.patientIdentifiantSante ?? "").toLowerCase().includes(terme)
      );
    });
  }, [prescriptions, filtreStatut, recherche]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div
          role="radiogroup"
          aria-label="Filtrer par statut"
          className="inline-flex w-fit flex-wrap items-center gap-1 rounded-champ bg-surface-appui p-1"
        >
          {OPTIONS_FILTRE_STATUT.map((option) => {
            const actif = filtreStatut === option.id;
            return (
              <button
                key={option.id}
                type="button"
                role="radio"
                aria-checked={actif}
                onClick={() => setFiltreStatut(option.id)}
                className={cn(
                  "rounded-[calc(var(--radius-champ)-4px)] px-3 py-1.5 text-[13px] font-semibold transition-colors motion-reduce:transition-none",
                  actif
                    ? "bg-surface text-marine shadow-[var(--ombre-carte)]"
                    : "text-encre-attenuee hover:text-encre"
                )}
              >
                {option.label} · {compteurs[option.id]}
              </button>
            );
          })}
        </div>

        <div className="relative w-full sm:w-72">
          <Search
            size={16}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-encre-attenuee"
            aria-hidden="true"
          />
          <input
            type="search"
            value={recherche}
            onChange={(evenement) => setRecherche(evenement.target.value)}
            placeholder="Rechercher un patient, un identifiant..."
            aria-label="Rechercher parmi les prescriptions"
            className="h-10 w-full rounded-champ border border-bordure-forte bg-surface pl-9 pr-3 text-[14px] text-encre placeholder:text-encre-attenuee transition-colors motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2"
          />
        </div>
      </div>

      {prescriptionsFiltrees.length === 0 ? (
        <Card className="p-0 sm:p-0">
          <EtatVideFiltre />
        </Card>
      ) : (
        <Card className="overflow-hidden p-0 sm:p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse text-[13.5px]">
              <thead>
                <tr className="bg-surface-appui">
                  <th scope="col" className={styleEnTete}>Date</th>
                  <th scope="col" className={styleEnTete}>Patient</th>
                  <th scope="col" className={styleEnTete}>Médicaments</th>
                  <th scope="col" className={styleEnTete}>Statut</th>
                  <th scope="col" className={styleEnTete}>
                    <span className="sr-only">Ouvrir</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {prescriptionsFiltrees.map((prescription) => (
                  <LignePrescription key={prescription.id} prescription={prescription} />
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

function LignePrescription({ prescription }: { prescription: PrescriptionResume }) {
  const statut = libelleStatut(prescription.statut);
  const nombreMedicaments = prescription.lignes.length;
  const apercuMedicaments = prescription.lignes
    .slice(0, 2)
    .map((ligne) => ligne.medicamentNom)
    .join(", ");
  const reste = nombreMedicaments - 2;

  return (
    <tr className="transition-colors motion-reduce:transition-none hover:bg-plan">
      <td className={styleCellule}>
        <span className="chiffres text-encre">{formaterDateHeure(prescription.date)}</span>
      </td>
      <td className={styleCellule}>
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-marine-clair text-marine">
            <UserRound size={14} aria-hidden="true" />
          </span>
          <div className="flex min-w-0 flex-col">
            <span className={prescription.patientNomComplet ? "text-encre" : "italic text-encre-attenuee"}>
              {prescription.patientNomComplet ?? "Non précisé"}
            </span>
            {prescription.patientIdentifiantSante ? (
              <span className="text-[12px] text-encre-attenuee">
                {prescription.patientIdentifiantSante}
              </span>
            ) : null}
          </div>
        </div>
      </td>
      <td className={styleCellule}>
        <span className="text-encre-secondaire">
          {apercuMedicaments}
          {reste > 0 ? ` + ${reste} autre${reste > 1 ? "s" : ""}` : ""}
        </span>
      </td>
      <td className={styleCellule}>
        <Badge tone={statut.tone}>{statut.texte}</Badge>
      </td>
      <td className={`${styleCellule} text-right`}>
        <Link
          href={`/app/medecin/pharmacie/${prescription.id}`}
          className="inline-flex h-9 items-center justify-center rounded-champ border border-bordure-forte bg-surface px-3 text-[13px] font-semibold text-encre transition-colors motion-reduce:transition-none hover:bg-surface-appui focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2"
        >
          Délivrer
        </Link>
      </td>
    </tr>
  );
}
