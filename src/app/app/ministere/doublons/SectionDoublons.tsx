"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Merge } from "lucide-react";
import {
  fusionnerPatientsAction,
  type CandidatDoublon,
  type CoteDoublon,
  type FusionActionState,
} from "@/modules/patient/fusion-doublons";
import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EtatVide } from "@/components/ui/EtatVide";
import { Modal, type ModalHandle } from "@/components/ui/Modal";
import { TextField } from "@/components/ui/TextField";

function formaterDate(date: string): string {
  try {
    return new Date(date).toLocaleDateString("fr-FR", { dateStyle: "long" });
  } catch {
    return date;
  }
}

function ColonneCote({ cote, choisi }: { cote: CoteDoublon; choisi: boolean }) {
  return (
    <div
      className={
        "flex flex-1 flex-col gap-2 rounded-carte border p-4 " +
        (choisi ? "border-marine bg-marine-clair" : "border-bordure bg-surface")
      }
    >
      <p className="chiffres text-[12px] font-semibold text-encre-secondaire">{cote.identifiantSante}</p>
      <p className="text-[15px] font-semibold text-encre">{cote.nomComplet}</p>
      <p className="text-[13px] text-encre-secondaire">
        Né(e) le {formaterDate(cote.dateNaissance)}, {cote.sexe === "M" ? "homme" : "femme"}
      </p>
      <p className="text-[12px] text-encre-attenuee">
        Compte créé le {formaterDate(cote.dateCreationCompte)}
      </p>
      <dl className="mt-1 grid grid-cols-3 gap-2 border-t border-bordure pt-2">
        <div>
          <dt className="text-[11px] uppercase tracking-[0.06em] text-encre-attenuee">Consultations</dt>
          <dd className="chiffres text-[16px] font-bold text-encre">{cote.nombreConsultations}</dd>
        </div>
        <div>
          <dt className="text-[11px] uppercase tracking-[0.06em] text-encre-attenuee">Prescriptions</dt>
          <dd className="chiffres text-[16px] font-bold text-encre">{cote.nombrePrescriptions}</dd>
        </div>
        <div>
          <dt className="text-[11px] uppercase tracking-[0.06em] text-encre-attenuee">Rendez-vous</dt>
          <dd className="chiffres text-[16px] font-bold text-encre">{cote.nombreRendezVous}</dd>
        </div>
      </dl>
    </div>
  );
}

const etatInitialFusion: FusionActionState = { error: null, success: false };

function ModaleFusion({
  candidat,
  onAnnuler,
  onFusionReussie,
}: {
  candidat: CandidatDoublon;
  /** Fermeture sans fusion (Echap, clic sur le fond, bouton X) : la paire reste a traiter. */
  onAnnuler: () => void;
  /** Fusion confirmee : la paire ne doit plus etre proposee. */
  onFusionReussie: () => void;
}) {
  const modaleRef = useRef<ModalHandle>(null);
  const [state, formAction, pending] = useActionState(fusionnerPatientsAction, etatInitialFusion);
  const [conserveId, setConserveId] = useState(candidat.a.patientId);

  useEffect(() => {
    modaleRef.current?.showModal();
  }, []);

  const doublonId = conserveId === candidat.a.patientId ? candidat.b.patientId : candidat.a.patientId;

  if (state.success) {
    return (
      <Modal ref={modaleRef} variant="dialog" width="wide" title="Fusion effectuée" onClose={onFusionReussie}>
        <Alert level="success" title="Dossiers fusionnés">
          Toutes les données du dossier doublon ont été déplacées vers le dossier conservé. Le compte
          doublon est désactivé, jamais supprimé.
        </Alert>
        <Button variant="primary" className="mt-4 w-full" onClick={() => modaleRef.current?.close()}>
          Fermer
        </Button>
      </Modal>
    );
  }

  return (
    <Modal
      ref={modaleRef}
      variant="dialog"
      width="wide"
      icon={Merge}
      title="Fusionner ces deux dossiers ?"
      description="Cette action est irréversible pour le dossier doublon (compte désactivé), mais aucune donnée n'est jamais supprimée."
      onClose={onAnnuler}
    >
      <form action={formAction} aria-busy={pending} className="flex flex-col gap-4">
        <input type="hidden" name="patientConserveId" value={conserveId} />
        <input type="hidden" name="patientDoublonId" value={doublonId} />

        {state.error ? (
          <Alert level="critical" title="Fusion refusée">
            {state.error}
          </Alert>
        ) : null}

        <p className="text-[13px] font-semibold text-encre">Choisissez le dossier à conserver :</p>
        <div className="flex flex-col gap-3 sm:flex-row">
          <button type="button" onClick={() => setConserveId(candidat.a.patientId)} className="flex-1 text-left">
            <ColonneCote cote={candidat.a} choisi={conserveId === candidat.a.patientId} />
          </button>
          <button type="button" onClick={() => setConserveId(candidat.b.patientId)} className="flex-1 text-left">
            <ColonneCote cote={candidat.b} choisi={conserveId === candidat.b.patientId} />
          </button>
        </div>

        <TextField
          label="Justification"
          name="justification"
          required
          hint="Au moins 20 caractères : pourquoi ces deux dossiers sont fusionnés, et pourquoi ce côté est conservé."
          placeholder="Ex. Même patient, deux créations séparées (Akpakpa puis Cotonou), dossier de gauche plus complet."
        />

        <Button type="submit" variant="danger" disabled={pending}>
          {pending ? "Fusion en cours..." : "Confirmer la fusion"}
        </Button>
      </form>
    </Modal>
  );
}

export function SectionDoublons({ candidats }: { candidats: CandidatDoublon[] }) {
  const [candidatOuvert, setCandidatOuvert] = useState<CandidatDoublon | null>(null);
  const [traites, setTraites] = useState<Set<string>>(new Set());

  const restants = candidats.filter(
    (candidat) => !traites.has(candidat.a.patientId) && !traites.has(candidat.b.patientId)
  );

  if (restants.length === 0) {
    return (
      <EtatVide
        titre="Aucun doublon détecté"
        description="Aucune paire de dossiers avec le même nom, prénom et date de naissance n'a été trouvée."
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {restants.map((candidat) => (
        <Card key={`${candidat.a.patientId}-${candidat.b.patientId}`}>
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Badge tone="warning">Doublon probable</Badge>
              <Button
                variant="primary"
                iconBefore={Merge}
                onClick={() => setCandidatOuvert(candidat)}
              >
                Examiner et fusionner
              </Button>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <ColonneCote cote={candidat.a} choisi={false} />
              <ColonneCote cote={candidat.b} choisi={false} />
            </div>
          </div>
        </Card>
      ))}

      {candidatOuvert ? (
        <ModaleFusion
          key={`${candidatOuvert.a.patientId}-${candidatOuvert.b.patientId}`}
          candidat={candidatOuvert}
          onAnnuler={() => setCandidatOuvert(null)}
          onFusionReussie={() => {
            setTraites((actuels) => {
              const suivant = new Set(actuels);
              suivant.add(candidatOuvert.a.patientId);
              suivant.add(candidatOuvert.b.patientId);
              return suivant;
            });
            setCandidatOuvert(null);
          }}
        />
      ) : null}
    </div>
  );
}
