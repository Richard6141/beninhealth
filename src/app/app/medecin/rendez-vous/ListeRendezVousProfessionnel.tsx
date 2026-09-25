"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Building2, Calendar, Check, ClipboardList, Search, Stethoscope, TriangleAlert, X } from "lucide-react";
import {
  annulerRendezVousProfessionnelAction,
  confirmerRendezVousAction,
  type FacilityActionState,
  type RendezVousResume,
} from "@/modules/facility/actions";
import { Alert } from "@/components/ui/Alert";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import type { BadgeTone } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { cn } from "@/lib/cn";
import { IconButton } from "@/components/ui/IconButton";
import { Modal, type ModalHandle } from "@/components/ui/Modal";

const etatInitial: FacilityActionState = { error: null, success: false };

function libelleStatut(statut: string): { texte: string; tone: BadgeTone } {
  const cle = statut.trim().toLowerCase();
  if (cle === "demande") return { texte: "En attente", tone: "warning" };
  if (cle === "confirme") return { texte: "Confirmé", tone: "good" };
  if (cle === "termine") return { texte: "Terminé", tone: "neutral" };
  if (cle === "annule") return { texte: "Annulé", tone: "critical" };
  return { texte: statut, tone: "neutral" };
}

function formaterJour(date: string): string {
  try {
    return new Date(date).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
  } catch {
    return date;
  }
}

function formaterHeure(date: string): string {
  try {
    return new Date(date).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return date;
  }
}

function formaterDateHeure(date: string): string {
  try {
    return new Date(date).toLocaleString("fr-FR", { dateStyle: "long", timeStyle: "short" });
  } catch {
    return date;
  }
}

export interface ListeRendezVousProfessionnelProps {
  rendezVous: RendezVousResume[];
  peutDemarrerConsultation: boolean;
}

const styleEnTete =
  "px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-encre-attenuee";
const styleCellule = "px-4 py-3.5 align-middle border-t border-bordure";

type FiltreStatut = "tous" | "attente" | "confirmes" | "termines" | "annules";

const OPTIONS_FILTRE_STATUT: { id: FiltreStatut; label: string }[] = [
  { id: "tous", label: "Tous" },
  { id: "attente", label: "En attente" },
  { id: "confirmes", label: "Confirmés" },
  { id: "termines", label: "Terminés" },
  { id: "annules", label: "Annulés" },
];

