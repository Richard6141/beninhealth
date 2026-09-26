"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarPlus, Plus } from "lucide-react";
import { creerRendezVousPourProcheAction, type ProcheActionState } from "@/modules/proches/actions";
import type { EtablissementOption, ProfessionnelOption } from "@/modules/facility/actions";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Modal, type ModalHandle } from "@/components/ui/Modal";
import { SelectField } from "@/components/ui/SelectField";
import { TextField } from "@/components/ui/TextField";

const etatInitial: ProcheActionState = { error: null, success: false };

export interface FormulaireRendezVousProcheProps {
  procheId: string;
  etablissements: EtablissementOption[];
  professionnels: ProfessionnelOption[];
  dateMinimum: string;
}

function ContenuFormulaire({
  procheId,
  etablissements,
  professionnels,
  dateMinimum,
  onFermer,
}: FormulaireRendezVousProcheProps & { onFermer: () => void }) {
  const [state, formAction, pending] = useActionState(creerRendezVousPourProcheAction, etatInitial);
  const [etablissementId, setEtablissementId] = useState("");
  const router = useRouter();

  useEffect(() => {
    if (state.success) {
      router.refresh();
    }
  }, [state.success, router]);

  if (state.success) {
    return (
      <div className="flex flex-col gap-4">
        <Alert level="success" title="Demande envoyée">
          La demande de rendez-vous a été envoyée au nom de cette personne à
          charge.
        </Alert>
        <Button type="button" variant="secondary" className="w-fit" onClick={onFermer}>
          Fermer
        </Button>
      </div>
    );
  }

  const optionsEtablissements = etablissements.map((etablissement) => ({
    value: etablissement.id,
    label: `${etablissement.nom} (${etablissement.type}), ${etablissement.localisation}`,
  }));

  const professionnelsFiltres = professionnels.filter(
    (professionnel) => professionnel.etablissementId === etablissementId
  );
  const optionsProfessionnels = professionnelsFiltres.map((professionnel) => ({
    value: professionnel.id,
    label: `${professionnel.nomComplet}, ${professionnel.specialite}`,
  }));

  return (
    <form action={formAction} aria-busy={pending} className="flex flex-col gap-4">
      <input type="hidden" name="procheId" value={procheId} />

      {state.error ? (
        <Alert level="critical" title="Demande impossible">
          {state.error}
        </Alert>
      ) : null}

      <SelectField
        label="Établissement de santé"
        name="etablissementId"
        required
        options={optionsEtablissements}
        placeholder="Choisir un établissement"
        onChange={(evenement) => setEtablissementId(evenement.target.value)}
      />

      <SelectField
        key={etablissementId}
        label="Professionnel de santé"
        name="professionnelId"
        options={optionsProfessionnels}
        placeholder={
          etablissementId === ""
            ? "Choisissez d'abord un établissement"
            : professionnelsFiltres.length > 0
              ? "Peu importe (facultatif)"
              : "Aucun professionnel disponible dans cet établissement"
        }
      />

      <TextField
        label="Date et heure souhaitées"
        name="date"
        type="datetime-local"
        required
        min={dateMinimum}
      />

      <TextField
        label="Motif de la consultation"
        name="motif"
        required
        placeholder="Ex. : consultation de suivi, vaccination..."
      />

      <Button type="submit" variant="primary" className="w-fit" disabled={pending}>
        {pending ? "Envoi en cours..." : "Prendre rendez-vous"}
      </Button>
    </form>
  );
}

export function BoutonRendezVousProche(props: FormulaireRendezVousProcheProps) {
  const modalRef = useRef<ModalHandle>(null);
  const [cle, setCle] = useState(0);

  return (
    <>
      <Button
        type="button"
        variant="primary"
        iconBefore={Plus}
        onClick={() => modalRef.current?.showModal()}
      >
        Prendre un rendez-vous
      </Button>
      <Modal
        ref={modalRef}
        width="wide"
        icon={CalendarPlus}
        title="Prendre un rendez-vous pour cette personne"
        description="Choisissez un établissement de santé et, si vous le souhaitez, un professionnel en particulier."
        onClose={() => setCle((valeur) => valeur + 1)}
      >
        <ContenuFormulaire key={cle} {...props} onFermer={() => modalRef.current?.close()} />
      </Modal>
    </>
  );
}
