"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, CalendarX2, Search, UserRound, X } from "lucide-react";
import {
  annulerRendezVousAction,
  type FacilityActionState,
  type RendezVousResume,
} from "@/modules/facility/actions";
import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import type { BadgeTone } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { cn } from "@/lib/cn";
import { IconButton } from "@/components/ui/IconButton";
import { Modal, type ModalHandle } from "@/components/ui/Modal";

const etatInitial: FacilityActionState = { error: null, success: false };

const STATUTS_A_VENIR = new Set(["demande", "confirme"]);

function libelleStatut(statut: string): { texte: string; tone: BadgeTone } {
  const cle = statut.trim().toLowerCase();
  if (cle === "demande") return { texte: "Demande envoyée", tone: "info" };
  if (cle === "confirme") return { texte: "Confirmé", tone: "good" };
  if (cle === "termine") return { texte: "Terminé", tone: "neutral" };
  if (cle === "annule") return { texte: "Annulé", tone: "critical" };
  return { texte: statut, tone: "neutral" };
}

function formaterJour(date: string): string {
  try {
    return new Date(date).toLocaleDateString("fr-FR", {
      weekday: "long",
      day: "numeric",
      month: "long",
    });
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

export interface ListeRendezVousProps {
  rendezVous: RendezVousResume[];
}

const styleEnTete =
  "px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-encre-attenuee";
const styleCellule = "px-4 py-3.5 align-middle border-t border-bordure";

/** Pastille d'icône compacte, réutilisée pour les colonnes établissement et professionnel. */
function PastilleIcone({ icon: Icon }: { icon: typeof Building2 }) {
  return (
    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-clair text-accent">
      <Icon size={14} aria-hidden="true" />
    </span>
  );
}

/** État vide, cohérent avec le vocabulaire visuel utilisé ailleurs dans le projet (icône, titre, description). */
function EtatVideFiltre() {
  return (
    <div className="flex flex-col items-center gap-2 px-4 py-12 text-center">
      <span className="flex h-11 w-11 items-center justify-center rounded-full bg-surface-appui text-encre-attenuee">
        <CalendarX2 size={20} aria-hidden="true" />
      </span>
      <p className="text-[14px] font-semibold text-encre">Aucun rendez-vous</p>
      <p className="max-w-[30ch] text-[13px] text-encre-attenuee">
        Aucun rendez-vous ne correspond à ce filtre pour le moment.
      </p>
    </div>
  );
}

/**
 * Tableau des rendez-vous, pour un sous-ensemble déjà filtré. Présentation
 * "pleine largeur" (pas de marge interne de Card) avec en-tête teinté, lignes
 * surlignées au survol et coins arrondis alignés sur la carte englobante,
 * plutôt qu'un tableau simplement inséré dans le padding par défaut de Card.
 * L'action "Annuler" ne s'affiche que pour les rendez-vous "à venir" (demande
 * ou confirme) : les rendez-vous terminés ou annulés n'ont plus d'action
 * possible, la cellule reste vide plutôt que masquer toute la colonne (le
 * tableau garde la même forme quel que soit le filtre actif).
 */
function TableauRendezVous({ rendezVous }: { rendezVous: RendezVousResume[] }) {
  if (rendezVous.length === 0) {
    return (
      <Card className="p-0 sm:p-0">
        <EtatVideFiltre />
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden p-0 sm:p-0">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[780px] border-collapse text-[13.5px]">
          <thead>
            <tr className="bg-surface-appui">
              <th scope="col" className={styleEnTete}>
                Date et heure
              </th>
              <th scope="col" className={styleEnTete}>
                Établissement
              </th>
              <th scope="col" className={styleEnTete}>
                Professionnel
              </th>
              <th scope="col" className={styleEnTete}>
                Motif
              </th>
              <th scope="col" className={styleEnTete}>
                Statut
              </th>
              <th scope="col" className={styleEnTete}>
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rendezVous.map((rdv) => (
              <LigneRendezVous key={rdv.id} rendezVous={rdv} />
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

type FiltreStatut = "tous" | "a-venir" | "termines" | "annules";

const OPTIONS_FILTRE_STATUT: { id: FiltreStatut; label: string }[] = [
  { id: "tous", label: "Tous" },
  { id: "a-venir", label: "À venir" },
  { id: "termines", label: "Terminés" },
  { id: "annules", label: "Annulés" },
];

function correspondAuFiltreStatut(rendezVous: RendezVousResume, filtre: FiltreStatut): boolean {
  if (filtre === "tous") return true;
  if (filtre === "a-venir") return STATUTS_A_VENIR.has(rendezVous.statut);
  if (filtre === "termines") return rendezVous.statut === "termine";
  return rendezVous.statut === "annule";
}

/**
 * Liste des rendez-vous du patient connecté : un bouton segmenté (statut) et
 * un champ de recherche (établissement, professionnel, motif) filtrent la
 * même liste en direct, plutôt que des onglets qui recalculaient et
 * démontaient un tableau séparé par statut. L'annulation (via
 * LigneRendezVous) suit le même schéma que le retrait de consentement en
 * Phase 3 : bouton, confirmation par Modal, puis soumission du formulaire.
 */
export function ListeRendezVous({ rendezVous }: ListeRendezVousProps) {
  const [filtreStatut, setFiltreStatut] = useState<FiltreStatut>("tous");
  const [recherche, setRecherche] = useState("");

  const compteurs = useMemo(
    () => ({
      tous: rendezVous.length,
      "a-venir": rendezVous.filter((rdv) => STATUTS_A_VENIR.has(rdv.statut)).length,
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
        rdv.etablissementNom.toLowerCase().includes(terme) ||
        (rdv.professionnelNomComplet?.toLowerCase().includes(terme) ?? false) ||
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
          className="inline-flex w-fit items-center gap-1 rounded-champ bg-surface-appui p-1"
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
                    ? "bg-surface text-accent shadow-[var(--ombre-carte)]"
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
            placeholder="Rechercher un établissement, un motif..."
            aria-label="Rechercher parmi mes rendez-vous"
            className="h-10 w-full rounded-champ border border-bordure-forte bg-surface pl-9 pr-3 text-[14px] text-encre placeholder:text-encre-attenuee transition-colors motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2"
          />
        </div>
      </div>

      <TableauRendezVous rendezVous={rendezVousFiltres} />
    </div>
  );
}

function LigneRendezVous({ rendezVous }: { rendezVous: RendezVousResume }) {
  const [state, formAction, pending] = useActionState(
    annulerRendezVousAction,
    etatInitial
  );
  const modalRef = useRef<ModalHandle>(null);
  const router = useRouter();
  const statut = libelleStatut(rendezVous.statut);
  const peutAnnuler = STATUTS_A_VENIR.has(rendezVous.statut);

  useEffect(() => {
    if (state.success) {
      modalRef.current?.close();
      router.refresh();
    }
  }, [state.success, router]);

  return (
    <tr className="transition-colors motion-reduce:transition-none hover:bg-plan">
      <td className={styleCellule}>
        <div className="flex flex-col">
          <span className="font-semibold capitalize text-encre">{formaterJour(rendezVous.date)}</span>
          <span className="chiffres text-[12.5px] text-encre-attenuee">{formaterHeure(rendezVous.date)}</span>
        </div>
      </td>
      <td className={styleCellule}>
        <div className="flex items-center gap-2.5">
          <PastilleIcone icon={Building2} />
          <span className="text-encre">{rendezVous.etablissementNom}</span>
        </div>
      </td>
      <td className={styleCellule}>
        <div className="flex items-center gap-2.5">
          <PastilleIcone icon={UserRound} />
          <span className={rendezVous.professionnelNomComplet ? "text-encre" : "italic text-encre-attenuee"}>
            {rendezVous.professionnelNomComplet ?? "Non précisé"}
          </span>
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
      <td className={`${styleCellule} text-right`}>
        {peutAnnuler ? (
          <>
            <IconButton
              icon={X}
              label="Annuler ce rendez-vous"
              danger
              className="ml-auto"
              onClick={() => modalRef.current?.showModal()}
            />
            <Modal
              ref={modalRef}
              title="Annuler ce rendez-vous ?"
              description={`Votre rendez-vous du ${formaterDateHeure(rendezVous.date)} sera annulé.`}
            >
              <form action={formAction} className="flex flex-col gap-4">
                <input type="hidden" name="rendezVousId" value={rendezVous.id} />
                {state.error ? (
                  <Alert level="critical" title="Annulation impossible">
                    {state.error}
                  </Alert>
                ) : null}
                <p className="text-[14px] text-encre-secondaire">
                  Cette action est immédiate. Vous pourrez prendre un nouveau
                  rendez-vous à tout moment depuis cette page.
                </p>
                <div className="flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => modalRef.current?.close()}
                  >
                    Revenir
                  </Button>
                  <Button type="submit" variant="danger" disabled={pending}>
                    {pending ? "Annulation en cours..." : "Confirmer l'annulation"}
                  </Button>
                </div>
              </form>
            </Modal>
          </>
        ) : null}
      </td>
    </tr>
  );
}