function correspondAuFiltreStatut(rendezVous: RendezVousResume, filtre: FiltreStatut): boolean {
  if (filtre === "tous") return true;
  if (filtre === "attente") return rendezVous.statut === "demande";
  if (filtre === "confirmes") return rendezVous.statut === "confirme";
  if (filtre === "termines") return rendezVous.statut === "termine";
  return rendezVous.statut === "annule";
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

/** État vide, cohérent avec le vocabulaire visuel utilisé ailleurs dans le projet. */
function EtatVideFiltre() {
  return (
    <div className="flex flex-col items-center gap-2 px-4 py-12 text-center">
      <span className="flex h-11 w-11 items-center justify-center rounded-full bg-surface-appui text-encre-attenuee">
        <Calendar size={20} aria-hidden="true" />
      </span>
      <p className="text-[14px] font-semibold text-encre">Aucun rendez-vous</p>
      <p className="max-w-[30ch] text-[13px] text-encre-attenuee">
        Aucun rendez-vous ne correspond à ce filtre pour le moment.
      </p>
    </div>
  );
}

/**
 * Liste des rendez-vous du professionnel connecté : un bouton segmenté
 * (statut) et une recherche en direct filtrent un tableau unique, avec une
 * modale de détails au clic sur une ligne (même schéma que le tableau de
 * rendez-vous patient, src/app/app/patient/rendez-vous/ListeRendezVous.tsx).
 * Les actions varient selon le statut : confirmer/annuler une demande,
 * démarrer une consultation depuis un rendez-vous confirmé (médecin
 * uniquement), aucune action pour un rendez-vous terminé ou annulé.
 */
export function ListeRendezVousProfessionnel({
  rendezVous,
  peutDemarrerConsultation,
}: ListeRendezVousProfessionnelProps) {
  const [filtreStatut, setFiltreStatut] = useState<FiltreStatut>("tous");
  const [recherche, setRecherche] = useState("");

  const compteurs = useMemo(
    () => ({
      tous: rendezVous.length,
      attente: rendezVous.filter((rdv) => rdv.statut === "demande").length,
      confirmes: rendezVous.filter((rdv) => rdv.statut === "confirme").length,
      termines: rendezVous.filter((rdv) => rdv.statut === "termine").length,
      annules: rendezVous.filter((rdv) => rdv.statut === "annule").length,
    }),
    [rendezVous]
  );

  const rendezVousFiltres = useMemo(() => {
    const terme = recherche.trim().toLowerCase();

    return rendezVous.filter((rdv) => {
      if (!correspondAuFiltreStatut(rdv, filtreStatut)) return false;
      if (!terme) return true;

      return (
        (rdv.patientNomComplet?.toLowerCase().includes(terme) ?? false) ||
        rdv.etablissementNom.toLowerCase().includes(terme) ||
        rdv.motif.toLowerCase().includes(terme)
      );
    });
  }, [rendezVous, filtreStatut, recherche]);

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
            placeholder="Rechercher un patient, un motif..."
            aria-label="Rechercher parmi mes rendez-vous"
            className="h-10 w-full rounded-champ border border-bordure-forte bg-surface pl-9 pr-3 text-[14px] text-encre placeholder:text-encre-attenuee transition-colors motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2"
          />
        </div>
      </div>

      {rendezVousFiltres.length === 0 ? (
        <Card className="p-0 sm:p-0">
          <EtatVideFiltre />
        </Card>
      ) : (
        <Card className="overflow-hidden p-0 sm:p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] border-collapse text-[13.5px]">
              <thead>
                <tr className="bg-surface-appui">
                  <th scope="col" className={styleEnTete}>Date et heure</th>
                  <th scope="col" className={styleEnTete}>Patient</th>
                  <th scope="col" className={styleEnTete}>Établissement</th>
                  <th scope="col" className={styleEnTete}>Motif</th>
                  <th scope="col" className={styleEnTete}>Statut</th>
                  <th scope="col" className={styleEnTete}>
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rendezVousFiltres.map((rdv) => (
                  <LigneRendezVous
                    key={rdv.id}
                    rendezVous={rdv}
                    peutDemarrerConsultation={peutDemarrerConsultation}
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

function LigneRendezVous({
  rendezVous,
  peutDemarrerConsultation,
}: {
  rendezVous: RendezVousResume;
  peutDemarrerConsultation: boolean;
}) {
  const [confirmState, confirmFormAction, confirmPending] = useActionState(
    confirmerRendezVousAction,
    etatInitial
  );
  const [annulerState, annulerFormAction, annulerPending] = useActionState(
    annulerRendezVousProfessionnelAction,
    etatInitial
  );
  const detailsModalRef = useRef<ModalHandle>(null);
  const annulationModalRef = useRef<ModalHandle>(null);
  const router = useRouter();
  const statut = libelleStatut(rendezVous.statut);
  const enAttente = rendezVous.statut === "demande";
  const confirme = rendezVous.statut === "confirme";
  const peutDemarrerCelui = confirme && peutDemarrerConsultation;
  const lienConsultation = `/app/medecin/consultations/nouvelle?patientId=${encodeURIComponent(
    rendezVous.patientId
  )}&rendezVousId=${encodeURIComponent(rendezVous.id)}`;

  useEffect(() => {
    if (confirmState.success) {
      detailsModalRef.current?.close();
      router.refresh();
    }
  }, [confirmState.success, router]);

  useEffect(() => {
    if (annulerState.success) {
      annulationModalRef.current?.close();
      detailsModalRef.current?.close();
      router.refresh();
    }
  }, [annulerState.success, router]);

  return (
    <tr
      tabIndex={0}
      role="button"
      aria-label={`Voir les détails du rendez-vous du ${formaterDateHeure(rendezVous.date)}`}
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
        <div className="flex flex-col">
          <span className="font-semibold capitalize text-encre">{formaterJour(rendezVous.date)}</span>
          <span className="chiffres text-[12.5px] text-encre-attenuee">{formaterHeure(rendezVous.date)}</span>
        </div>
      </td>
      <td className={styleCellule}>
        <div className="flex items-center gap-2.5">
          <Avatar
            name={rendezVous.patientNomComplet ?? "Patient non précisé"}
            avatarUrl={rendezVous.patientAvatarUrl}
            size={28}
          />
          <span className={rendezVous.patientNomComplet ? "text-encre" : "italic text-encre-attenuee"}>
            {rendezVous.patientNomComplet ?? "Non précisé"}
          </span>
        </div>
      </td>
      <td className={styleCellule}>
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-marine-clair text-marine">
            <Building2 size={14} aria-hidden="true" />
          </span>
          <span className="text-encre">{rendezVous.etablissementNom}</span>
        </div>
      </td>
      <td className={styleCellule}>
        <span className="block max-w-[220px] truncate text-encre-secondaire" title={rendezVous.motif}>
          {rendezVous.motif}
        </span>
      </td>
      <td className={styleCellule}>
        <Badge tone={statut.tone}>{statut.texte}</Badge>
      </td>
      <td className={`${styleCellule} text-right`} onClick={(evenement) => evenement.stopPropagation()}>
        <div className="flex items-center justify-end gap-1.5">
          {enAttente ? (
            <>
              <form action={confirmFormAction}>
                <input type="hidden" name="rendezVousId" value={rendezVous.id} />
                <IconButton type="submit" icon={Check} label="Confirmer ce rendez-vous" disabled={confirmPending} />
              </form>
              <IconButton
                icon={X}
                label="Annuler ce rendez-vous"
                danger
                onClick={() => annulationModalRef.current?.showModal()}
              />
            </>
          ) : null}
          {peutDemarrerCelui ? (
            <Link
              href={lienConsultation}
              aria-label="Démarrer la consultation"
              title="Démarrer la consultation"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-champ border border-bordure-forte bg-surface text-encre-secondaire transition-colors motion-reduce:transition-none hover:bg-surface-appui focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2"
            >
              <Stethoscope size={16} aria-hidden="true" />
            </Link>
          ) : null}
        </div>

        <Modal ref={detailsModalRef} icon={ClipboardList} title="Détails du rendez-vous">
          <div className="flex flex-col gap-5">
            <div className="flex items-center gap-4 rounded-champ border border-bordure bg-plan px-4 py-4">
              <Avatar
                name={rendezVous.patientNomComplet ?? "Patient non précisé"}
                avatarUrl={rendezVous.patientAvatarUrl}
                size={56}
              />
              <div className="flex min-w-0 flex-col">
                <span
                  className={cn(
                    "text-[16px] font-bold",
                    rendezVous.patientNomComplet ? "text-encre" : "italic text-encre-attenuee"
                  )}
                >
                  {rendezVous.patientNomComplet ?? "Non précisé"}
                </span>
                <span className="mt-1 flex items-center gap-1.5 text-[13px] text-encre-attenuee">
                  <Building2 size={13} aria-hidden="true" />
                  {rendezVous.etablissementNom}
                </span>
              </div>
            </div>

            {confirmState.error ? (
              <Alert level="critical" title="Confirmation impossible">
                {confirmState.error}
              </Alert>
            ) : null}

            <div className="grid grid-cols-2 gap-3">
              <TuileDetail label="Date et heure">
                <span className="text-[14px] font-semibold text-encre">
                  {formaterDateHeure(rendezVous.date)}
                </span>
              </TuileDetail>
              <TuileDetail label="Statut">
                <Badge tone={statut.tone} className="w-fit">
                  {statut.texte}
                </Badge>
              </TuileDetail>
            </div>

            <TuileDetail label="Motif">
              <span className="text-[14px] text-encre">{rendezVous.motif}</span>
            </TuileDetail>

            <div className="flex flex-wrap justify-end gap-2 border-t border-bordure pt-4">
              <Button type="button" variant="secondary" onClick={() => detailsModalRef.current?.close()}>
                Fermer
              </Button>
              {enAttente ? (
                <>
                  <Button
                    type="button"
                    variant="danger"
                    onClick={() => annulationModalRef.current?.showModal()}
                  >
                    Annuler
                  </Button>
                  <form action={confirmFormAction}>
                    <input type="hidden" name="rendezVousId" value={rendezVous.id} />
                    <Button type="submit" variant="primary" disabled={confirmPending}>
                      {confirmPending ? "Confirmation..." : "Confirmer"}
                    </Button>
                  </form>
                </>
              ) : null}
              {peutDemarrerCelui ? (
                <Link
                  href={lienConsultation}
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-champ bg-marine px-4 text-[15px] font-semibold text-white transition-colors motion-reduce:transition-none hover:bg-marine-fonce focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2"
                >
                  <Stethoscope size={16} aria-hidden="true" />
                  Démarrer la consultation
                </Link>
              ) : null}
            </div>
          </div>
        </Modal>

        <Modal
          ref={annulationModalRef}
          icon={TriangleAlert}
          title="Annuler ce rendez-vous ?"
          description={
            rendezVous.patientNomComplet
              ? `La demande de ${rendezVous.patientNomComplet} sera annulée. Cette action est immédiate.`
              : "Cette demande de rendez-vous sera annulée. Cette action est immédiate."
          }
        >
          <form action={annulerFormAction} className="flex flex-col gap-4">
            <input type="hidden" name="rendezVousId" value={rendezVous.id} />
            {annulerState.error ? (
              <Alert level="critical" title="Annulation impossible">
                {annulerState.error}
              </Alert>
            ) : null}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => annulationModalRef.current?.close()}>
                Revenir
              </Button>
              <Button type="submit" variant="danger" disabled={annulerPending}>
                {annulerPending ? "Annulation en cours..." : "Confirmer l'annulation"}
              </Button>
            </div>
          </form>
        </Modal>
      </td>
    </tr>
  );
}
