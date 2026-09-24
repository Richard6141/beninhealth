"use client";

import { useActionState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
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
import { Modal, type ModalHandle } from "@/components/ui/Modal";

const etatInitial: FacilityActionState = { error: null, success: false };

function libelleStatut(statut: string): { texte: string; tone: BadgeTone } {
  const cle = statut.trim().toLowerCase();
  if (cle === "demande") return { texte: "Demande envoyée", tone: "info" };
  if (cle === "confirme") return { texte: "Confirmé", tone: "good" };
  if (cle === "termine") return { texte: "Terminé", tone: "neutral" };
  if (cle === "annule") return { texte: "Annulé", tone: "critical" };
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

export interface ListeRendezVousProps {
  rendezVous: RendezVousResume[];
}

/**
 * Liste des rendez-vous du patient connecté, regroupée visuellement entre
 * "à venir" (statuts demande/confirme) et "passés et annulés" (statuts
 * termine/annule). L'annulation (via CarteRendezVousAVenir) suit le même
 * schéma que le retrait de consentement en Phase 3 : bouton, confirmation
 * par Modal, puis soumission du formulaire.
 */
export function ListeRendezVous({ rendezVous }: ListeRendezVousProps) {
  const aVenir = rendezVous.filter(
    (rdv) => rdv.statut === "demande" || rdv.statut === "confirme"
  );
  const passes = rendezVous.filter(
    (rdv) => rdv.statut === "termine" || rdv.statut === "annule"
  );

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-4">
        <h3 className="text-[15px] font-bold text-encre">À venir</h3>
        {aVenir.length === 0 ? (
          <Card>
            <p className="text-[13px] text-encre-attenuee">
              Aucun rendez-vous à venir pour le moment.
            </p>
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {aVenir.map((rdv) => (
              <CarteRendezVousAVenir key={rdv.id} rendezVous={rdv} />
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-4">
        <h3 className="text-[15px] font-bold text-encre">Passés et annulés</h3>
        {passes.length === 0 ? (
          <Card>
            <p className="text-[13px] text-encre-attenuee">
              Aucun rendez-vous passé ou annulé pour le moment.
            </p>
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {passes.map((rdv) => {
              const statut = libelleStatut(rdv.statut);
              return (
                <Card
                  key={rdv.id}
                  title={rdv.etablissementNom}
                  description={rdv.professionnelNomComplet ?? "Professionnel non précisé"}
                  actions={<Badge tone={statut.tone}>{statut.texte}</Badge>}
                >
                  <div className="flex flex-col gap-1.5">
                    <p className="text-[14px] font-semibold text-encre">
                      {formaterDateHeure(rdv.date)}
                    </p>
                    <p className="text-[13px] text-encre-secondaire">{rdv.motif}</p>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function CarteRendezVousAVenir({ rendezVous }: { rendezVous: RendezVousResume }) {
  const [state, formAction, pending] = useActionState(
    annulerRendezVousAction,
    etatInitial
  );
  const modalRef = useRef<ModalHandle>(null);
  const router = useRouter();
  const statut = libelleStatut(rendezVous.statut);

  useEffect(() => {
    if (state.success) {
      modalRef.current?.close();
      router.refresh();
    }
  }, [state.success, router]);

  return (
    <Card
      title={rendezVous.etablissementNom}
      description={rendezVous.professionnelNomComplet ?? "Professionnel non précisé"}
      actions={<Badge tone={statut.tone}>{statut.texte}</Badge>}
    >
      <div className="flex flex-col gap-3">
        <p className="text-[14px] font-semibold text-encre">
          {formaterDateHeure(rendezVous.date)}
        </p>
        <p className="text-[13px] text-encre-secondaire">{rendezVous.motif}</p>

        {state.error ? (
          <Alert level="critical" title="Annulation impossible">
            {state.error}
          </Alert>
        ) : null}

        <Button
          type="button"
          variant="danger"
          size="sm"
          className="w-fit"
          onClick={() => modalRef.current?.showModal()}
        >
          Annuler ce rendez-vous
        </Button>
        <Modal
          ref={modalRef}
          title="Annuler ce rendez-vous ?"
          description={`Votre rendez-vous du ${formaterDateHeure(rendezVous.date)} sera annulé.`}
        >
          <form action={formAction} className="flex flex-col gap-4">
            <input type="hidden" name="rendezVousId" value={rendezVous.id} />
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
      </div>
    </Card>
  );
}
