"use client";

import { useActionState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { CalendarCheck, Clock, UserCheck, UserX } from "lucide-react";
import {
  enregistrerArriveeAction,
  type FileDuJourActionState,
  type RendezVousFileDuJourResume,
} from "@/modules/facility/file-du-jour";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EtatVide } from "@/components/ui/EtatVide";

function formaterHeure(heure: string): string {
  return new Date(heure).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

const etatInitial: FileDuJourActionState = { error: null, success: false };

function BoutonArrivee({ rendezVousId, patientNomComplet }: { rendezVousId: string; patientNomComplet: string }) {
  const [state, formAction, pending] = useActionState(enregistrerArriveeAction, etatInitial);
  const dejaSoumis = useRef(false);
  const router = useRouter();

  useEffect(() => {
    if (state.success) {
      router.refresh();
    }
  }, [state.success, router]);

  return (
    <form
      action={formAction}
      onSubmit={(evenement) => {
        if (dejaSoumis.current) {
          evenement.preventDefault();
          return;
        }
        dejaSoumis.current = true;
      }}
    >
      <input type="hidden" name="rendezVousId" value={rendezVousId} />
      {state.error ? <p className="mb-1 text-[12px] font-semibold text-critique">{state.error}</p> : null}
      <Button
        type="submit"
        variant="primary"
        iconBefore={UserCheck}
        disabled={pending || state.success}
        aria-label={`${state.success ? "Arrivée enregistrée" : "Enregistrer une arrivée"} : ${patientNomComplet} (${rendezVousId})`}
      >
        {state.success ? "Arrivée enregistrée" : pending ? "Enregistrement..." : "Enregistrer une arrivée"}
      </Button>
    </form>
  );
}

function LigneRendezVous({ rdv, afficherActionArrivee }: { rdv: RendezVousFileDuJourResume; afficherActionArrivee: boolean }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-bordure py-3 last:border-b-0">
      <div className="flex flex-col gap-0.5">
        <p className="text-[15px] font-semibold text-encre">{rdv.patientNomComplet}</p>
        <p className="text-[13px] text-encre-secondaire">
          {formaterHeure(rdv.heure)} · {rdv.motif}
          {rdv.professionnelNomComplet ? ` · ${rdv.professionnelNomComplet}` : ""}
        </p>
        {rdv.heureArrivee ? (
          <p className="text-[12px] text-encre-attenuee">Arrivé(e) à {formaterHeure(rdv.heureArrivee)}</p>
        ) : null}
      </div>
      {afficherActionArrivee ? (
        <BoutonArrivee rendezVousId={rdv.id} patientNomComplet={rdv.patientNomComplet} />
      ) : null}
    </div>
  );
}

function GroupeStatut({
  titre,
  icon: Icon,
  tone,
  rendezVous,
  afficherActionArrivee = false,
}: {
  titre: string;
  icon: typeof Clock;
  tone: BadgeTone;
  rendezVous: RendezVousFileDuJourResume[];
  afficherActionArrivee?: boolean;
}) {
  return (
    <Card>
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Icon size={18} aria-hidden="true" className="text-encre-secondaire" />
          <h2 className="text-[16px] font-bold text-encre">{titre}</h2>
        </div>
        <Badge tone={tone}>{rendezVous.length}</Badge>
      </div>
      {rendezVous.length === 0 ? (
        <p className="text-[13px] text-encre-attenuee">Aucun rendez-vous dans ce groupe.</p>
      ) : (
        <div className="flex flex-col">
          {rendezVous.map((rdv) => (
            <LigneRendezVous key={rdv.id} rdv={rdv} afficherActionArrivee={afficherActionArrivee} />
          ))}
        </div>
      )}
    </Card>
  );
}

export function SectionFileDuJour({ rendezVous }: { rendezVous: RendezVousFileDuJourResume[] }) {
  if (rendezVous.length === 0) {
    return (
      <EtatVide
        titre="Aucun rendez-vous aujourd'hui"
        description="Aucun rendez-vous n'est prévu aujourd'hui pour votre établissement."
      />
    );
  }

  const attendus = rendezVous.filter((rdv) => !rdv.heureArrivee && rdv.statut !== "absent" && rdv.statut !== "termine");
  const arrives = rendezVous.filter((rdv) => rdv.heureArrivee && rdv.statut !== "termine");
  const termines = rendezVous.filter((rdv) => rdv.statut === "termine");
  const absents = rendezVous.filter((rdv) => rdv.statut === "absent");

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <GroupeStatut titre="Attendus" icon={Clock} tone="accent" rendezVous={attendus} afficherActionArrivee />
      <GroupeStatut titre="Arrivés / en attente" icon={UserCheck} tone="good" rendezVous={arrives} />
      <GroupeStatut titre="Terminés" icon={CalendarCheck} tone="neutral" rendezVous={termines} />
      <GroupeStatut titre="Absents" icon={UserX} tone="warning" rendezVous={absents} />
    </div>
  );
}
