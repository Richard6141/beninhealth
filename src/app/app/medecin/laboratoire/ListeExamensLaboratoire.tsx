"use client";

import { useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { ClipboardList, FlaskConical, Search, UserRound } from "lucide-react";
import type { ExamenResume } from "@/modules/laboratoire/actions";
import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import type { BadgeTone } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { cn } from "@/lib/cn";
import { Modal, type ModalHandle } from "@/components/ui/Modal";
import { FormulairePrelevement } from "./FormulairePrelevement";
import { FormulaireResultat } from "./FormulaireResultat";
import { SectionCorrectionValide } from "./FormulaireCorrectionValide";
import { SectionValidation } from "./FormulaireValidation";

function libelleStatut(statut: string): { texte: string; tone: BadgeTone } {
  const cle = statut.trim().toLowerCase();
  if (cle === "demande") return { texte: "Demande", tone: "warning" };
  if (cle === "en_cours") return { texte: "En cours", tone: "info" };
  if (cle === "correction_demandee") return { texte: "Correction demandée", tone: "critical" };
  if (cle === "resultat_saisi") return { texte: "En attente de validation", tone: "warning" };
  if (cle === "termine") return { texte: "Terminé", tone: "good" };
  if (cle === "annule") return { texte: "Annulé", tone: "critical" };
  return { texte: statut, tone: "neutral" };
}

const LIBELLES_TYPE_ECHANTILLON: Record<string, string> = {
  sang_veineux: "Sang veineux",
  sang_capillaire: "Sang capillaire",
  urine: "Urine",
  selles: "Selles",
  autre: "Autre",
};

const LIBELLES_MOTIF_REJET: Record<string, string> = {
  hemolyse: "Hémolysé",
  quantite_insuffisante: "Quantité insuffisante",
  mauvais_tube: "Mauvais tube",
  delai_depasse: "Délai dépassé",
  etiquetage_incorrect: "Étiquetage incorrect",
};

function formaterDateHeure(date: string): string {
  try {
    return new Date(date).toLocaleString("fr-FR", { dateStyle: "long", timeStyle: "short" });
  } catch {
    return date;
  }
}

const STATUTS_A_SAISIR = new Set(["demande", "en_cours", "correction_demandee"]);

type FiltreStatut = "tous" | "a-saisir" | "validation" | "historique";

const OPTIONS_FILTRE_STATUT: { id: FiltreStatut; label: string }[] = [
  { id: "tous", label: "Tous" },
  { id: "a-saisir", label: "À saisir" },
  { id: "validation", label: "À valider" },
  { id: "historique", label: "Historique" },
];

function correspondAuFiltreStatut(examen: ExamenResume, filtre: FiltreStatut): boolean {
  if (filtre === "tous") return true;
  if (filtre === "a-saisir") return STATUTS_A_SAISIR.has(examen.statut);
  if (filtre === "validation") return examen.statut === "resultat_saisi";
  return examen.statut === "termine" || examen.statut === "annule";
}

const styleEnTete =
  "px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-encre-attenuee";
const styleCellule = "px-4 py-3.5 align-middle border-t border-bordure";

function PastilleIcone({ icon: Icon }: { icon: typeof FlaskConical }) {
  return (
    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-marine-clair text-marine">
      <Icon size={14} aria-hidden="true" />
    </span>
  );
}

function TuileDetail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5 rounded-champ border border-bordure bg-plan px-4 py-3">
      <span className="text-[12px] font-semibold uppercase tracking-[0.06em] text-encre-attenuee">
        {label}
      </span>
      {children}
    </div>
  );
}

function EtatVideFiltre() {
  return (
    <div className="flex flex-col items-center gap-2 px-4 py-12 text-center">
      <span className="flex h-11 w-11 items-center justify-center rounded-full bg-surface-appui text-encre-attenuee">
        <FlaskConical size={20} aria-hidden="true" />
      </span>
      <p className="text-[14px] font-semibold text-encre">Aucun examen</p>
      <p className="max-w-[30ch] text-[13px] text-encre-attenuee">
        Aucun examen ne correspond à ce filtre pour le moment.
      </p>
    </div>
  );
}

export interface ListeExamensLaboratoireProps {
  examens: ExamenResume[];
  idProfessionnelCourant: string | null;
}

/**
 * Liste des examens assignés à l'établissement du laboratoire connecté : un
 * bouton segmenté (statut) et une recherche en direct filtrent un tableau
 * unique, avec une modale de détails au clic sur une ligne (même schéma que
 * les tableaux de rendez-vous patient/médecin). Les actions existantes
 * (FormulaireResultat, SectionValidation) sont réutilisées telles quelles,
 * sans aucun changement de logique : seule la présentation en liste change.
 */
