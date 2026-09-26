"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { UserX } from "lucide-react";
import { terminerTutelleAction, type TutelleActionState, type TutelleResume } from "@/modules/administration/tutelles";
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

const etatInitial: TutelleActionState = { error: null, success: false };

function ModaleFinTutelle({
  tutelle,
  onAnnuler,
  onTermine,
}: {
  tutelle: TutelleResume;
  onAnnuler: () => void;
  onTermine: () => void;
}) {
  const modaleRef = useRef<ModalHandle>(null);
  const [state, formAction, pending] = useActionState(terminerTutelleAction, etatInitial);

  useEffect(() => {
    modaleRef.current?.showModal();
  }, []);

  if (state.success) {
    return (
      <Modal ref={modaleRef} variant="dialog" title="Tutelle terminée" onClose={onTermine}>
        <Alert level="success" title="Accès du tuteur retiré">
          Le dossier de {tutelle.procheNomComplet} reste intact. Le tuteur n&apos;y a plus accès depuis ce
          compte.
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
      icon={UserX}
      title="Terminer cette tutelle ?"
      description={`${tutelle.tuteurNomComplet} n'aura plus accès au dossier de ${tutelle.procheNomComplet}. Le dossier lui-même n'est jamais supprimé.`}
      onClose={onAnnuler}
    >
      <form action={formAction} aria-busy={pending} className="flex flex-col gap-4">
        <input type="hidden" name="consentementId" value={tutelle.consentementId} />

        {state.error ? (
          <Alert level="critical" title="Action refusée">
            {state.error}
          </Alert>
        ) : null}

        <TextField
          label="Justification"
          name="justification"
          required
          hint="Au moins 10 caractères : pourquoi cette tutelle prend fin maintenant."
          placeholder="Ex. Personne à charge devenue majeure, confirmé par le tuteur."
        />

        <Button type="submit" variant="danger" disabled={pending}>
          {pending ? "Fin en cours..." : "Confirmer la fin de tutelle"}
        </Button>
      </form>
    </Modal>
  );
}

export function SectionTutelles({ tutelles }: { tutelles: TutelleResume[] }) {
  const [ouverte, setOuverte] = useState<TutelleResume | null>(null);
  const [terminees, setTerminees] = useState<Set<string>>(new Set());

  const restantes = tutelles.filter((tutelle) => !terminees.has(tutelle.consentementId));

  if (restantes.length === 0) {
    return (
      <EtatVide
        titre="Aucune tutelle active"
        description="Aucun tuteur ne gère actuellement de personne à charge sur la plateforme."
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {restantes.map((tutelle) => (
        <Card key={tutelle.consentementId}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-col gap-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-[15px] font-semibold text-encre">{tutelle.procheNomComplet}</p>
                {tutelle.procheEstMajeur ? <Badge tone="warning">Majeur(e)</Badge> : null}
              </div>
              <p className="text-[13px] text-encre-secondaire">
                Né(e) le {formaterDate(tutelle.procheDateNaissance)}
              </p>
              <p className="text-[13px] text-encre-secondaire">
                Tuteur : {tutelle.tuteurNomComplet} ({tutelle.tuteurEmail})
              </p>
              <p className="text-[12px] text-encre-attenuee">
                Tutelle accordée le {formaterDate(tutelle.dateDebut)}
              </p>
            </div>
            <Button
              variant="secondary"
              iconBefore={UserX}
              onClick={() => setOuverte(tutelle)}
              aria-label={`Terminer la tutelle de ${tutelle.procheNomComplet}`}
            >
              Terminer la tutelle
            </Button>
          </div>
        </Card>
      ))}

      {ouverte ? (
        <ModaleFinTutelle
          key={ouverte.consentementId}
          tutelle={ouverte}
          onAnnuler={() => setOuverte(null)}
          onTermine={() => {
            setTerminees((actuelles) => {
              const suivant = new Set(actuelles);
              suivant.add(ouverte.consentementId);
              return suivant;
            });
            setOuverte(null);
          }}
        />
      ) : null}
    </div>
  );
}
