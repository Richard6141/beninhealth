"use client";

import { useActionState, useId, useRef, useState } from "react";
import {
  saisirResultatExamenAction,
  type ExamenResume,
  type LaboratoireActionState,
} from "@/modules/laboratoire/actions";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Modal, type ModalHandle } from "@/components/ui/Modal";

const etatInitial: LaboratoireActionState = { error: null, success: false };

/**
 * Champ texte multiligne libre pour le resultat d'examen : le design system
 * (src/components/ui) ne fournit pas de composant "textarea" dedie, seul
 * TextField existe et ne gere que <input>. Reprend la structure visuelle de
 * TextField (label, jetons de style) autour d'un <textarea> natif, comme deja
 * fait localement ailleurs dans le projet (src/app/app/patient/dossier/
 * FormulaireDossier.tsx, src/app/app/ministere/ChampTextarea.tsx).
 */
function ChampResultat() {
  const fieldId = useId();

  return (
    <div className="flex flex-col gap-1.5">
      <label
        htmlFor={fieldId}
        className="flex flex-wrap items-baseline gap-1.5 text-[18px] font-semibold text-encre"
      >
        Resultat
        <span className="text-critique" aria-hidden="true">
          *
        </span>
      </label>
      <textarea
        id={fieldId}
        name="resultat"
        rows={6}
        required
        placeholder="Valeurs mesurees, observations, conclusion..."
        className="w-full resize-y rounded-champ border border-bordure-forte bg-surface px-3 py-2 text-[16px] text-encre transition-colors motion-reduce:transition-none placeholder:text-encre-attenuee focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2"
      />
    </div>
  );
}

/**
 * Contenu du formulaire de saisie, isole a part (remonte via la prop "key" du
 * parent a chaque fermeture de la modale) pour repartir d'un useActionState
 * neuf a chaque ouverture, plutot que de conserver l'ecran de succes
 * precedent affiche (meme pattern que FormulaireAjoutPersonnel).
 */
function ContenuFormulaire({
  examen,
  onFermer,
}: {
  examen: ExamenResume;
  onFermer: () => void;
}) {
  const [state, formAction, pending] = useActionState(
    saisirResultatExamenAction,
    etatInitial
  );

  if (state.success) {
    return (
      <div className="flex flex-col gap-4">
        <Alert level="success" title="Resultat enregistre">
          Le resultat de l&apos;examen a bien ete enregistre.
        </Alert>
        <Button type="button" variant="secondary" className="w-fit" onClick={onFermer}>
          Fermer
        </Button>
      </div>
    );
  }

  return (
    <form action={formAction} aria-busy={pending} className="flex flex-col gap-5">
      <input type="hidden" name="examenId" value={examen.id} />

      {state.error ? (
        <Alert level="critical" title="Enregistrement impossible">
          {state.error}
        </Alert>
      ) : null}

      <div className="flex flex-col gap-1 rounded-champ border border-bordure bg-plan px-3 py-2">
        <p className="text-[14px] font-semibold text-encre">
          {examen.patientNomComplet ?? "Patient non precise"}
        </p>
        <p className="text-[13px] text-encre-attenuee">
          {examen.patientIdentifiantSante ?? "Identifiant sante non precise"}
        </p>
        <p className="text-[13px] text-encre-secondaire">{examen.typeExamen}</p>
      </div>

      <ChampResultat />

      <Button type="submit" variant="primary" className="w-fit" disabled={pending}>
        {pending ? "Enregistrement en cours..." : "Enregistrer le resultat"}
      </Button>
    </form>
  );
}

/**
 * Bouton "Saisir le resultat" + modale de saisie
 * (saisirResultatExamenAction, module laboratoire/actions, autre agent).
 * A la fermeture de la modale, la cle du contenu change pour repartir d'un
 * formulaire vierge a la prochaine ouverture.
 */
export function FormulaireResultat({ examen }: { examen: ExamenResume }) {
  const modalRef = useRef<ModalHandle>(null);
  const [cle, setCle] = useState(0);

  return (
    <>
      <Button
        type="button"
        variant="secondary"
        className="w-fit"
        onClick={() => modalRef.current?.showModal()}
      >
        Saisir le resultat
      </Button>
      <Modal
        ref={modalRef}
        width="wide"
        title="Saisir le resultat"
        description={`${examen.typeExamen}, ${examen.patientNomComplet ?? "patient non precise"}`}
        onClose={() => setCle((valeur) => valeur + 1)}
      >
        <ContenuFormulaire key={cle} examen={examen} onFermer={() => modalRef.current?.close()} />
      </Modal>
    </>
  );
}