export function ListeExamensLaboratoire({
  examens,
  idProfessionnelCourant,
}: ListeExamensLaboratoireProps) {
  const [filtreStatut, setFiltreStatut] = useState<FiltreStatut>("tous");
  const [recherche, setRecherche] = useState("");

  const compteurs = useMemo(
    () => ({
      tous: examens.length,
      "a-saisir": examens.filter((examen) => STATUTS_A_SAISIR.has(examen.statut)).length,
      validation: examens.filter((examen) => examen.statut === "resultat_saisi").length,
      historique: examens.filter(
        (examen) => examen.statut === "termine" || examen.statut === "annule"
      ).length,
    }),
    [examens]
  );

  const examensFiltres = useMemo(() => {
    const terme = recherche.trim().toLowerCase();

    return examens.filter((examen) => {
      if (!correspondAuFiltreStatut(examen, filtreStatut)) return false;
      if (!terme) return true;

      return (
        (examen.patientNomComplet?.toLowerCase().includes(terme) ?? false) ||
        (examen.patientIdentifiantSante?.toLowerCase().includes(terme) ?? false) ||
        examen.typeExamen.toLowerCase().includes(terme)
      );
    });
  }, [examens, filtreStatut, recherche]);

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
                  "rounded-champ px-3 py-1.5 text-[13px] font-semibold transition-colors motion-reduce:transition-none",
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
            placeholder="Rechercher un patient, un type d'examen..."
            aria-label="Rechercher parmi les examens"
            className="h-10 w-full rounded-champ border border-bordure-forte bg-surface pl-9 pr-3 text-[14px] text-encre placeholder:text-encre-attenuee transition-colors motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2"
          />
        </div>
      </div>

      {examensFiltres.length === 0 ? (
        <Card className="p-0 sm:p-0">
          <EtatVideFiltre />
        </Card>
      ) : (
        <Card className="overflow-hidden p-0 sm:p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] border-collapse text-[13.5px]">
              <thead>
                <tr className="bg-surface-appui">
                  <th scope="col" className={styleEnTete}>Date et heure</th>
                  <th scope="col" className={styleEnTete}>Patient</th>
                  <th scope="col" className={styleEnTete}>Type d&apos;examen</th>
                  <th scope="col" className={styleEnTete}>Demandeur</th>
                  <th scope="col" className={styleEnTete}>Statut</th>
                  <th scope="col" className={styleEnTete}>
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {examensFiltres.map((examen) => (
                  <LigneExamen
                    key={examen.id}
                    examen={examen}
                    idProfessionnelCourant={idProfessionnelCourant}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

function LigneExamen({
  examen,
  idProfessionnelCourant,
}: {
  examen: ExamenResume;
  idProfessionnelCourant: string | null;
}) {
  const detailsModalRef = useRef<ModalHandle>(null);
  const statut = libelleStatut(examen.statut);
  const peutSaisir = STATUTS_A_SAISIR.has(examen.statut);
  const enValidation = examen.statut === "resultat_saisi";
  const estSaisiParMoi =
    idProfessionnelCourant !== null && examen.saisiParId === idProfessionnelCourant;

  return (
    <tr
      tabIndex={0}
      role="button"
      aria-label={`Voir les détails de l'examen du ${formaterDateHeure(examen.date)}`}
      onClick={() => detailsModalRef.current?.showModal()}
      onKeyDown={(evenement) => {
        if (evenement.key === "Enter" || evenement.key === " ") {
          evenement.preventDefault();
          detailsModalRef.current?.showModal();
        }
      }}
      className="cursor-pointer transition-colors motion-reduce:transition-none hover:bg-plan focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
    >
      <td className={styleCellule}>
        <span className="chiffres font-semibold text-encre">{formaterDateHeure(examen.date)}</span>
      </td>
      <td className={styleCellule}>
        <div className="flex items-center gap-2.5">
          <PastilleIcone icon={UserRound} />
          <div className="flex min-w-0 flex-col">
            <span className={examen.patientNomComplet ? "text-encre" : "italic text-encre-attenuee"}>
              {examen.patientNomComplet ?? "Non précisé"}
            </span>
            {examen.patientIdentifiantSante ? (
              <span className="text-[12px] text-encre-attenuee">{examen.patientIdentifiantSante}</span>
            ) : null}
          </div>
        </div>
      </td>
      <td className={styleCellule}>
        <span className="text-encre">{examen.typeExamen}</span>
        {examen.numero ? <span className="chiffres block text-[12px] text-encre-attenuee">{examen.numero}</span> : null}
      </td>
      <td className={styleCellule}>
        <span className="text-encre-secondaire">{examen.demandeurNomComplet ?? "Non précisé"}</span>
      </td>
      <td className={styleCellule}>
        <Badge tone={statut.tone}>{statut.texte}</Badge>
      </td>
      <td className={`${styleCellule} text-right`} onClick={(evenement) => evenement.stopPropagation()}>
        <div className="flex flex-wrap justify-end gap-2">
          <FormulairePrelevement examen={examen} />
          {peutSaisir ? <FormulaireResultat examen={examen} /> : null}
        </div>

        <Modal ref={detailsModalRef} icon={ClipboardList} title="Détails de l'examen">
          <div className="flex flex-col gap-5">
            <div className="flex items-center gap-4 rounded-champ border border-bordure bg-plan px-4 py-4">
              <PastilleIcone icon={UserRound} />
              <div className="flex min-w-0 flex-col">
                <span
                  className={cn(
                    "text-[16px] font-bold",
                    examen.patientNomComplet ? "text-encre" : "italic text-encre-attenuee"
                  )}
                >
                  {examen.patientNomComplet ?? "Non précisé"}
                </span>
                {examen.patientIdentifiantSante ? (
                  <span className="text-[13px] text-encre-attenuee">{examen.patientIdentifiantSante}</span>
                ) : null}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <TuileDetail label="Date et heure">
                <span className="text-[14px] font-semibold text-encre">
                  {formaterDateHeure(examen.date)}
                </span>
              </TuileDetail>
              <TuileDetail label="Statut">
                <Badge tone={statut.tone} className="w-fit">
                  {statut.texte}
                </Badge>
              </TuileDetail>
            </div>

            <TuileDetail label="Type d'examen">
              <span className="text-[14px] text-encre">{examen.typeExamen}</span>
            </TuileDetail>
            <TuileDetail label="Demandé par">
              <span className="text-[14px] text-encre">{examen.demandeurNomComplet ?? "Non précisé"}</span>
            </TuileDetail>

            {examen.motifRejetEchantillon ? (
              <Alert level="warning" title="Précédent échantillon rejeté">
                {LIBELLES_MOTIF_REJET[examen.motifRejetEchantillon] ?? examen.motifRejetEchantillon}, nouveau
                prélèvement nécessaire.
              </Alert>
            ) : null}

            {examen.typeEchantillon ? (
              <div className="grid grid-cols-2 gap-3">
                <TuileDetail label="Échantillon">
                  <span className="text-[14px] text-encre">
                    {LIBELLES_TYPE_ECHANTILLON[examen.typeEchantillon] ?? examen.typeEchantillon}
                    {examen.identifiantEchantillon ? ` (${examen.identifiantEchantillon})` : ""}
                  </span>
                </TuileDetail>
                <TuileDetail label="Prélevé le">
                  <span className="text-[14px] text-encre">
                    {examen.datePrelevement ? formaterDateHeure(examen.datePrelevement) : "Non renseigné"}
                  </span>
                </TuileDetail>
              </div>
            ) : null}

            {examen.resultat ? (
              <TuileDetail label={examen.versionResultat > 1 ? `Résultat (version ${examen.versionResultat})` : "Résultat"}>
                <span className="whitespace-pre-wrap text-[14px] text-encre">{examen.resultat}</span>
                {examen.saisiParNomComplet ? (
                  <span className="mt-1 text-[12px] text-encre-attenuee">
                    Saisi par {examen.saisiParNomComplet}
                    {examen.dateResultat ? ` le ${formaterDateHeure(examen.dateResultat)}` : ""}
                  </span>
                ) : null}
                {examen.valideParNomComplet ? (
                  <span className="text-[12px] text-encre-attenuee">
                    Validé par {examen.valideParNomComplet}
                  </span>
                ) : null}
              </TuileDetail>
            ) : null}

            {examen.versionsPrecedentes && examen.versionsPrecedentes.length > 0 ? (
              <TuileDetail label="Versions précédentes (archivées)">
                <ul className="flex flex-col gap-2">
                  {examen.versionsPrecedentes.map((version) => (
                    <li key={version.numero} className="text-[13px] text-encre-secondaire">
                      <span className="font-semibold text-encre">Version {version.numero}</span>
                      {` (corrigée le ${formaterDateHeure(version.dateCorrection)}) : ${version.motifCorrection}`}
                      {version.resultat ? <span className="block whitespace-pre-wrap text-encre-attenuee">{version.resultat}</span> : null}
                    </li>
                  ))}
                </ul>
              </TuileDetail>
            ) : null}

            {examen.statut === "termine" ? (
              <div className="border-t border-bordure pt-4">
                <SectionCorrectionValide examenId={examen.id} />
              </div>
            ) : null}

            {enValidation ? (
              <div className="border-t border-bordure pt-4">
                <SectionValidation examen={examen} estSaisiParMoi={estSaisiParMoi} />
              </div>
            ) : (
              <div className="flex justify-end border-t border-bordure pt-4">
                <button
                  type="button"
                  onClick={() => detailsModalRef.current?.close()}
                  className="inline-flex h-11 items-center justify-center rounded-champ border border-bordure-forte bg-surface px-4 text-[15px] font-semibold text-encre transition-colors motion-reduce:transition-none hover:bg-surface-appui focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2"
                >
                  Fermer
                </button>
              </div>
            )}
          </div>
        </Modal>
      </td>
    </tr>
  );
}
