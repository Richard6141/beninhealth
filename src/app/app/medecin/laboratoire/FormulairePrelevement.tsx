"use client";

import { useActionState, useRef, useState } from "react";
import {
  enregistrerPrelevementAction,
  rejeterEchantillonAction,
  type ExamenResume,
  type LaboratoireActionState,
} from "@/modules/laboratoire/actions";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Modal, type ModalHandle } from "@/components/ui/Modal";
import { SelectField } from "@/components/ui/SelectField";
import { TextField } from "@/components/ui/TextField";

const etatInitial: LaboratoireActionState = { error: null, success: false };

const OPTIONS_TYPE_ECHANTILLON = [
  { value: "sang_veineux", label: "Sang veineux" },
  { value: "sang_capillaire", label: "Sang capillaire" },
  { value: "urine", label: "Urine" },
  { value: "selles", label: "Selles" },
  { value: "autre", label: "Autre" },
];

const OPTIONS_MOTIF_REJET = [
  { value: "hemolyse", label: "Hémolysé" },
  { value: "quantite_insuffisante", label: "Quantité insuffisante" },
  { value: "mauvais_tube", label: "Mauvais tube" },
  { value: "delai_depasse", label: "Délai dépassé" },
  { value: "etiquetage_incorrect", label: "Étiquetage incorrect" },
];

function ContenuPrelevement({ examen, onFermer }: { examen: ExamenResume; onFermer: () => void }) {
  const [state, formAction, pending] = useActionState(enregistrerPrelevementAction, etatInitial);
  const [identiteVerifiee, setIdentiteVerifiee] = useState(false);

  if (state.success) {
    return (
      <div className="flex flex-col gap-4">
        <Alert level="success" title="Prélèvement enregistré">
          L&apos;examen passe à l&apos;état « En cours », prêt pour la saisie du résultat.
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
          {examen.patientNomComplet ?? "Patient non précisé"}
        </p>
        <p className="text-[13px] text-encre-attenuee">
          Né(e) le : à vérifier sur pièce d&apos;identité avant de continuer
        </p>
      </div>

      <label className="flex items-start gap-2.5 text-[14px] text-encre">
        <input
          type="checkbox"
          name="identiteVerifiee"
          value="true"
          checked={identiteVerifiee}
          onChange={(event) => setIdentiteVerifiee(event.target.checked)}
          className="mt-0.5 h-4 w-4 shrink-0 accent-marine"
        />
        J&apos;ai vérifié l&apos;identité du patient (nom, date de naissance)
      </label>

      <SelectField
        label="Type d'échantillon"
        name="typeEchantillon"
        required
        options={OPTIONS_TYPE_ECHANTILLON}
        placeholder="Choisir un type"
      />
      <TextField
        label="Identifiant de l'échantillon"
        name="identifiantEchantillon"
        required
        placeholder="Ex. étiquette EX-2026-00123"
      />

      <Button type="submit" variant="primary" className="w-fit" disabled={pending || !identiteVerifiee}>
        {pending ? "Enregistrement..." : "Enregistrer le prélèvement"}
      </Button>
    </form>
  );
}

function ContenuRejet({ examen, onFermer }: { examen: ExamenResume; onFermer: () => void }) {
  const [state, formAction, pending] = useActionState(rejeterEchantillonAction, etatInitial);

  if (state.success) {
    return (
      <div className="flex flex-col gap-4">
        <Alert level="success" title="Échantillon rejeté">
          L&apos;examen revient à l&apos;état « Demande ». Le prescripteur et le patient ont été
          notifiés qu&apos;un nouveau prélèvement est nécessaire.
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
        <Alert level="critical" title="Rejet impossible">
          {state.error}
        </Alert>
      ) : null}

      <SelectField
        label="Motif du rejet"
        name="motifRejetEchantillon"
        required
        options={OPTIONS_MOTIF_REJET}
        placeholder="Choisir un motif"
      />

      <Button type="submit" variant="danger" className="w-fit" disabled={pending}>
        {pending ? "Rejet en cours..." : "Rejeter l'échantillon"}
      </Button>
    </form>
  );
}

/**
 * Actions de prélèvement (F-LAB-02 du pack) : sur une demande non encore
 * prélevée, propose "Enregistrer le prélèvement" (identité vérifiée + type
 * et identifiant d'échantillon) ; sur un examen déjà prélevé, propose en
 * plus "Rejeter l'échantillon" à côté du bouton existant "Saisir le
 * résultat" (FormulaireResultat, inchangé). Choix assumé : le prélèvement
 * n'est pas rendu obligatoire avant la saisie d'un résultat (le bouton
 * existant reste disponible dès "demande"), pour ne pas modifier un
 * comportement déjà construit et testé par une autre session ce soir.
 */
export function FormulairePrelevement({ examen }: { examen: ExamenResume }) {
  const modalRef = useRef<ModalHandle>(null);
  const [cle, setCle] = useState(0);

  if (examen.statut === "demande") {
    return (
      <>
        <Button
          type="button"
          variant="secondary"
          className="w-fit"
          onClick={() => modalRef.current?.showModal()}
        >
          Enregistrer le prélèvement
        </Button>
        <Modal
          ref={modalRef}
          title="Enregistrer le prélèvement"
          description={examen.typeExamen}
          onClose={() => setCle((valeur) => valeur + 1)}
        >
          <ContenuPrelevement key={cle} examen={examen} onFermer={() => modalRef.current?.close()} />
        </Modal>
      </>
    );
  }

  if (examen.statut === "en_cours") {
    return (
      <>
        <Button
          type="button"
          variant="danger"
          className="w-fit"
          onClick={() => modalRef.current?.showModal()}
        >
          Rejeter l&apos;échantillon
        </Button>
        <Modal
          ref={modalRef}
          title="Rejeter l'échantillon"
          description={examen.typeExamen}
          onClose={() => setCle((valeur) => valeur + 1)}
        >
          <ContenuRejet key={cle} examen={examen} onFermer={() => modalRef.current?.close()} />
        </Modal>
      </>
    );
  }

  return null;
}
